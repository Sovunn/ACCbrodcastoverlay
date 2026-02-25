# ──────────────────────────────────────────────
#  Flask web server — OBS browser source
#  Open http://127.0.0.1:5000 in OBS
# ──────────────────────────────────────────────
from __future__ import annotations

import json
import os
import time
from typing import Generator

from flask import Flask, Response, render_template_string

from data_store import DataStore

_HERE = os.path.dirname(os.path.abspath(__file__))


def create_app(store: DataStore) -> Flask:
    app = Flask(__name__, static_folder=os.path.join(_HERE, "web"),
                static_url_path="/static")

    # ── Main page ─────────────────────────────
    @app.route("/")
    def index():
        with open(os.path.join(_HERE, "web", "index.html"), encoding="utf-8") as f:
            return f.read()

    # ── SSE data stream ───────────────────────
    @app.route("/stream")
    def stream():
        def generate() -> Generator:
            while True:
                payload = json.dumps(store.get_standings())
                yield f"data: {payload}\n\n"
                time.sleep(0.25)

        return Response(
            generate(),
            mimetype="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "X-Accel-Buffering": "no",
            },
        )

    # ── JSON snapshot (for debugging) ─────────
    @app.route("/api/standings")
    def standings_json():
        return Response(
            json.dumps(store.get_standings(), indent=2),
            mimetype="application/json",
        )

    return app
