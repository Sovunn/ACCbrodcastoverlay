# ──────────────────────────────────────────────
#  Thread-safe data store + gap computation
# ──────────────────────────────────────────────
from __future__ import annotations

import threading
from dataclasses import dataclass, field
from typing import Dict, List, Optional

from car_data import CLASS_ORDER, get_car_class, get_manufacturer_abbr


# ── Raw data classes ──────────────────────────

@dataclass
class DriverInfo:
    first_name: str = ""
    last_name:  str = ""
    short_name: str = ""
    category:   int = 0   # 0=Bronze 1=Silver 2=Gold 3=Platinum
    nationality: str = ""


@dataclass
class CarEntry:
    car_index:            int  = 0
    car_model_type:       int  = 0
    team_name:            str  = ""
    race_number:          int  = 0
    cup_category:         int  = 0   # 0=Overall 1=ProAm 2=Am 3=Silver 4=National
    current_driver_index: int  = 0
    drivers: List[DriverInfo] = field(default_factory=list)
    nationality:          int  = 0


@dataclass
class CarRealtime:
    car_index:       int   = 0
    driver_index:    int   = 0
    driver_count:    int   = 0
    gear:            int   = 0
    speed_kmh:       float = 0.0
    position:        int   = 0    # overall position (1-based)
    cup_position:    int   = 0
    track_position:  int   = 0
    spline_position: float = 0.0  # 0.0–1.0 along lap
    laps:            int   = 0
    delta:           int   = 0
    best_session_lap_ms: int = -1
    last_lap_ms:     int   = -1
    car_location:    int   = 0    # 0=None 1=Track 2=Pitlane 3=PitEntry 4=PitExit


@dataclass
class SessionInfo:
    session_type:    int   = -1   # -1=unknown 0=Practice 1=Quali 2=Superpole 3=Race
    phase:           int   = 0
    session_time:    float = 0.0  # elapsed or remaining, depending on session
    session_end_time: float = 0.0
    time_of_day:     float = 0.0
    best_session_lap_ms: int = -1


# ── Main store ────────────────────────────────

