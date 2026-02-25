#!/usr/bin/env python3
# ──────────────────────────────────────────────
#  ACC Multiclass Racing Overlay
#
#  Usage:
#    python main.py                # live ACC + overlay + web server
#    python main.py --demo         # demo data (no ACC needed)
#    python main.py --no-overlay   # web server only (for OBS, no Tkinter)
#    python main.py --no-web       # overlay only (no Flask)
#
#  OBS Browser Source: http://127.0.0.1:5000
#  Right-click overlay to close it.
# ──────────────────────────────────────────────

import argparse
import sys
import threading


def main() -> None:
    parser = argparse.ArgumentParser(description="ACC Multiclass Standings Overlay")
    parser.add_argument("--demo",       action="store_true",
                        help="Use built-in demo data (no ACC connection needed)")
    parser.add_argument("--no-overlay", action="store_true",
                        help="Skip the Tkinter transparent overlay")
    parser.add_argument("--no-web",     action="store_true",
                        help="Skip the Flask OBS web server")
    args = parser.parse_args()

    import config
    from data_store import DataStore

    store = DataStore()

    # ── Data source ───────────────────────────
    if args.demo:
        print("[Main] Demo mode — using fake data")
        from demo_data import load_demo_data
        load_demo_data(store)
    else:
        from acc_udp import ACCUDPClient
        client = ACCUDPClient(
            data_store          = store,
            host                = config.ACC_HOST,
            port                = config.ACC_PORT,
            connection_password = config.CONNECTION_PASSWORD,
            command_password    = config.COMMAND_PASSWORD,
            update_interval_ms  = config.UPDATE_INTERVAL_MS,
        )
        client.start()
        print(f"[Main] Connecting to ACC at {config.ACC_HOST}:{config.ACC_PORT} …")

    # ── Web server (background thread) ────────
    if not args.no_web:
        from web_server import create_app
        app = create_app(store)

        def run_flask() -> None:
            import logging
            log = logging.getLogger("werkzeug")
            log.setLevel(logging.ERROR)   # silence request logs
            app.run(
                host=config.WEB_HOST,
                port=config.WEB_PORT,
                debug=False,
                use_reloader=False,
                threaded=True,
            )

        web_thread = threading.Thread(target=run_flask, daemon=True, name="flask")
        web_thread.start()
        print(f"[Main] OBS source → http://{config.WEB_HOST}:{config.WEB_PORT}")

    # ── Tkinter overlay (must run on main thread) ──
    if not args.no_overlay:
        try:
            import tkinter  # noqa: F401
        except ModuleNotFoundError:
            print("[Main] tkinter is not available. Install it or run with --no-overlay.")
            if not args.no_web:
                try:
                    web_thread.join()
                except KeyboardInterrupt:
                    pass
            sys.exit(1)

        from overlay import ACCOverlay
        print("[Main] Overlay open — drag to move, right-click to close")
        ov = ACCOverlay(store)
        ov.run()          # blocks until window is closed

    else:
        # No overlay — keep alive until Ctrl+C
        print("[Main] Running headless. Press Ctrl+C to quit.")
        try:
            if not args.no_web:
                web_thread.join()
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
