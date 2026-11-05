/* Private pages load their feature scripts only after authentication and cloud data. */
(() => {
  "use strict";
  const privatePage = document.body.hasAttribute("data-sentry-private");
  if (!privatePage) return;
  const gate = document.createElement("section"); gate.className = "account-gate"; gate.setAttribute("role", "status"); gate.textContent = "로그인 정보를 확인하고 있습니다…";
  document.querySelector(".site-header").after(gate);
  function showError(message) {
    gate.replaceChildren(); const p = document.createElement("p"); p.textContent = message; gate.append(p);
    const retry = document.createElement("button"); retry.className = "button primary small"; retry.textContent = "다시 시도"; retry.onclick = () => location.reload(); gate.append(retry);
    const home = document.createElement("a"); home.className = "button secondary small"; home.href = "index.html"; home.textContent = "홈으로 이동"; gate.append(home);
  }
  const script = src => new Promise((resolve, reject) => {
    const tag = document.createElement("script"); tag.src = src; tag.onload = resolve; tag.onerror = () => reject(new Error("페이지 구성 파일을 불러오지 못했습니다. 다시 시도해 주세요.")); document.body.append(tag);
  });
  window.SentryAuth.ready.then(async user => {
    if (window.SentryAuth.error) { showError(window.SentryAuth.error); return; }
    if (!user) { location.replace(window.SentryAuth.loginUrl()); return; }
    try {
      await window.SentryStore.load();
      if (window.SentryAuth.user?.id !== user.id) return;
      const name = document.getElementById("accountIdentity");
      if (name) name.textContent = user.email || "로그인한 계정";
      for (const src of JSON.parse(document.body.dataset.sentryScripts || "[]")) {
        if (window.SentryAuth.user?.id !== user.id) return;
        await script(src);
      }
      if (window.SentryAuth.user?.id !== user.id) return;
      gate.remove(); document.body.classList.add("account-ready");
    } catch (error) { showError(error.message); }
  });
})();
