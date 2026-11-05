/* SENTRY dashboard: account-scoped cloud data, search, editing, delete and sensor advice. */
(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? "").replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
  let selected = null;

  function all() { return window.SentryStore.list(); }
  // Repeatable pseudo-random demo statuses are calculated in memory from each reagent ID.
  // This NEVER changes the user's saved reagent data and never represents a real sensor reading.
  function stableHash(value) {
    let hash = 2166136261;
    for (const char of String(value)) {
      hash ^= char.charCodeAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }
  function hasLiveSensor(x) {
    return ["sensor", "live", "hardware", "device"].includes(String(x.stateSource || "").toLowerCase());
  }
  function manualNormal(x) {
    return !hasLiveSensor(x) && x.manualSimulationStatus === "normal";
  }
  function simulatedStates(x) {
    if (x.sensorBound && !x.sensorFresh) return { cabinet: "unknown", tilt: "unknown" };
    // Live readings may never be overridden or replaced by generated demo values.
    if (hasLiveSensor(x)) return {
      cabinet: x.sensorBound ? (x.irDetected === true ? "detected" : x.irDetected === false ? "missing" : "unknown") : "unknown",
      tilt: ["upright", "tilted"].includes(x.tiltStatus) ? x.tiltStatus : "unknown"
    };
    // A manual correction affects only demo indicators, never actual sensor values.
    if (manualNormal(x)) return { cabinet: "stored", tilt: "upright" };
    const seed = String(x.id ?? `${x.name || ""}:${x.formula || ""}`);
    const cabinet = !x.location ? "check" :
      ["stored", "check"].includes(x.cabinetStatus) ? x.cabinetStatus :
      stableHash(`cabinet:${seed}`) % 5 === 0 ? "check" : "stored";
    const tilt = ["upright", "tilted"].includes(x.tiltStatus) ? x.tiltStatus :
      stableHash(`tilt:${seed}`) % 5 === 0 ? "tilted" : "upright";
    return { cabinet, tilt };
  }
  const limits = [
    { key: "monitorTempMin", label: "온도 하한 (°C)" },
    { key: "monitorTempMax", label: "온도 상한 (°C)" },
    { key: "monitorRhMin", label: "습도 하한 (%RH)", humidity: true },
    { key: "monitorRhMax", label: "습도 상한 (%RH)", humidity: true }
  ];
  function number(value) {
    if (typeof value === "string" && !value.trim()) return null;
    if (typeof value !== "number" && typeof value !== "string") return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  function comparison(x, humidity) {
    const value = number(humidity ? x.humidity : x.temp);
    const lo = number(humidity ? x.monitorRhMin : x.monitorTempMin);
    const hi = number(humidity ? x.monitorRhMax : x.monitorTempMax);
    if (!x.sensorBound) return ["센서 미연결", "unknown", ""];
    const reading = value === null ? "측정 오류" : value.toFixed(1) + (humidity ? "%RH" : "°C");
    if (!x.sensorFresh) return [reading + " · 과거 측정", "unknown", ""];
    if (value === null || (humidity && (value < 0 || value > 100))) return ["측정 오류", "bad", "측정 오류"];
    if ((lo === null && hi === null) || (lo !== null && hi !== null && lo > hi) ||
        (humidity && [lo, hi].some(v => v !== null && (v < 0 || v > 100)))) {
      return [reading + " · 기준 미설정", "unknown", ""];
    }
    if (lo !== null && value < lo) return [reading + " · 하한 미만", "bad", "하한 미만 (" + reading + ")"];
    if (hi !== null && value > hi) return [reading + " · 상한 초과", "bad", "상한 초과 (" + reading + ")"];
    return [reading + " · 설정 범위 내", "good", ""];
  }
  function reviewReasons(x) {
    if (!x.sensorBound || !x.sensorFresh) return [];
    const reasons = [];
    if (x.open === true) reasons.push("개폐 센서 열림");
    if (x.irDetected === false) reasons.push("용기 미감지");
    if (x.tiltStatus === "tilted") reasons.push("용기 기울어짐");
    const temp = comparison(x, false)[2], rh = comparison(x, true)[2];
    if (temp) reasons.push("온도 " + temp);
    if (rh) reasons.push("습도 " + rh);
    return reasons;
  }
  function needsReview(x) { return reviewReasons(x).length > 0; }
  function badgeText(x) {
    if (needsReview(x)) return "확인 필요";
    if (!x.sensorBound) return "센서 미연결";
    return x.sensorFresh ? "감지된 이상 없음" : "수신 대기 · 과거 측정";
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
  function statusLabel(value, type) {
    if (type === "cabinet") {
      if (value === "detected") return ["용기 감지됨", "good"];
      if (value === "missing") return ["용기 미감지", "bad"];
      return value === "stored" ? ["정상 보관", "good"] : value === "check" ? ["확인 필요", "bad"] : ["정보 없음", "unknown"];
    }
    return value === "upright" ? ["정상적으로 서 있음", "good"] : value === "tilted" ? ["기울어짐", "bad"] : ["정보 없음", "unknown"];
  }
  function numericDisplay(value, digits, unit, demo) {
    return demo && Number.isFinite(Number(value)) && value !== null && value !== undefined && value !== ""
      ? `${Number(value).toFixed(digits)}${unit}` : "측정 정보 없음";
  }
  function detail(x) {
    if (!x) return;
    const element = [...document.querySelectorAll("[data-detail]")].find(el => el.dataset.detail === String(x.id));
    if (!element) return;
    const demo = x.stateSource === "simulation" && (String(x.id || "").startsWith("demo-"));
    const review = needsReview(x);
    const live = !!x.sensorBound;
    const liveNote = live ? (x.sensorFresh ? "실제 측정 · 수신 중" : "과거 측정 · 현재 상태 확인 불가") : "";
    const readingNote = live ? liveNote : demo ? "시연용 임의값" : "센서 미연결";
    const measure = (value, digits, unit) => live && value === null ? "측정 오류" : numericDisplay(value, digits, unit, demo || live);
    const sim = simulatedStates(x);
    const cabinet = statusLabel(sim.cabinet, "cabinet");
    const tilt = statusLabel(sim.tilt, "tilt");
    const userNormal = manualNormal(x);
    const editable = !hasLiveSensor(x);
    const stateField = (label, state, note) => `<div><small>${label}</small><b class="state-${state[1]}">${state[0]}</b><em class="${state[1] === "good" ? "good-text" : state[1] === "bad" ? "bad-text" : "unknown-text"}">${note}</em></div>`;
    element.innerHTML = `<div class="inline-detail-inner">
      <div class="detail-top"><div><h3>${esc(x.name)} <small>${esc(x.formula || "화학식 미입력")}</small></h3><span class="status-pill ${review ? "status-bad" : "status-good"}">${badgeText(x)}</span></div>
        <span class="simulated-label">● 보관함·기울기: ${live ? liveNote : hasLiveSensor(x) ? "연동 데이터 · 장치 검증 필요" : userNormal ? "사용자가 설정한 시뮬레이션 정상 상태" : "시뮬레이션 · 실제 측정 아님"}</span></div>
      <div class="detail-grid-inner">
        <div><small>현재 온도</small><b>${measure(x.temp, 1, "°C")}</b><em class="unknown-text">${readingNote}</em></div>
        <div><small>현재 습도</small><b>${measure(x.humidity, 1, "%")}</b><em class="unknown-text">${readingNote}</em></div>
        <div><small>개폐 센서 상태</small><b>${live ? (x.open ? "열림" : "닫힘") : demo ? (userNormal ? "닫힘(사용자 설정 · 시뮬레이션)" : x.open ? "열림(시뮬레이션)" : "닫힘(시뮬레이션)") : "정보 없음"}</b><em class="unknown-text">${live ? liveNote + " · 센서 설치 대상 확인" : demo ? "시연용 상태" : "센서 미연결"}</em></div>
        <div><small>보관 위치</small><b>${esc(x.location || "미입력")}</b><em>${x.location ? "사용자가 입력한 위치" : "위치 입력 필요"}</em></div>
        ${stateField("보관함 위치 상태", cabinet, live ? "적외선 감지만으로 지정 보관 위치를 확인할 수 없음" : hasLiveSensor(x) ? "장치 데이터 · 작동 상태 확인 필요" : userNormal ? "사용자 변경 · 시뮬레이션" : "시연용 임의 상태 · 실제 위치 감지 아님")}
        ${stateField("용기 기울기", tilt, live ? liveNote : hasLiveSensor(x) ? "장치 데이터 · 작동 상태 확인 필요" : userNormal ? "사용자 변경 · 시뮬레이션" : "시연용 임의 상태 · 각도 미표시")}
        <div><small>보관 조건</small><b>${esc(x.storage || "확인 필요")}</b><em>${x.storage ? "입력된 보관 조건" : "라벨·SDS 검토 필요"}</em></div>
        <div><small>물질 형태 · 농도</small><b>${esc(x.formType === "solid" ? "고체" : x.formType === "liquid" ? "액체·용액" : x.formType === "gas" ? "기체" : "형태 미선택")} · ${esc(x.concentration || "미입력")}</b><em>${esc(x.light || "광 노출 정보 없음")}</em></div>
      </div>
      ${live ? `<p class="state-source-note">마지막 수신: ${esc(new Date(x.receivedAt).toLocaleString("ko-KR"))} · 적외선: ${x.irDetected ? "용기 감지됨" : "용기 감지되지 않음"} · 부저: ${x.buzzer ? "켜짐" : "꺼짐"}. ${liveNote}. 시약 안전성 판정과는 별개입니다.</p>` : ""}
      <p class="state-source-note">${hasLiveSensor(x) ? "연동 장치 데이터의 정상 여부는 시스템 및 실제 보관 상황에서 확인해야 합니다. " : userNormal ? "보관함 위치·기울기(및 시연용 개폐 상태)를 사용자가 정상으로 변경했습니다. " : "보관함 위치와 용기 기울기는 시약별로 고정해 둔 시연용 임의 상태입니다. "}${live ? "센서값은 실제 수신 데이터이며 보관 안전성 판정은 아닙니다." : "이는 실제 센서에서 확인한 결과나 안전 판정이 아닙니다."} ${live ? "온도·습도·개폐·기울기·적외선은 연결된 장치의 마지막 수신값입니다. 지정 보관함 위치는 확인하지 않습니다." : demo ? "온도·습도도 시뮬레이션 예시이며 변경하지 않습니다." : "온도·습도는 센서 미연결로 측정값이 없습니다."} 제품 라벨과 SDS 확인은 별도로 필요합니다.</p>
      ${editable ? `<div class="demo-state-control"><div><strong>보관 상태 수동 변경</strong><small>시뮬레이션 표시만 변경합니다.</small></div><button type="button" class="button ${userNormal ? "secondary" : "primary"} small" data-set-normal="${userNormal ? "restore" : "normal"}">${userNormal ? "이전 시뮬레이션 상태로 복원" : "정상 보관으로 변경"}</button></div>` : `<p class="state-source-note">실제 센서 데이터는 이 화면에서 정상으로 변경할 수 없습니다.</p>`}
      <h4 class="detail-subtitle">추가 센서 정보</h4><div class="optional-detail-list">${sensorInfo(x).map(o => `<div class="optional-detail"><b>${esc(o[0])}</b><span>${esc(o[1])}</span><small>${esc(o[2])}</small></div>`).join("")}</div>
      <div class="notice-box"><span>ⓘ</span><p>${esc(x.notes || "추가 메모 없음")} 실제 보관·취급 전에 제품 라벨과 SDS를 확인하세요.</p></div>
      <div class="detail-actions"><button type="button" class="button secondary small" data-edit>시약 정보 편집</button><button type="button" class="button danger small" data-delete>시약 삭제</button></div>
      </div>`;
    element.classList.add("expanded");
    element.hidden = false;
    const editButton = element.querySelector("[data-edit]");
    if (editButton) editButton.onclick = () => openReagentEditor(String(x.id));
    const del = element.querySelector("[data-delete]");
    const setNormal = element.querySelector("[data-set-normal]");
    if (setNormal) setNormal.onclick = () => updateManualState(String(x.id), setNormal.dataset.setNormal);
    if (del) del.onclick = async () => {
      if (!confirm(`'${x.name}' 시약을 삭제할까요?`)) return;
      try {
        del.disabled = true;
        await window.SentryStore.remove(String(x.id));
        selected = null;
        window.dispatchEvent(new Event("sentry-reagents-changed"));
        render();
        const toast = $("toast");
        if (toast) {
          toast.textContent = `${x.name} 시약을 삭제했습니다.`;
          toast.classList.add("show");
          setTimeout(() => toast.classList.remove("show"), 2400);
        }
      } catch (error) { del.disabled = false; alert(error.message); }
    };
  }
  function notify(message) {
    const toast = $("toast");
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add("show");
    setTimeout(() => toast.classList.remove("show"), 2400);
  }
  const editFields = ["name", "formula", "formType", "concentration", "storage", "location", "notes", ...limits.map(limit => limit.key)];
  let editor = null;
  function openReagentEditor(id) {
    const item = all().find(x => String(x.id) === id);
    if (!item) { notify("시약을 찾을 수 없습니다. 목록을 새로 확인해 주세요."); return; }
    if (!editor) {
      const style = document.createElement("style");
      style.textContent = `
        .sentry-edit-dialog{width:min(620px,calc(100% - 32px));max-height:calc(100dvh - 40px);padding:0;border:1px solid var(--line,#E3E7EF);border-radius:16px;background:#fff;color:var(--text,#25364B);box-shadow:0 20px 70px #21375233;overflow:auto}
        .sentry-edit-dialog::backdrop{background:#172A4266}
        .sentry-edit-form{padding:24px}
        .sentry-edit-form h3{font-size:20px;margin:0 0 6px}
        .sentry-edit-intro{font-size:12px;color:var(--muted,#68798A);margin:0 0 20px;line-height:1.7}
        .sentry-edit-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
        .sentry-edit-fields label{display:flex;flex-direction:column;gap:6px;font-size:12px;font-weight:700;min-width:0}
        .sentry-edit-fields .sentry-edit-wide{grid-column:1/-1}
        .sentry-edit-fields input,.sentry-edit-fields select,.sentry-edit-fields textarea{width:100%;min-width:0;border:1px solid var(--line,#E3E7EF);border-radius:8px;padding:11px;background:#F8FAFD;color:inherit;font:inherit;font-weight:400;box-sizing:border-box}
        .sentry-edit-fields textarea{resize:vertical;min-height:82px}
        .sentry-edit-fields :is(input,select,textarea):focus-visible{outline:2px solid #6689B8;outline-offset:2px}
        .sentry-edit-error{color:#B34D48;font-size:12px;min-height:20px;margin:12px 0}
        .sentry-edit-actions{display:flex;justify-content:flex-end;gap:10px;flex-wrap:wrap}
        .detail-actions [data-edit]{white-space:nowrap}
        @media(max-width:480px){.sentry-edit-form{padding:20px}.sentry-edit-fields{grid-template-columns:1fr}.sentry-edit-actions .button{flex:1}}
      `;
      document.head.appendChild(style);
      editor = document.createElement("dialog");
      editor.className = "sentry-edit-dialog";
      editor.setAttribute("aria-labelledby", "sentryEditTitle");
      document.body.appendChild(editor);
    }
    const baseline = Object.fromEntries(editFields.map(key => [key, String(item[key] ?? "")]));
    const input = (key, label, wide = false) => `<label class="${wide ? "sentry-edit-wide" : ""}" for="sentryEdit-${key}">${label}<input id="sentryEdit-${key}" name="${key}" value="${esc(baseline[key])}" ${key === "name" ? "required" : ""}></label>`;
    const referenceKey = String(item.name || "").normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
    const references = Object.hasOwn(window.SentryEnvironmentReferences || {}, referenceKey) ? window.SentryEnvironmentReferences[referenceKey] : [];
    const referenceText = references.map(ref => [ref[0] && "온도 " + ref[0], ref[1] && "습도 " + ref[1]].filter(Boolean).join(" · ")).join(" / ");
    editor.innerHTML = `<form class="sentry-edit-form">
      <h3 id="sentryEditTitle">시약 정보 편집</h3>
      <p class="sentry-edit-intro">등록한 정보를 수정하고 저장하세요. 농도·순도는 기존 등록 형식과 동일하게 입력합니다.</p>
      <div class="sentry-edit-fields">
        ${input("name", "시약 이름 *")}${input("formula", "분자식 또는 화학식")}
        <label for="sentryEdit-formType">물질 형태<select id="sentryEdit-formType" name="formType"><option value="">선택 안 함</option><option value="solid">고체</option><option value="liquid">액체·용액</option><option value="gas">기체</option><option value="unknown">모름</option></select></label>
        ${input("concentration", "농도·순도")}
        ${input("storage", "보관 조건", true)}${input("location", "보관 위치", true)}
        <p class="sentry-edit-intro sentry-edit-wide"><strong>실시간 비교 기준</strong><br>해당 제품의 라벨·SDS로 확인한 기준만 입력하세요. 한쪽 한계만 입력할 수 있습니다. 아래 엑셀 참고값은 자동으로 적용되지 않습니다.${referenceText ? "<br>엑셀 참고 · " + esc(referenceText) : ""}</p>
        ${limits.map(({ key, label, humidity }) => `<label for="sentryEdit-${key}">${label}<input id="sentryEdit-${key}" name="${key}" type="number" step="any" ${humidity ? 'min="0" max="100"' : ""} value="${esc(baseline[key])}"></label>`).join("")}
        <label class="sentry-edit-wide" for="sentryEdit-notes">용기·기타 메모<textarea id="sentryEdit-notes" name="notes" rows="3">${esc(baseline.notes)}</textarea></label>
      </div>
      <p class="sentry-edit-error" role="alert" aria-live="polite"></p>
      <div class="sentry-edit-actions"><button type="button" class="button secondary small" data-edit-cancel>취소</button><button type="submit" class="button primary small">변경사항 저장</button></div>
    </form>`;
    const form = editor.querySelector("form");
    form.elements.namedItem("formType").value = baseline.formType;
    const errorBox = editor.querySelector(".sentry-edit-error");
    editor.querySelector("[data-edit-cancel]").onclick = () => editor.close();
    editor.onclose = () => {
      const detailElement = [...document.querySelectorAll("[data-detail]")].find(el => el.dataset.detail === id);
      detailElement?.querySelector("[data-edit]")?.focus({ preventScroll: true });
    };
    form.onsubmit = async event => {
      event.preventDefault();
      errorBox.textContent = "";
      const changes = Object.fromEntries(editFields.map(key => [key, form.elements.namedItem(key).value.trim()]));
      if (!changes.name) { errorBox.textContent = "시약 이름을 입력해 주세요."; form.elements.namedItem("name").focus(); return; }
      for (const [low, high] of [[limits[0], limits[1]], [limits[2], limits[3]]]) {
        const lo = number(changes[low.key]), hi = number(changes[high.key]);
        if (lo !== null && hi !== null && lo > hi) {
          errorBox.textContent = "하한은 상한보다 클 수 없습니다.";
          form.elements.namedItem(low.key).focus();
          return;
        }
      }
      try {
        const current = all().find(x => String(x.id) === id);
        if (!current) { errorBox.textContent = "이 시약이 삭제되었습니다. 취소 후 목록을 확인해 주세요."; return; }
        if (editFields.some(key => String(current[key] ?? "") !== baseline[key])) {
          errorBox.textContent = "시약 정보가 변경되었습니다. 취소한 뒤 다시 편집해 주세요."; return;
        }
        form.querySelectorAll("button,input,select,textarea").forEach(el => el.disabled = true);
        await window.SentryStore.update(id, changes);
      } catch (error) {
        form.querySelectorAll("button,input,select,textarea").forEach(el => el.disabled = false);
        errorBox.textContent = error.message; return;
      }
      selected = id;
      const q = $("searchReagents").value.toLowerCase().trim();
      if (q && !`${changes.name} ${changes.formula}`.toLowerCase().includes(q)) $("searchReagents").value = "";
      window.dispatchEvent(new Event("sentry-reagents-changed"));
      render();
      editor.close();
      notify("시약 정보를 수정했습니다.");
    };
    editor.showModal();
    form.elements.namedItem("name").focus();
  }

  async function updateManualState(id, action) {
    const data = all();
    const reagent = data.find(item => String(item.id) === id);
    if (!reagent || hasLiveSensor(window.SentryStore.overlay(reagent))) {
      alert("실제 센서 데이터는 변경할 수 없습니다.");
      return;
    }
    if (action === "normal") {
      if (!confirm("이 시약의 시뮬레이션 보관함·기울기 상태를 정상으로 변경하시겠습니까? 실제 센서 경고나 SDS 확인 결과는 바뀌지 않습니다.")) return;
      reagent.manualSimulationStatus = "normal";
    } else if (action === "restore") {
      delete reagent.manualSimulationStatus;
    } else return;
    try {
      await window.SentryStore.update(id, { manualSimulationStatus: action === "normal" ? "normal" : null });
      selected = id;
      render();
      notify(action === "normal" ? "시뮬레이션 보관 상태를 정상으로 변경했습니다." : "이전 시뮬레이션 상태로 복원했습니다.");
    } catch (error) {
      alert(error.message);
    }
  }
  function render() {
    const items = all().map(x => window.SentryStore.overlay(x)).map(x => window.SentrySerial ? window.SentrySerial.overlay(x) : x);
    const flagged = items.map(x => ({x, reasons: reviewReasons(x)})).filter(({reasons}) => reasons.length);
    const q = $("searchReagents").value.toLowerCase().trim();
    const matching = items.filter(x => `${x.name || ""} ${x.formula || ""}`.toLowerCase().includes(q));
    $("totalReagents").textContent = items.length;
    $("needsReview").textContent = flagged.length;
    $("reagentList").innerHTML = matching.length ? matching.slice().reverse().map(x => {
      const opened = selected === String(x.id);
      const form = x.formType === "solid" ? "고체" : x.formType === "liquid" ? "액체·용액" : x.formType === "gas" ? "기체" : "형태 확인";
      const sim = simulatedStates(x);
      const cabinet = statusLabel(sim.cabinet, "cabinet");
      const tilt = statusLabel(sim.tilt, "tilt");
      const userNormal = manualNormal(x);
      const temp = comparison(x, false), rh = comparison(x, true);
      return `<div class="reagent-wrap"><button class="reagent-item reagent-select ${opened ? "selected" : ""}" data-id="${esc(x.id)}" aria-expanded="${opened}" style="width:100%;text-align:left"><div><b>${esc(x.name)}</b><small>${esc(x.formula || "화학식 미입력")} · ${form} · ${esc(x.location || "보관 위치 미입력")}</small><span class="reagent-state-preview"><span class="reagent-state-chip state-${cabinet[1]}">보관함: ${cabinet[0]}</span><span class="reagent-state-chip state-${tilt[1]}">용기: ${tilt[0]}</span><span class="reagent-state-chip state-${temp[1]}">온도: ${temp[0]}</span><span class="reagent-state-chip state-${rh[1]}">습도: ${rh[0]}</span><span class="state-demo-tag">${x.sensorBound ? (x.sensorFresh ? "실제 측정" : "수신 지연 · 과거 측정") : hasLiveSensor(x) ? "장치 연동 데이터" : userNormal ? "사용자 설정 · 시뮬레이션" : "시뮬레이션"}</span></span></div><span class="reagent-badge ${needsReview(x) ? "badge-bad" : x.sensorFresh ? "badge-good" : ""}">${badgeText(x)}</span><span class="expand-chevron">${opened ? "⌃" : "⌄"}</span></button><div class="inline-detail" data-detail="${esc(x.id)}" ${opened ? "" : "hidden"}></div></div>`;
    }).join("") : '<div class="empty-state"><b>표시할 시약이 없습니다</b><p>시약 등록 메뉴에서 내 시약을 추가하거나 검색어를 확인해 주세요.</p></div>';
    $("reviewList").innerHTML = flagged.map(({x, reasons}) =>
      `<div class="review-item"><span class="review-dot"></span><div><b>${esc(x.name)}</b><p>${esc(reasons.join(" · "))}</p></div></div>`
    ).join("") || '<div class="empty-state compact"><b>실시간 측정에서 감지된 이상이 없습니다</b></div>';
    document.querySelectorAll(".reagent-select").forEach(button => button.addEventListener("click", () => {
      selected = selected === button.dataset.id ? null : button.dataset.id;
      render();
      if (selected) {
        const target = [...document.querySelectorAll("[data-detail]")].find(el => el.dataset.detail === selected);
        if (target) requestAnimationFrame(() => target.scrollIntoView({ behavior: "smooth", block: "nearest" }));
      }
    }));
    if (selected) detail(items.find(x => String(x.id) === selected));
  }
  $("searchReagents").addEventListener("input", () => { selected = null; render(); });
  $("clearSearch").addEventListener("click", () => { $("searchReagents").value = ""; selected = null; render(); });
  const menu = $("mobileMenu"), nav = $("topNav");
  if (menu && nav) menu.addEventListener("click", () => nav.classList.toggle("open"));
  window.addEventListener("sentry-sensor-update", render);
  window.addEventListener("sentry-reagents-changed", render);
  window.addEventListener("sentry-account-changing", () => { if (editor?.open) editor.close(); if (editor) editor.innerHTML = ""; });
  $("refreshAccountData").addEventListener("click", async () => {
    const button = $("refreshAccountData"); button.disabled = true;
    $("accountDataMessage").textContent = "계정 데이터를 불러오는 중입니다…";
    try { await window.SentryStore.load(); render(); $("accountDataMessage").textContent = "최신 계정 데이터를 불러왔습니다. 저장된 센서값은 마지막 측정 기록입니다."; }
    catch (error) { $("accountDataMessage").textContent = error.message; }
    finally { button.disabled = false; }
  });
  render();
})();


