(() => {
  "use strict";
  function download(name, text, type) {
    const url = URL.createObjectURL(new Blob([text], { type })); const a = document.createElement("a");
    a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
  document.getElementById("setupForm").addEventListener("submit", event => {
    event.preventDefault();
    const url = document.getElementById("projectUrl").value.trim().replace(/\/$/, "");
    const key = document.getElementById("publicKey").value.trim();
    const message = document.getElementById("setupMessage"); message.hidden = false;
    if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url)) { message.textContent = "Supabase 프로젝트 URL을 확인해 주세요."; return; }
    let publicKey = /^sb_publishable_[A-Za-z0-9_-]+$/.test(key);
    try { publicKey ||= key.split(".").length === 3 && JSON.parse(atob(key.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).role === "anon"; } catch (_) {}
    if (!publicKey) { message.textContent = "Publishable key 또는 anon public key만 사용할 수 있습니다. 비밀 키를 입력하지 마세요."; return; }
    download("sentry-config.js", "window.SENTRY_CONFIG = Object.freeze(" + JSON.stringify({ supabaseUrl: url, supabasePublishableKey: key }, null, 2) + ");\n", "text/javascript;charset=utf-8");
    message.textContent = "설정 파일을 만들었습니다. 다운로드한 sentry-config.js를 GitHub 저장소에 교체 업로드해 주세요.";
  });
  document.getElementById("legacyBackup").addEventListener("click", () => {
    const message = document.getElementById("backupMessage");
    try {
      const raw = localStorage.getItem("sentry-reagents-v1"); const items = raw === null ? [] : JSON.parse(raw);
      if (!Array.isArray(items) || !items.length) { message.textContent = "이 브라우저에 백업할 기존 시약이 없습니다. 예전에 사용한 기기와 브라우저에서 열어 주세요."; return; }
      download("SENTRY_legacy_backup.json", JSON.stringify(items, null, 2), "application/json;charset=utf-8");
      message.textContent = `${items.length}개 시약을 백업했습니다. 기존 브라우저 데이터는 그대로 남아 있습니다.`;
    } catch (_) { message.textContent = "브라우저의 기존 데이터를 읽지 못했습니다."; }
  });
})();
