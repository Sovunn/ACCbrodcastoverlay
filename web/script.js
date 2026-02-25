// ──────────────────────────────────────────────
//  ACC Multiclass Overlay — live update script
// ──────────────────────────────────────────────

const SESSION_LABELS = {
  "-1": "ACC", 0: "PRACTICE", 1: "QUALIFYING",
   2: "SUPERPOLE", 3: "RACE", 4: "QUALIFYING"
};
const CLASS_ORDER = ["GT3", "GT4", "CUP", "ST", "TCX"];

// ── Helpers ───────────────────────────────────

function fmtTime(secs) {
  if (secs < 0) secs = 0;
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  if (h > 0) return `${pad2(h)}:${pad2(m)}:${pad2(s)}`;
  return `${pad2(m)}:${pad2(s)}`;
}

function pad2(n) { return String(n).padStart(2, "0"); }

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// ── Render ────────────────────────────────────

function render(data) {
  // Session header
  const sType = SESSION_LABELS[data.session.type] ?? "RACE";
  document.getElementById("session-type").textContent = sType;
  document.getElementById("session-time").textContent =
    fmtTime(data.session.sessionTime);
  document.getElementById("track-name").textContent =
    (data.track.name || "").toUpperCase();

  const container = document.getElementById("standings");

  if (!data.connected) {
    container.innerHTML = `<div class="waiting">Waiting for ACC …</div>`;
    return;
  }

  let html = "";

  for (const cls of CLASS_ORDER) {
    const cars = data.classes[cls];
    if (!cars || cars.length === 0) continue;

    const clsLower = cls.toLowerCase();

    html += `<div class="class-section class-${clsLower}">`;
    html += `<div class="class-header ${clsLower}">
               <span class="class-label">| ${esc(cls)} CLASS</span>
             </div>`;

    for (const car of cars) {
      const pitClass  = car.inPit ? " in-pit" : "";
      const gapClass  = car.gapText === "LEADER" ? "leader"
                      : (car.gapLaps > 0 || car.gapText.includes("L")) ? "lapped"
                      : "";

      html += `
        <div class="car-row${pitClass}">
          <div class="pos-badge">${esc(car.classPosition)}</div>
          <div class="info">
            <div class="driver-name">${esc(car.driverText)}</div>
            <div class="team-name">${esc(car.teamName)}</div>
            ${car.inPit ? '<div class="pit-label">PIT</div>' : ""}
          </div>
          <div class="mfr">${esc(car.manufacturerAbbr)}</div>
          <div class="car-num">
            <div class="car-num-inner">${esc(car.raceNumber)}</div>
          </div>
          <div class="gap ${gapClass}">${esc(car.gapText)}</div>
        </div>`;
    }

    html += `</div>`; // .class-section
  }

  container.innerHTML = html;
}

// ── SSE connection ────────────────────────────

function connect() {
  const src = new EventSource("/stream");

  src.onmessage = (evt) => {
    try {
      render(JSON.parse(evt.data));
    } catch (e) {
      console.error("Parse error:", e);
    }
  };

  src.onerror = () => {
    src.close();
    console.warn("SSE lost — reconnecting in 3 s");
    setTimeout(connect, 3000);
  };
}

connect();