class DataStore:
    def __init__(self) -> None:
        self._lock = threading.RLock()
        self.connected = False
        self.connection_id = -1
        self.session = SessionInfo()
        self.car_entries:   Dict[int, CarEntry]   = {}
        self.car_realtimes: Dict[int, CarRealtime] = {}
        self.track_name:    str   = ""
        self.track_length:  float = 0.0   # metres

    # ── Writers ───────────────────────────────

    def set_connected(self, connection_id: int) -> None:
        with self._lock:
            self.connected = True
            self.connection_id = connection_id

    def set_disconnected(self) -> None:
        with self._lock:
            self.connected = False
            self.connection_id = -1

    def update_session(self, session: SessionInfo) -> None:
        with self._lock:
            self.session = session

    def update_car_entry(self, entry: CarEntry) -> None:
        with self._lock:
            self.car_entries[entry.car_index] = entry

    def update_car_realtime(self, rt: CarRealtime) -> None:
        with self._lock:
            self.car_realtimes[rt.car_index] = rt

    def update_track(self, name: str, length_m: float) -> None:
        with self._lock:
            self.track_name   = name
            self.track_length = length_m

    # ── Readers ───────────────────────────────

    def get_standings(self) -> dict:
        """
        Returns a dict ready for the overlay / web renderer:
        {
          "connected": bool,
          "session":   { type, phase, session_time, ... },
          "track":     { name, length_m },
          "classes": {
              "GT3": [ { car_index, race_number, team_name, driver_text,
                          manufacturer_abbr, class_position,
                          laps, spline, speed_kmh, gap_text, gap_laps,
                          in_pit }, ... ],
              "GT4": [ ... ],
          }
        }
        """
        with self._lock:
            session = self.session
            track_length = self.track_length

            # Build combined list
            all_cars: List[dict] = []
            for ci, rt in self.car_realtimes.items():
                entry = self.car_entries.get(ci)
                if entry is None:
                    continue
                all_cars.append({"car_index": ci, "entry": entry, "rt": rt})

            # Sort by overall position (ties broken by spline desc)
            all_cars.sort(key=lambda c: (
                c["rt"].position if c["rt"].position > 0 else 9999,
                -c["rt"].spline_position,
            ))

            # Find overall race leader
            overall_leader = all_cars[0] if all_cars else None

            # Group by class
            grouped: Dict[str, List[dict]] = {}
            for c in all_cars:
                cls = get_car_class(c["entry"].car_model_type)
                grouped.setdefault(cls, []).append(c)

            # Build output dict for each class
            out_classes: Dict[str, list] = {}
            for cls in CLASS_ORDER:
                cars = grouped.get(cls, [])
                if not cars:
                    continue

                # Class leader = first car in already-sorted list
                class_leader = cars[0]

                rendered = []
                for i, c in enumerate(cars):
                    entry: CarEntry  = c["entry"]
                    rt:    CarRealtime = c["rt"]

                    # Driver text
                    driver_text = _build_driver_text(entry)

                    # Gap
                    if i == 0:
                        if (overall_leader is not None
                                and overall_leader["car_index"] != c["car_index"]):
                            gap_text, gap_laps = _compute_gap(
                                c, overall_leader, track_length, prefix="+"
                            )
                        else:
                            gap_text, gap_laps = "LEADER", 0
                    else:
                        gap_text, gap_laps = _compute_gap(
                            c, class_leader, track_length, prefix="+"
                        )

                    rendered.append({
                        "car_index":        c["car_index"],
                        "race_number":      entry.race_number,
                        "team_name":        entry.team_name,
                        "driver_text":      driver_text,
                        "manufacturer_abbr": get_manufacturer_abbr(entry.car_model_type),
                        "car_model_type":   entry.car_model_type,
                        "class_position":   i + 1,
                        "overall_position": rt.position,
                        "laps":             rt.laps,
                        "spline":           rt.spline_position,
                        "speed_kmh":        rt.speed_kmh,
                        "gap_text":         gap_text,
                        "gap_laps":         gap_laps,
                        "in_pit":           rt.car_location in (2, 3, 4),
                        "last_lap_ms":      rt.last_lap_ms,
                    })

                out_classes[cls] = rendered

            return {
                "connected": self.connected,
                "session": {
                    "type":         session.session_type,
                    "phase":        session.phase,
                    "session_time": session.session_time,
                    "session_end_time": session.session_end_time,
                },
                "track": {
                    "name":     self.track_name,
                    "length_m": track_length,
                },
                "classes": out_classes,
            }


# ── Helpers ───────────────────────────────────

def _build_driver_text(entry: CarEntry) -> str:
    if not entry.drivers:
        return ""
    parts = []
    for d in entry.drivers:
        fn = d.first_name.strip()
        ln = d.last_name.strip()
        if fn:
            parts.append(f"{fn[0]}. {ln}")
        else:
            parts.append(ln)
    return " / ".join(parts)


def _compute_gap(
    behind: dict,
    ahead:  dict,
    track_length: float,
    prefix: str = "+",
) -> tuple[str, int]:
    """
    Returns (gap_text, lap_diff).
    gap_text examples: "LEADER", "+1.5", "+1L"
    """
    b_rt: CarRealtime = behind["rt"]
    a_rt: CarRealtime = ahead["rt"]

    lap_diff = a_rt.laps - b_rt.laps

    if lap_diff >= 1:
        return f"{prefix}{lap_diff}L", lap_diff

    # Same lap — estimate seconds using last lap time
    spline_diff = a_rt.spline_position - b_rt.spline_position
    if spline_diff < 0:
        spline_diff += 1.0   # ahead just crossed the line

    if spline_diff <= 0.0001:
        return f"{prefix}0.0", 0

    # Use car's own last lap time as reference (most reliable)
    if b_rt.last_lap_ms > 5000:
        gap_s = spline_diff * (b_rt.last_lap_ms / 1000.0)
    elif track_length > 100:
        speed_ms = max(b_rt.speed_kmh / 3.6, 40.0)
        gap_s = (spline_diff * track_length) / speed_ms
    else:
        gap_s = spline_diff * 120.0   # Rough: 2-min lap

    if gap_s >= 3600:
        return f"{prefix}{gap_s/3600:.1f}h", 0
    if gap_s >= 60:
        m = int(gap_s) // 60
        s = gap_s - m * 60
        return f"{prefix}{m}:{s:04.1f}", 0
    return f"{prefix}{gap_s:.1f}", 0
