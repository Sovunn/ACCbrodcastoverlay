# ──────────────────────────────────────────────
#  ACC Multiclass Overlay — Tkinter window
#  Transparent, always-on-top, draggable
# ──────────────────────────────────────────────
from __future__ import annotations

import tkinter as tk
from typing import Optional

import config
from car_data import CLASS_COLORS, CLASS_ORDER
from data_store import DataStore

# ── Colour palette ────────────────────────────
BG_TRANS   = "#010101"   # treated as transparent by Windows
BG_SESSION = "#111111"
BG_CLASS_H = "#0d0d0d"
BG_ROW_ODD = "#1c1c1c"
BG_ROW_EVN = "#161616"
BG_PIT     = "#1a1a00"   # yellowish tint when in pit
BG_NUM_BOX = "#ffffff"

C_WHITE    = "#ffffff"
C_DRIVER   = "#999999"
C_GAP      = "#ff9900"
C_GAP_LAPS = "#ff4444"
C_GAP_LEAD = "#ffffff"
C_PIT      = "#ffcc00"
C_NUM      = "#111111"
C_MANU     = "#cccccc"

# ── Fonts ─────────────────────────────────────
F_SESSION  = ("Segoe UI", 10, "bold")
F_CLASS_H  = ("Segoe UI", 9,  "bold")
F_TEAM     = ("Segoe UI", 11, "bold")
F_DRIVER   = ("Segoe UI", 8)
F_POS      = ("Segoe UI", 12, "bold")
F_GAP      = ("Segoe UI", 10, "bold")
F_NUM      = ("Segoe UI", 10, "bold")
F_PIT_LBL  = ("Segoe UI", 7,  "bold")

# ── Layout constants (pixels) ─────────────────
ROW_H      = 46
HEADER_H   = 24
SESSION_H  = 28
PAD        = 3

POS_W      = 38
INFO_W     = 210
LOGO_W     = 40
NUM_W      = 46
GAP_W      = 72
TOTAL_W    = POS_W + INFO_W + LOGO_W + NUM_W + GAP_W + PAD * 4


# ── Session type / phase labels ───────────────
SESSION_LABELS = {-1: "ACC", 0: "PRACTICE", 1: "QUALIFYING",
                   2: "SUPERPOLE", 3: "RACE", 4: "HOTLAP"}
PHASE_LABELS   = {0: "", 1: "STARTING", 2: "PRE-FORM", 3: "FORM LAP",
                   4: "PRE-SESSION", 5: "", 6: "SESSION OVER",
                   7: "POST SESSION", 8: "RESULTS"}


