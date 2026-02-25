# ──────────────────────────────────────────────
#  Demo data — mirrors the reference screenshot
#  Run with:  python main.py --demo
# ──────────────────────────────────────────────
from __future__ import annotations

import threading
import time
import math

from data_store import DataStore, CarEntry, CarRealtime, DriverInfo, SessionInfo


# ── Static demo entries (matching screenshot) ─

GT3_CARS = [
    # (car_model, race_num, team, drivers, spline_frac)
    (25, 32,  "SHIFT Auto service",    [("Y.", "Zvuzdetskyi")],            0.99),
    (26, 21,  "OKUNI RT",              [("Y.", "Zvuzdetskyi")],            0.97),
    ( 2, 666, "Carhub community",      [("V.", "Taradai"), ("D.", "Sapozhkov")], 0.88),
    ( 2,  1,  "2G Circuit Academy",    [("A.", "Maior"), ("M.", "Geronimus")],   0.92),
    ( 7, 314, "Butthurts Duo",         [("R.", "Slashchov")],              0.96),
    ( 1,   3, "Blacklist RT",          [("I.", "Kudinov"), ("P.", "Kazanin")],   0.98),
    (31,   4, "ACS NA RUKAH",          [("K.", "Maior"), ("O.", "Vasyliev")],    0.94),
    (20, 888, "NoBrakesTeam",          [("N.", "Prokopov")],               0.90),
    (25,  31, "Samir RT",              [("O.", "Zmiuk"), ("I.", "Lishchynskyi")],0.84),
    (25,  33, "FUMO RACING",           [("A.", "Kashyrin")],               0.82),
    ( 2, 555, "Last GT3 Team",         [("D.", "Grytsyuk"), ("M.", "Nasonov")],  0.80),
]

GT4_CARS = [
    # (car_model, race_num, team, drivers, spline_frac, laps_behind)
    (57,  15, "SideAttack",              [("P.", "Polovchuk")],            0.95, 2),
    (51,  43, "UAmateurs BERPLABER",     [("O.", "Berkunskyi")],           0.84, 2),
    (51,   7, "Trident_XTK",            [("Y.", "Artemenko")],            0.90, 2),
    (60,  46, "SimotorsportUA",          [("V.", "Burlaka")],              0.89, 2),
    (59, 110, "RainAllDayHotlapAllNight",[("T.", "Istomin")],              0.74, 2),
    (60,  76, "NOTHOTLAPPERS",           [("I.", "Shot")],                 0.83, 2),
    (60, 257, "Expecto Petronas",        [("D.", "Yaroshenko")],           0.71, 2),
    (60,  39, "AHAXUA Didy",            [("V.", "Abramov")],              0.83, 2),
    (50, 796, "Phyllobates Terribilis",  [("I.", "Melnik")],               0.88, 2),
    (60,  12, "Kabanchik Energy RT",     [("Y.", "Kanaiev")],              0.71, 2),
]


def load_demo_data(store: DataStore) -> None:
    """Populate the store with static demo data then start a live-sim thread."""
    store.update_track("Monza", 5793.0)
    store.set_connected(1)
    store.update_session(SessionInfo(
        session_type=3,
        phase=5,
        session_time=4379.0,   # 01:12:59
        session_end_time=0.0,
    ))

    # ── Car entries ───────────────────────────
    idx = 0
    for model, num, team, drivers, *_ in GT3_CARS:
        entry = CarEntry(
            car_index=idx,
            car_model_type=model,
            team_name=team,
            race_number=num,
            current_driver_index=0,
            drivers=[DriverInfo(first_name=fn, last_name=ln)
                     for fn, ln in drivers],
        )
        store.update_car_entry(entry)
        idx += 1

    for model, num, team, drivers, *_ in GT4_CARS:
        entry = CarEntry(
            car_index=idx,
            car_model_type=model,
            team_name=team,
            race_number=num,
            current_driver_index=0,
            drivers=[DriverInfo(first_name=fn, last_name=ln)
                     for fn, ln in drivers],
        )
        store.update_car_entry(entry)
        idx += 1

    # ── Initial realtime ──────────────────────
    _set_realtimes(store, leader_laps=36)

    # ── Background simulation thread ──────────
    t = threading.Thread(target=_simulate, args=(store,), daemon=True)
    t.start()


def _set_realtimes(store: DataStore, leader_laps: int) -> None:
    """Build CarRealtime entries based on the static spline fractions."""
    overall_pos = 0
    idx = 0

    for _, num, _, _, spline in GT3_CARS:
        overall_pos += 1
        store.update_car_realtime(CarRealtime(
            car_index=idx,
            position=overall_pos,
            cup_position=overall_pos,
            spline_position=spline,
            laps=leader_laps,
            speed_kmh=180.0 + idx * 2,
            last_lap_ms=104000,   # ~1:44
        ))
        idx += 1

    gt4_pos = 0
    for _, num, _, _, spline, laps_behind in GT4_CARS:
        overall_pos += 1
        gt4_pos += 1
        store.update_car_realtime(CarRealtime(
            car_index=idx,
            position=overall_pos,
            cup_position=gt4_pos,
            spline_position=spline,
            laps=leader_laps - laps_behind,
            speed_kmh=160.0 + idx * 1.5,
            last_lap_ms=110000,   # ~1:50
        ))
        idx += 1


def _simulate(store: DataStore) -> None:
    """Slowly advance the session clock and positions to keep the demo alive."""
    t0 = time.time()
    laps = 36
    track_m = 5793.0

    while True:
        elapsed = time.time() - t0
        # Advance session time
        store.session.session_time = 4379.0 + elapsed

        # Gently oscillate spline positions to produce changing gaps
        for ci in list(store.car_realtimes.keys()):
            rt = store.car_realtimes.get(ci)
            if rt is None:
                continue
            drift = math.sin(elapsed * 0.1 + ci * 0.7) * 0.003
            new_spline = (rt.spline_position + 0.00015 + drift) % 1.0
            store.car_realtimes[ci].spline_position = new_spline

        time.sleep(0.25)
