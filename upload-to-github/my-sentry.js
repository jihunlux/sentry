/* SENTRY dashboard: actual HC-05 readings only; registered reagents remain untouched. */
(() => {
  "use strict";
  const K = "sentry-reagents-v1";
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? "").replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
  const demos = window.SENTRY_DEMOS || [];
  let selected = null;

  function hc05State(item) {
    return window.SENTRY_HC05 && item ? window.SENTRY_HC05.getState(String(item.id)) : null;
  }
  function all() {
    try {
      const raw = localStorage.getItem(K);
      if (raw === null) return demos.map(x => ({...x}));
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter(x => x && typeof x === "object") : [];
    } catch (_) { return demos.map(x => ({...x})); }
  }
  function registeredIssue(x) {
    return !x.formula || !x.formType || x.formType === "unknown" || !x.storage ||
      (!!x.review && !String(x.id || "").startsWith("demo-"));
  }
  function sensorAnomaly(r) {
    return !!r && (r.dhtError || !r.doorClosed || !r.irDetected || r.tilted);
  }
  function needsReview(x) {
    if (registeredIssue(x)) return true;
    const state = hc05State(x);
    // No reading != normal, but no fabricated sensor alarm either.
    if (!state || !state.linked || !state.reading) return false;
    if (!state.fresh) return true; // stale/previous sessions need attention
    return sensorAnomaly(state.reading);
  }
  function hardwareStatus(x) {
    const state = hc05State(x);
    const reading = state && state.reading;
    if (!state || !state.linked) return {state, reading:null, cabinet:"unknown", tilt:"unknown", note:"센서 미연결", mode:"missing"};
    if (!reading) return {state, reading:null, cabinet:"unknown", tilt:"unknown", note:"첫 측정값 수신 대기", mode:"waiting"};
    if (!state.fresh) return {state, reading, cabinet:"unknown", tilt:"unknown", note:"과거 수신 기록 · 현재 상태 아님", mode:"past"};
    return {state, reading, cabinet: reading.irDetected ? "detected" : "missing",
      tilt: reading.tilted ? "tilted" : "upright", note:"HC-05 실제 수신값 · 5분 주기", mode:"fresh"};
  }
  function measuredNumber(value, digits, unit) {
    return typeof value === "number" && Number.isFinite(value) ? `${value.toFixed(digits)}${unit}` : "측정 실패";
  }
  function stateLabel(value, type) {
    if (type === "cabinet") {
      if (value === "detected") return ["감지됨", "good"];
      if (value === "missing") return ["미감지 · 확인 필요", "bad"];
    } else {
      if (value === "upright") return ["정상적으로 서 있음", "good"];
      if (value === "tilted") return ["기울어짐", "bad"];
    }
    return ["정보 없음", "unknown"];
  }
  function sourceDescription(h) {
    const time = h.state?.receivedAt ? new Date(h.state.receivedAt).toLocaleString("ko-KR") : "";
    if (h.mode === "fresh") return `HC-05 수신 · ${time}`;
    if (h.mode === "past") return `마지막 수신 ${time} · 과거 기록 (현재값 아님)`;
    if (h.mode === "waiting") return "HC-05 연결 대상 · 측정값 수신 대기";
    return "HC-05 미연결 · 실제 측정값 없음";
  }
  function statusText(x, h) {
    if (registeredIssue(x)) return ["등록 정보 확인 필요", "bad"];
    if (h.mode === "fresh") return sensorAnomaly(h.reading) ? ["센서 확인 필요", "bad"] : ["센서 상태 정상", "good"];
    if (h.mode === "past") return ["수신 중단 · 상태 미확인", "unknown"];
    return [h.mode === "waiting" ? "수신 대기" : "센서 미연결", "unknown"];
  }
  function sensorInfo(x) {
    const text = `${x.name || ""} ${x.formula || ""} ${x.notes || ""}`.toLowerCase();
    const advice = [];
    if (/과산화수소|질산\s?은|h₂o₂|agno₃|agno3/.test(text))
      advice.push(["광센서", "광학적 변화 확인 후보", "파장 및 측정 방식 검증이 필요하며 분해 여부를 단독 판정할 수 없습니다."]);
    if (/염산|황산|아세트산|인산|수산화나트륨|수산화칼륨|hcl|h₂so₄|naoh/.test(text))
      advice.push(["pH 센서", "용액의 산성도 변화 확인 후보", "대상 용액에 적합한 전극, 측정 범위와 보정이 필요합니다."]);
    if (/색|변색|염료|요오드|과망간산/.test(text))
      advice.push(["색상 센서", "색상 변화의 보조 지표", "조명·용기 색상에 영향을 받으며 색상만으로 분해를 확정할 수 없습니다."]);
    if (/빛|차광|감광|과산화수소|질산\s?은|agno₃/.test(text))
      advice.push(["조도 센서", "보관 장소의 주변 밝기", "광센서의 물질 광학적 특성 측정과 다르게 주변 밝기를 확인합니다."]);
    if (/에탄올|염산|아세트산|hcl|ch₃cooh|c₂h₅oh/.test(text))
      advice.push(["전용 가스 센서", "대상 기체 감지 가능성 검토", "가스 종류·센서 호환성과 정확한 검출 대상을 확인해야 합니다."]);
    if (!advice.length)
      advice.push(["추가 센서 정보", "현재 정보만으로 추천 어려움", "측정하려는 항목과 시약별 특성을 먼저 확인해야 합니다."]);
    return advice;
  }
  function detail(x) {
    if (!x) return;
    const element = [...document.querySelectorAll("[data-detail]")].find(el => el.dataset.detail === String(x.id));
    if (!element) return;
    const h = hardwareStatus(x);
    const r = h.reading;
    const latestNote = sourceDescription(h);
    const storage = stateLabel(h.cabinet, "cabinet");
    const tilt = stateLabel(h.tilt, "tilt");
    const status = statusText(x, h);
    const temperature = r ? measuredNumber(r.temperature, 1, "°C") : h.mode === "waiting" ? "수신 대기 중" : "측정 정보 없음";
    const humidity = r ? measuredNumber(r.humidity, 0, "%") : h.mode === "waiting" ? "수신 대기 중" : "측정 정보 없음";
    const door = r ? (r.doorClosed ? "닫힘" : "열림") : h.mode === "waiting" ? "수신 대기 중" : "정보 없음";
    const note = h.mode === "fresh" ? "실측 수신" : h.mode === "past" ? "과거 수신값 · 현재 측정 아님" : h.mode === "waiting" ? "측정값 수신 대기" : "센서 미연결";
    const stateField = (label, data, caption) => `<div><small>${label}</small><b class="state-${data[1]}">${data[0]}</b><em class="unknown-text">${caption}</em></div>`;
    element.innerHTML = `<div class="inline-detail-inner">
      <div class="detail-top"><div><h3>${esc(x.name)} <small>${esc(x.formula || "화학식 미입력")}</small></h3><span class="status-pill ${status[1] === "bad" ? "status-bad" : status[1] === "good" ? "status-good" : ""}">${status[0]}</span></div>
        <span class="simulated-label">● 데이터 출처: ${esc(latestNote)}</span></div>
      <div class="detail-grid-inner">
        <div><small>현재 온도</small><b>${temperature}</b><em class="unknown-text">${note}</em></div>
        <div><small>현재 습도</small><b>${humidity}</b><em class="unknown-text">${note}</em></div>
        <div><small>용기 개폐 여부</small><b>${door}</b><em class="unknown-text">${note}</em></div>
        <div><small>보관 위치</small><b>${esc(x.location || "미입력")}</b><em>${x.location ? "사용자가 입력한 위치 · 변경되지 않음" : "위치 입력 필요"}</em></div>
        ${stateField("보관함 위치 상태", storage, h.mode === "fresh" ? "적외선 센서 앞의 물체 감지" : note)}
        ${stateField("용기 기울기", tilt, h.mode === "fresh" ? "Ball Switch 감지 · 각도 미표시" : note)}
        <div><small>보관 조건</small><b>${esc(x.storage || "확인 필요")}</b><em>${x.storage ? "기존 등록 정보" : "라벨·SDS 검토 필요"}</em></div>
        <div><small>물질 형태 · 농도</small><b>${esc(x.formType === "solid" ? "고체" : x.formType === "liquid" ? "액체·용액" : x.formType === "gas" ? "기체" : "형태 미선택")} · ${esc(x.concentration || "미입력")}</b><em>${esc(x.light || "광 노출 정보 없음")}</em></div>
      </div>
      <p class="state-source-note">${esc(latestNote)}. 시연용 센서 값은 표시하지 않습니다. 보관 위치는 원래 등록된 값이며, 적외선 감지는 보관 위치를 증명하거나 보관 적합성을 판정하지 않습니다. 실제 보관 조건은 제품 라벨과 SDS를 확인하세요.</p>
      <h4 class="detail-subtitle">추가 센서 정보</h4><div class="optional-detail-list">${sensorInfo(x).map(o => `<div class="optional-detail"><b>${esc(o[0])}</b><span>${esc(o[1])}</span><small>${esc(o[2])}</small></div>`).join("")}</div>
      <div class="notice-box"><span>ⓘ</span><p>${esc(x.notes || "추가 메모 없음")} 실제 보관·취급 전에 제품 라벨과 SDS를 확인하세요.</p></div>
      <div class="detail-actions"><button type="button" class="button danger small" data-delete>시약 삭제</button><span>삭제한 시약은 현재 브라우저에서 제거됩니다.</span></div>
    </div>`;
    element.classList.add("expanded");
    element.hidden = false;
    const del = element.querySelector("[data-delete]");
    if (del) del.onclick = () => {
      if (!confirm(`'${x.name}' 시약을 삭제할까요?`)) return;
      try {
        const updated = all().filter(item => String(item.id) !== String(x.id));
        localStorage.setItem(K, JSON.stringify(updated));
        selected = null;
        render();
        if ($("toast")) {
          $("toast").textContent = `${x.name} 시약을 삭제했습니다.`;
          $("toast").classList.add("show");
          setTimeout(() => $("toast")?.classList.remove("show"), 2400);
        }
      } catch (_) { alert("브라우저 저장에 실패했습니다. 삭제가 적용되지 않았습니다."); }
    };
  }
  function render() {
    const items = all();
    if (window.SENTRY_HC05) window.SENTRY_HC05.refreshOptions(items);
    const q = $("searchReagents").value.toLowerCase().trim();
    const matching = items.filter(x => `${x.name || ""} ${x.formula || ""}`.toLowerCase().includes(q));
    $("totalReagents").textContent = items.length;
    $("needsReview").textContent = items.filter(needsReview).length;
    $("reagentList").innerHTML = matching.length ? matching.slice().reverse().map(x => {
      const opened = selected === String(x.id);
      const form = x.formType === "solid" ? "고체" : x.formType === "liquid" ? "액체·용액" : x.formType === "gas" ? "기체" : "형태 확인";
      const h = hardwareStatus(x);
      const storage = stateLabel(h.cabinet, "cabinet");
      const tilt = stateLabel(h.tilt, "tilt");
      const state = statusText(x, h);
      return `<div class="reagent-wrap"><button class="reagent-item reagent-select ${opened ? "selected" : ""}" data-id="${esc(x.id)}" aria-expanded="${opened}" style="width:100%;text-align:left"><div><b>${esc(x.name)}</b><small>${esc(x.formula || "화학식 미입력")} · ${form} · ${esc(x.location || "보관 위치 미입력")}</small><span class="reagent-state-preview"><span class="reagent-state-chip state-${storage[1]}">보관함: ${storage[0]}</span><span class="reagent-state-chip state-${tilt[1]}">용기: ${tilt[0]}</span><span class="state-demo-tag">${esc(h.note)}</span></span></div><span class="reagent-badge ${state[1] === "bad" ? "badge-bad" : state[1] === "good" ? "badge-good" : ""}">${state[0]}</span><span class="expand-chevron">${opened ? "⌃" : "⌄"}</span></button><div class="inline-detail" data-detail="${esc(x.id)}" ${opened ? "" : "hidden"}></div></div>`;
    }).join("") : '<div class="empty-state"><b>검색 결과가 없습니다</b><p>검색어를 바꾸거나 시약 등록 메뉴에서 추가해 주세요.</p></div>';

    $("reviewList").innerHTML = items.filter(needsReview).map(x => {
      const h = hardwareStatus(x);
      const reasons = [];
      if (h.mode === "past") reasons.push("HC-05 수신 중단 또는 7분 이상 경과 · 현재 상태 미확인");
      if (h.mode === "fresh") {
        if (!h.reading.doorClosed) reasons.push("용기 열림 · 실제 수신값");
        if (!h.reading.irDetected) reasons.push("센서 앞 물체 미감지 · 실제 수신값");
        if (h.reading.tilted) reasons.push("용기 기울어짐 · 실제 수신값");
        if (h.reading.dhtError) reasons.push("온습도 측정 오류 · 실제 수신값");
      }
      if (registeredIssue(x)) reasons.push("등록 정보·SDS 확인 필요");
      return `<div class="review-item"><span class="review-dot"></span><div><b>${esc(x.name)}</b><p>${esc(reasons.join(" · "))}</p></div></div>`;
    }).join("") || '<div class="empty-state compact"><b>확인할 항목이 없습니다</b></div>';
    document.querySelectorAll(".reagent-select").forEach(button => button.addEventListener("click", () => {
      selected = selected === button.dataset.id ? null : button.dataset.id;
      render();
      if (selected) {
        const target = [...document.querySelectorAll("[data-detail]")].find(el => el.dataset.detail === selected);
        if (target) requestAnimationFrame(() => target.scrollIntoView({behavior:"smooth",block:"nearest"}));
      }
    }));
    if (selected) detail(items.find(x => String(x.id) === selected));
  }
  $("searchReagents").addEventListener("input", () => { selected = null; render(); });
  $("clearSearch").addEventListener("click", () => { $("searchReagents").value = ""; selected = null; render(); });
  const menu = $("mobileMenu"), nav = $("topNav");
  if (menu && nav) menu.addEventListener("click", () => nav.classList.toggle("open"));
  if (window.SENTRY_HC05) window.SENTRY_HC05.subscribe(render);
  render();
})();