class ACCOverlay:
    def __init__(self, data_store: DataStore) -> None:
        self.store = data_store
        self._root = tk.Tk()
        self._setup_window()
        self._schedule_update()

    # ── Window setup ──────────────────────────

    def _setup_window(self) -> None:
        root = self._root
        root.overrideredirect(True)
        root.wm_attributes("-topmost",         True)
        root.wm_attributes("-alpha",           config.OVERLAY_OPACITY)
        root.wm_attributes("-transparentcolor", BG_TRANS)
        root.configure(bg=BG_TRANS)
        root.geometry(f"+{config.OVERLAY_X}+{config.OVERLAY_Y}")

        self._canvas = tk.Canvas(
            root, bg=BG_TRANS, highlightthickness=0,
            width=TOTAL_W, height=SESSION_H,
        )
        self._canvas.pack()

        # Drag-to-move
        self._canvas.bind("<ButtonPress-1>",  self._drag_start)
        self._canvas.bind("<B1-Motion>",      self._drag_move)
        # Right-click → close
        self._canvas.bind("<ButtonPress-3>",  lambda _: root.destroy())

        self._drag_x = self._drag_y = 0
        self._win_x  = config.OVERLAY_X
        self._win_y  = config.OVERLAY_Y

    def _drag_start(self, event: tk.Event) -> None:
        self._drag_x = event.x_root
        self._drag_y = event.y_root
        self._win_x  = self._root.winfo_x()
        self._win_y  = self._root.winfo_y()

    def _drag_move(self, event: tk.Event) -> None:
        dx = event.x_root - self._drag_x
        dy = event.y_root - self._drag_y
        self._root.geometry(f"+{self._win_x+dx}+{self._win_y+dy}")

    # ── Update loop ───────────────────────────

    def _schedule_update(self) -> None:
        self._draw()
        self._root.after(250, self._schedule_update)

    def run(self) -> None:
        self._root.mainloop()

    # ── Drawing ───────────────────────────────

    def _draw(self) -> None:
        c   = self._canvas
        c.delete("all")
        data = self.store.get_standings()

        y = 0
        y = self._draw_session_header(c, y, data)

        if not data["connected"]:
            self._draw_waiting(c, y)
            y += ROW_H
        else:
            for cls in CLASS_ORDER:
                cars = data["classes"].get(cls)
                if not cars:
                    continue
                if cls == "GT3"  and not config.SHOW_GT3:  continue
                if cls == "GT4"  and not config.SHOW_GT4:  continue
                if cls == "CUP"  and not config.SHOW_CUP:  continue
                if cls == "ST"   and not config.SHOW_ST:   continue
                y = self._draw_class(c, y, cls, cars)

        # Resize canvas & window
        c.configure(width=TOTAL_W, height=y)
        self._root.geometry(f"{TOTAL_W}x{y}")

    # ── Session header ────────────────────────

    def _draw_session_header(self, c: tk.Canvas, y: int, data: dict) -> int:
        w  = TOTAL_W
        h  = SESSION_H
        s  = data["session"]
        sl = SESSION_LABELS.get(s["type"], "RACE")
        pl = PHASE_LABELS.get(s["phase"], "")

        # Format session_time
        t = s["session_time"]
        if t < 0: t = 0
        hours   = int(t) // 3600
        minutes = (int(t) % 3600) // 60
        seconds = int(t) % 60
        if hours:
            time_str = f"{hours:02d}:{minutes:02d}:{seconds:02d}"
        else:
            time_str = f"{minutes:02d}:{seconds:02d}"

        # Track name
        track = data["track"]["name"]
        if track:
            label = f"{sl}  {time_str}  {track.upper()}"
        else:
            label = f"{sl}  {time_str}"
        if pl:
            label += f"  [{pl}]"

        c.create_rectangle(0, y, w, y+h, fill=BG_SESSION, outline="")
        c.create_text(8, y + h//2, text=label,
                      anchor="w", fill=C_WHITE, font=F_SESSION)
        return y + h

    # ── Waiting placeholder ───────────────────

    def _draw_waiting(self, c: tk.Canvas, y: int) -> None:
        c.create_rectangle(0, y, TOTAL_W, y+ROW_H, fill=BG_ROW_ODD, outline="")
        c.create_text(TOTAL_W//2, y+ROW_H//2,
                      text="Waiting for ACC …",
                      fill=C_DRIVER, font=F_TEAM, anchor="center")

    # ── Class section ─────────────────────────

    def _draw_class(self, c: tk.Canvas, y: int, cls: str, cars: list) -> int:
        w       = TOTAL_W
        accent  = CLASS_COLORS.get(cls, "#cc0000")
        max_n   = config.MAX_CARS_PER_CLASS

        # Class header
        c.create_rectangle(0, y, w, y+HEADER_H, fill=BG_CLASS_H, outline="")
        c.create_rectangle(0, y, 4, y+HEADER_H, fill=accent, outline="")
        c.create_text(10, y+HEADER_H//2,
                      text=f"| {cls} CLASS",
                      anchor="w", fill=C_WHITE, font=F_CLASS_H)
        y += HEADER_H

        for car in cars[:max_n]:
            y = self._draw_car_row(c, y, car, accent)

        return y

    # ── Single car row ────────────────────────

    def _draw_car_row(self, c: tk.Canvas, y: int, car: dict, accent: str) -> int:
        w    = TOTAL_W
        h    = ROW_H
        pos  = car["class_position"]
        in_pit = car["in_pit"]

        # Row background
        if in_pit:
            bg = BG_PIT
        elif pos % 2 == 1:
            bg = BG_ROW_ODD
        else:
            bg = BG_ROW_EVN
        c.create_rectangle(0, y, w, y+h, fill=bg, outline="")

        x = 0

        # Position badge
        c.create_rectangle(x, y, x+POS_W, y+h, fill=accent, outline="")
        c.create_text(x+POS_W//2, y+h//2,
                      text=str(pos),
                      fill=C_WHITE, font=F_POS, anchor="center")
        x += POS_W + PAD

        # Driver / Team text
        driver_y = y + 13
        team_y   = y + 32
        team_txt = (car["team_name"] or "")[:23]
        drv_txt  = (car["driver_text"] or "")[:30]

        c.create_text(x+2, driver_y, text=drv_txt,
                      anchor="w", fill=C_DRIVER, font=F_DRIVER)
        c.create_text(x+2, team_y, text=team_txt,
                      anchor="w", fill=C_WHITE, font=F_TEAM)

        # PIT label
        if in_pit:
            c.create_text(x+INFO_W-4, y+h//2, text="PIT",
                          anchor="e", fill=C_PIT, font=F_PIT_LBL)

        x += INFO_W + PAD

        # Manufacturer abbreviation (logo area)
        mfr = car.get("manufacturer_abbr", "")
        c.create_text(x+LOGO_W//2, y+h//2,
                      text=mfr, fill=C_MANU, font=("Segoe UI", 8, "bold"),
                      anchor="center")
        x += LOGO_W + PAD

        # Car number box
        nb = PAD + 1
        c.create_rectangle(x+nb, y+nb, x+NUM_W-nb, y+h-nb,
                           fill=BG_NUM_BOX, outline="")
        c.create_text(x+NUM_W//2, y+h//2,
                      text=str(car["race_number"]),
                      fill=C_NUM, font=F_NUM, anchor="center")
        x += NUM_W + PAD

        # Gap text
        gap  = car["gap_text"]
        glaps= car["gap_laps"]
        if gap == "LEADER":
            gc = C_GAP_LEAD
        elif glaps > 0 or "L" in gap:
            gc = C_GAP_LAPS
        else:
            gc = C_GAP

        c.create_text(x+GAP_W//2, y+h//2,
                      text=gap, fill=gc, font=F_GAP, anchor="center")

        return y + h
