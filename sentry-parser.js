/* HC-06 text protocol. A complete validated frame is required before publishing. */
(function (root) {
  "use strict";
  function parseFrame(lines) {
    const fields = {};
    for (const line of lines) {
      const match = line.match(/^([^:]+):\s*(.*)$/);
      if (match) {
        if (Object.prototype.hasOwnProperty.call(fields, match[1])) return null;
        fields[match[1]] = match[2];
      }
    }
    const number = (key, unit, min, max) => {
      const raw = fields[key];
      if (raw === "ERROR") return null;
      if (typeof raw !== "string" || !new RegExp("^-?\\d+(?:\\.\\d+)? " + unit + "$").test(raw)) throw new Error("Invalid reading");
      const value = Number(raw.slice(0, -unit.length).trim());
      if (!Number.isFinite(value) || value < min || value > max) throw new Error("Invalid range");
      return value;
    };
    try {
      if (!["OPEN", "CLOSED"].includes(fields["Door Status"]) ||
          !["TILTED", "NORMAL"].includes(fields["Tilt Status"]) ||
          !["DETECTED", "NOT DETECTED"].includes(fields["Bottle Position"]) ||
          !["ON", "OFF"].includes(fields.Buzzer) ||
          !["NORMAL", "CHECK REQUIRED"].includes(fields["System Status"]) ||
          !/^\d+ sec$/.test(fields.Uptime || "")) return null;
      return {
        temp: number("Temperature", "C", -40, 100),
        humidity: number("Humidity", "%", 0, 100),
        open: fields["Door Status"] === "OPEN",
        tiltStatus: fields["Tilt Status"] === "TILTED" ? "tilted" : "upright",
        irDetected: fields["Bottle Position"] === "DETECTED",
        buzzer: fields.Buzzer === "ON",
        firmwareWarning: fields["System Status"] === "CHECK REQUIRED",
        uptime: Number(fields.Uptime.split(" ")[0])
      };
    } catch (_) { return null; }
  }
  class FrameParser {
    constructor(onFrame) { this.onFrame = onFrame; this.reset(); }
    reset() { this.buffer = ""; this.lines = null; this.started = 0; this.discardLine = false; }
    push(chunk, now = Date.now()) {
      if (this.lines && now - this.started > 5000) this.lines = null;
      for (const char of chunk) {
        if (char === "\n") {
          if (!this.discardLine) this.line(this.buffer.replace(/\r$/, ""), now);
          this.buffer = ""; this.discardLine = false;
        } else if (!this.discardLine) {
          this.buffer += char;
          if (this.buffer.length > 1024) {
            this.buffer = ""; this.lines = null; this.discardLine = true;
          }
        }
      }
    }
    line(line, now) {
      if (line === "======= SENTRY =======") { this.lines = []; this.started = now; return; }
      if (!this.lines) return;
      if (line === "======================") {
        const lines = this.lines; this.lines = null;
        const data = parseFrame(lines);
        if (data) this.onFrame(data, ["======= SENTRY =======", ...lines, line].join("\n"));
      } else {
        this.lines.push(line);
        if (this.lines.length > 24) this.lines = null;
      }
    }
  }
  root.SentryProtocol = { parseFrame, FrameParser };
  if (typeof module !== "undefined" && module.exports) module.exports = root.SentryProtocol;
})(typeof window !== "undefined" ? window : globalThis);
