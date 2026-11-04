/* SENTRY HC-05 receiver for paired Bluetooth Classic SPP devices (Web Serial).
   The public GitHub Pages site never contains API keys or uploads data to a server.
   Sensor readings are stored separately from registered reagent data. */
(() => {
  "use strict";
  const DATA_KEY = "sentry-hc05-readings-v1";
  const SELECT_KEY = "sentry-hc05-reagent-v1";
  const REG_KEY = "sentry-reagents-v1";
  const BAUD_RATE = 9600; // Must match bluetooth.begin(9600) in the Arduino sketch.
  const DATA_INTERVAL = 300000; // Arduino sends a packet every five minutes.
  const FRESH_FOR = DATA_INTERVAL + 120000; // Two-minute tolerance for delayed packets.
  const MAX_BUFFER = 4096;
  const $ = id => document.getElementById(id);
  const listeners = new Set();
  let selectedId = "";
  let readings = {};
  let port = null;
  let reader = null;
  let readTask = null;
  let connecting = false;
  let connected = false;
  let stopping = false;
  let buffer = "";
  let ignoredLines = 0;
  let lastMessage = "";
  let sessionStartedAt = 0;

  try {
    const existing = JSON.parse(localStorage.getItem(DATA_KEY) || "{}");
    if (existing && typeof existing === "object" && !Array.isArray(existing)) readings = existing;
    selectedId = localStorage.getItem(SELECT_KEY) || "";
  } catch (_) { /* Local storage may be restricted; receiving still works. */ }

  function save() {
    try {
      localStorage.setItem(DATA_KEY, JSON.stringify(readings));
      if (selectedId) localStorage.setItem(SELECT_KEY, selectedId);
      else localStorage.removeItem(SELECT_KEY);
    } catch (_) { lastMessage = "수신했지만 브라우저에 저장하지 못했습니다."; }
  }
  function nowLabel(timestamp) {
    return new Date(timestamp).toLocaleString("ko-KR", {year:"numeric", month:"2-digit", day:"2-digit", hour:"2-digit", minute:"2-digit", second:"2-digit"});
  }
  function getRegisteredReagents() {
    try {
      const stored = localStorage.getItem(REG_KEY);
      const list = stored === null ? (window.SENTRY_DEMOS || []) : JSON.parse(stored);
      return Array.isArray(list) ? list.filter(x => x && x.id !== undefined) : [];
    } catch (_) { return Array.isArray(window.SENTRY_DEMOS) ? window.SENTRY_DEMOS : []; }
  }
  function refreshOptions(items = getRegisteredReagents()) {
    const select = $("hc05Reagent");
    if (!select) return;
    const available = new Set(items.map(x => String(x.id)));
    if (selectedId && !available.has(selectedId)) {
      selectedId = "";
      save();
    }
    select.replaceChildren();
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "센서를 연결할 시약 선택";
    select.appendChild(placeholder);
    items.forEach(x => {
      const option = document.createElement("option");
      option.value = String(x.id);
      option.textContent = `${x.name || "이름 없음"} · ${x.location || "보관 위치 미입력"}`;
      select.appendChild(option);
    });
    select.value = selectedId;
  }
  function getState(id) {
    const key = String(id);
    const isSelected = key === selectedId && !!selectedId;
    const record = readings[key];
    const hasReading = !!(record && typeof record.receivedAt === "number" &&
      record.receivedAt <= Date.now() && validPacket(record.data));
    const linked = isSelected || hasReading;
    const fresh = hasReading && connected && isSelected &&
      record.receivedAt >= sessionStartedAt &&
      Date.now() - record.receivedAt < FRESH_FOR;
    return { linked, connected: connected && isSelected, fresh, reading: hasReading ? record.data : null,
      receivedAt: hasReading ? record.receivedAt : null, isSelected };
  }
  function emit() {
    updateControls();
    listeners.forEach(callback => { try { callback(); } catch (e) { console.error("Dashboard update error", e); } });
  }
  function updateControls() {
    const status = $("hc05Status");
    if (!status) return;
    const supported = "serial" in navigator && window.isSecureContext;
    const connectButton = $("hc05Connect");
    const disconnectButton = $("hc05Disconnect");
    if (connectButton) connectButton.disabled = !supported || connected || connecting || !selectedId;
    if (disconnectButton) disconnectButton.disabled = !connected && !connecting;
    const select = $("hc05Reagent");
    if (select) select.disabled = connected || connecting;
    if (!supported) {
      status.textContent = "이 브라우저는 Web Serial을 지원하지 않습니다. PC용 최신 Chrome 또는 Edge의 HTTPS 사이트에서 사용하세요.";
      status.className = "hc05-status hc05-alert";
    } else if (connecting) {
      status.textContent = "HC-05 장치 연결 중…";
      status.className = "hc05-status";
    } else if (connected) {
      status.textContent = "HC-05 연결됨 · 최초 1회 요청 후 5분마다 자동 수신합니다.";
      status.className = "hc05-status hc05-online";
    } else {
      status.textContent = lastMessage || "연결되지 않음 · 실제 센서 데이터만 표시합니다.";
      status.className = "hc05-status";
    }
    const last = $("hc05LastReceived");
    if (last) {
      const state = selectedId ? getState(selectedId) : null;
      last.textContent = state && state.receivedAt
        ? `선택한 시약의 마지막 수신: ${nowLabel(state.receivedAt)} · ${state.fresh ? "최신 수신값" : "과거 수신 기록(현재 측정값 아님)"}`
        : selectedId ? `선택한 시약: 첫 데이터 수신 대기 · 전송 간격 5분` : "연결할 시약을 먼저 선택하세요.";
    }
    const problems = $("hc05InvalidLines");
    if (problems) problems.textContent = ignoredLines ? `무시한 비정상 수신 행: ${ignoredLines}개` : "";
  }
  function validPacket(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    if (value.device !== "SENTRY-01") return false;
    for (const field of ["doorClosed", "tilted", "irDetected", "dhtError", "buzzerOn"]) {
      if (typeof value[field] !== "boolean") return false;
    }
    for (const field of ["temperature", "humidity"]) {
      if (value[field] !== null && (typeof value[field] !== "number" || !Number.isFinite(value[field]))) return false;
    }
    if (value.temperature !== null && (value.temperature < -40 || value.temperature > 100)) return false;
    if (value.humidity !== null && (value.humidity < 0 || value.humidity > 100)) return false;
    if (value.dhtError && (value.temperature !== null || value.humidity !== null)) return false;
    return value.status === "NORMAL" || value.status === "CHECK_REQUIRED";
  }
  function handleLine(line) {
    line = line.trim();
    if (!line) return;
    let packet;
    try { packet = JSON.parse(line); } catch (_) { ignoredLines += 1; updateControls(); return; }
    if (!validPacket(packet)) { ignoredLines += 1; updateControls(); return; }
    if (!selectedId || !getRegisteredReagents().some(x => String(x.id) === selectedId)) {
      lastMessage = "유효한 센서 데이터가 왔지만, 연결할 시약을 선택하지 않아 등록하지 않았습니다.";
      emit();
      return;
    }
    readings[selectedId] = {
      receivedAt: Date.now(),
      data: {
        device: packet.device,
        temperature: packet.temperature,
        humidity: packet.humidity,
        doorClosed: packet.doorClosed,
        tilted: packet.tilted,
        irDetected: packet.irDetected,
        dhtError: packet.dhtError,
        buzzerOn: packet.buzzerOn,
        status: packet.status
      }
    };
    save();
    emit();
  }
  function pushText(chunk) {
    buffer += chunk;
    // Work with newline-delimited JSON; handles packets split across read() calls.
    if (buffer.length > MAX_BUFFER && !buffer.includes("\n")) {
      buffer = "";
      ignoredLines += 1;
      updateControls();
      return;
    }
    let breakAt;
    while ((breakAt = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, breakAt);
      buffer = buffer.slice(breakAt + 1);
      if (line.length <= MAX_BUFFER) handleLine(line);
      else { ignoredLines += 1; updateControls(); }
    }
    if (buffer.length > MAX_BUFFER) buffer = "";
  }
  async function readLoop(currentPort) {
    const decoder = new TextDecoder();
    try {
      reader = currentPort.readable.getReader();
      while (true) {
        const {value, done} = await reader.read();
        if (done) break;
        if (value) pushText(decoder.decode(value, {stream: true}));
      }
    } catch (error) {
      if (!stopping) lastMessage = `연결이 중단되었습니다: ${error.message || "수신 오류"}`;
    } finally {
      if (reader) {
        try { reader.releaseLock(); } catch (_) { /* closing */ }
        reader = null;
      }
      try { await currentPort.close(); } catch (_) { /* already closed */ }
      if (port === currentPort) port = null;
      connected = false;
      connecting = false;
      stopping = false;
      buffer = "";
      emit();
    }
  }
  async function connect() {
    if (connected || connecting || !selectedId || !("serial" in navigator) || !window.isSecureContext) return;
    connecting = true;
    lastMessage = "";
    updateControls();
    try {
      // Must be invoked as a direct consequence of a user's button click.
      port = await navigator.serial.requestPort();
      await port.open({baudRate: BAUD_RATE});
      connected = true;
      connecting = false;
      sessionStartedAt = Date.now();
      emit();
      readTask = readLoop(port);
      // HC-05 is not a data store or web client. Request one fresh snapshot
      // now so the user need not wait up to five minutes for the next packet.
      // The Arduino sketch still sends its periodic packets every 5 minutes.
      try {
        if (port.writable) {
          const writer = port.writable.getWriter();
          try { await writer.write(new TextEncoder().encode("READ\n")); }
          finally { writer.releaseLock(); }
        }
      } catch (requestError) {
        console.warn("SENTRY: initial READ request failed; waiting for periodic data", requestError);
      }
    } catch (error) {
      if (port) { try { await port.close(); } catch (_) { /* may not be open */ } }
      port = null;
      connecting = false;
      connected = false;
      if (error.name !== "NotFoundError") lastMessage = `연결 실패: ${error.message || "HC-05를 확인하세요."}`;
      emit();
    }
  }
  async function disconnect() {
    stopping = true;
    lastMessage = "연결 해제됨 · 이전 수신값은 과거 기록으로만 표시합니다.";
    if (reader) { try { await reader.cancel(); } catch (_) { /* reader already stopped */ } }
    if (readTask) { try { await readTask; } catch (_) { /* handled in readLoop */ } }
    else if (port) { try { await port.close(); } catch (_) { /* may not be open */ } }
    connected = false;
    connecting = false;
    stopping = false;
    emit();
  }
  function init() {
    if (!$("hc05Reagent")) return;
    refreshOptions();
    $("hc05Reagent").addEventListener("change", event => {
      selectedId = event.target.value;
      save();
      emit();
    });
    $("hc05Connect").addEventListener("click", connect);
    $("hc05Disconnect").addEventListener("click", disconnect);
    if ("serial" in navigator) {
      navigator.serial.addEventListener("disconnect", () => {
        if (connected && reader) reader.cancel().catch(() => {});
      });
    }
    updateControls();
    // The sketch reports every 5 minutes; warn when data is older than 7 minutes.
    setInterval(emit, 15000);
  }
  window.SENTRY_HC05 = {getState, subscribe: fn => {listeners.add(fn); return () => listeners.delete(fn);}, refreshOptions};
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
