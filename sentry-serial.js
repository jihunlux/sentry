/* HC-06 receiver. Latest real readings are saved separately under the signed-in account. */
(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const target = $("serialReagent"), connectButton = $("serialConnect"), stopButton = $("serialDisconnect");
  const supported = window.isSecureContext && "serial" in navigator;
  let port = null, reader = null, active = false, busy = false, snapshot = null, boundId = "", lastFresh = false;
  const fresh = () => Boolean(active && snapshot && Date.now() - snapshot.receivedAt <= 30000);
  const emit = () => window.dispatchEvent(new Event("sentry-sensor-update"));
  const tell = text => { $("serialStatus").textContent = text; };
  function records() { return window.SentryStore.list(); }
  function refreshOptions() {
    const previous = target.value;
    const items = records();
    target.replaceChildren(new Option("연결할 시약을 선택하세요", ""));
    for (const x of items) target.add(new Option(`${x.name || "이름 없음"} · ${x.formula || "화학식 없음"}`, String(x.id)));
    if (items.some(x => String(x.id) === previous)) target.value = previous;
    connectButton.disabled = !supported || busy || !target.value;
  }
  function updateControls() {
    target.disabled = busy;
    connectButton.disabled = !supported || busy || !target.value;
    stopButton.disabled = !active;
  }
  function paint() {
    const current = fresh();
    const note = !snapshot ? "수신 대기" : current ? "실제 측정 · 수신 중" : "과거 측정 · 현재 상태 확인 불가";
    $("serialSource").textContent = note;
    $("serialSource").className = "serial-source " + (current ? "serial-good" : "serial-neutral");
    $("serialTime").textContent = snapshot ? new Date(snapshot.receivedAt).toLocaleString("ko-KR") : "아직 수신하지 않음";
    if (snapshot) {
      $("serialTemp").textContent = snapshot.temp === null ? "측정 오류" : `${snapshot.temp.toFixed(1)} °C`;
      $("serialHumidity").textContent = Number.isFinite(snapshot.humidity)
        ? `${snapshot.humidity.toFixed(1)} %RH${current ? "" : " · 과거 측정"}` : "—";
      $("serialDoor").textContent = snapshot.open ? "열림" : "닫힘";
      $("serialTilt").textContent = snapshot.tiltStatus === "tilted" ? "기울어짐" : "정상적으로 서 있음";
      $("serialIR").textContent = snapshot.irDetected ? "용기 감지됨" : "용기 감지되지 않음";
      $("serialBuzzer").textContent = snapshot.buzzer ? "켜짐" : "꺼짐";
    } else {
      for (const id of ["serialTemp", "serialHumidity", "serialDoor", "serialTilt", "serialIR", "serialBuzzer"]) $(id).textContent = "정보 없음";
    }
    if (active) tell(!snapshot ? "연결됨 · 첫 측정 묶음을 기다립니다. 최대 15초 기다려 주세요." : current ? "수신 중 · 아두이노에서 약 10초마다 갱신합니다." : "30초 이상 새 측정값이 없습니다. 전원·배선·통신 속도를 확인하세요.");
    if (current !== lastFresh) { lastFresh = current; emit(); }
  }
  let saveQueue = Promise.resolve();
  const parser = new window.SentryProtocol.FrameParser((data, raw) => {
    snapshot = { ...data, receivedAt: Date.now() };
    $("serialRaw").textContent = raw;
    paint(); emit();
    const owner = window.SentryAuth.user?.id, reagent = boundId, reading = { ...snapshot };
    saveQueue = saveQueue.catch(() => {}).then(async () => {
      if (!owner || window.SentryAuth.user?.id !== owner) return;
      $("serialSaveStatus").textContent = "최신 측정값을 계정에 저장하는 중입니다…";
      try {
        await window.SentryStore.saveReading(reagent, reading);
        if (window.SentryAuth.user?.id === owner) $("serialSaveStatus").textContent = "계정에 최신 측정값을 저장했습니다.";
      } catch (error) { if (window.SentryAuth.user?.id === owner) $("serialSaveStatus").textContent = error.message; }
    });
  });
  window.SentrySerial = {
    overlay(item) {
      if (!snapshot || String(item.id) !== boundId) return item;
      if (item.receivedAt > snapshot.receivedAt) return item;
      return { ...item, ...snapshot, cabinetStatus: "unknown", stateSource: "sensor", sensorFresh: fresh(), sensorBound: true, sensorShared: false };
    }
  };
  function errorMessage(error) {
    if (error.name === "NotFoundError") return "장치 선택을 취소했습니다. 연결 버튼으로 다시 선택할 수 있습니다.";
    if (error.name === "SecurityError") return "장치 접근이 허용되지 않았습니다. PC Chrome에서 HTTPS 사이트를 직접 열어 주세요.";
    return "연결 또는 수신을 종료했습니다. COM4를 사용하는 시리얼 모니터·PuTTY를 닫고 HC-06 전원을 확인한 뒤 다시 연결하세요.";
  }
  async function connect() {
    if (busy || !target.value) return;
    busy = true; updateControls();
    let endMessage = "연결이 종료되었습니다. 표시된 값은 마지막 측정 기록입니다.";
    try {
      // requestPort must run directly inside this user click handler.
      port = await navigator.serial.requestPort();
      await port.open({ baudRate: 9600, dataBits: 8, stopBits: 1, parity: "none", flowControl: "none" });
      boundId = target.value; snapshot = null; parser.reset();
      $("serialRaw").textContent = "완전한 측정 묶음을 기다리는 중입니다.";
      active = true; updateControls(); paint(); emit();
      const decoder = new TextDecoder();
      reader = port.readable.getReader();
      while (active) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value) parser.push(decoder.decode(value, { stream: true }));
      }
    } catch (error) { endMessage = errorMessage(error); }
    finally {
      active = false;
      if (reader) { reader.releaseLock(); reader = null; }
      if (port) { try { await port.close(); } catch (_) { /* device may already be gone */ } port = null; }
      busy = false; parser.reset(); updateControls(); paint(); tell(endMessage); emit();
    }
  }
  async function disconnect() {
    active = false; updateControls(); paint(); emit();
    if (reader) { try { await reader.cancel(); } catch (_) {} }
  }
  target.addEventListener("change", () => {
    snapshot = null; boundId = ""; paint(); emit(); updateControls();
    $("serialRaw").textContent = "아직 수신하지 않음";
  });
  window.addEventListener("sentry-account-changing", () => {
    snapshot = null; boundId = ""; parser.reset(); disconnect(); paint();
  });
  connectButton.addEventListener("click", connect);
  stopButton.addEventListener("click", disconnect);
  window.addEventListener("storage", () => { if (!busy) refreshOptions(); });
  window.addEventListener("sentry-reagents-changed", () => {
    const exists = records().some(x => String(x.id) === boundId);
    if (!exists && active) disconnect();
    if (!exists) { snapshot = null; boundId = ""; }
    refreshOptions(); updateControls(); paint();
  });
  document.addEventListener("visibilitychange", () => { paint(); emit(); });
  setInterval(paint, 1000);
  refreshOptions(); paint();
  tell(supported ? "시약을 선택한 뒤 ‘HC-06 연결’을 누르고 COM4 또는 HC-06을 선택하세요." : "직접 수신은 PC의 최신 Chrome에서 HTTPS 주소로 열어 이용하세요. 이 브라우저에서는 연결을 지원하지 않습니다.");
})();
