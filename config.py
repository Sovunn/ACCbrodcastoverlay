# ──────────────────────────────────────────────
#  ACC Overlay — Configuration
# ──────────────────────────────────────────────

# ── ACC UDP Broadcast connection ──────────────
ACC_HOST = "127.0.0.1"          # Same PC as ACC
ACC_PORT = 9000                  # Default ACC broadcast port
CONNECTION_PASSWORD = ""         # Leave empty for most servers
COMMAND_PASSWORD = ""
UPDATE_INTERVAL_MS = 250         # How often ACC sends updates (ms)

# ── Overlay window ────────────────────────────
OVERLAY_X = 20                   # Initial X position (pixels from left)
OVERLAY_Y = 20                   # Initial Y position (pixels from top)
OVERLAY_OPACITY = 0.92           # 0.0 = invisible, 1.0 = opaque

# ── Web server (OBS browser source) ──────────
WEB_HOST = "127.0.0.1"
WEB_PORT = 5000                  # Open http://127.0.0.1:5000 in OBS

# ── What classes to display ──────────────────
SHOW_GT3 = True
SHOW_GT4 = True
SHOW_CUP = False
SHOW_ST  = False
MAX_CARS_PER_CLASS = 20
