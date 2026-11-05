/* Real Supabase Auth. An unconfigured site never simulates a successful sign-in. */
(() => {
  "use strict";
  let client = null, user = null, initialised = false, configurationError = "";
  const privatePage = document.body.hasAttribute("data-sentry-private");
  const links = [["my-sentry.html", "나의 SENTRY"], ["register.html", "시약 등록"], ["lab-tool.html", "실험 도우미"], ["index.html#sensor-guide", "센서 안내"]];
  function validConfig(config) {
    if (!config || !/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(config.supabaseUrl || "")) return false;
    const key = config.supabasePublishableKey || "";
    if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) return true;
    try {
      const part = key.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
      return key.split(".").length === 3 && JSON.parse(atob(part)).role === "anon";
    } catch (_) { return false; }
  }
  function safeNext(value) { return links.some(([href]) => href === value) ? value : "my-sentry.html"; }
  function loginUrl() {
    const page = location.pathname.split("/").pop();
    return "login.html?next=" + encodeURIComponent(safeNext(page));
  }
  function renderNavigation() {
    const nav = document.getElementById("topNav");
    if (!nav) return;
    nav.replaceChildren();
    if (user) {
      for (const [href, text] of links) { const a = document.createElement("a"); a.href = href; a.textContent = text; nav.append(a); }
      const logout = document.createElement("button"); logout.type = "button"; logout.className = "account-logout"; logout.textContent = "로그아웃";
      logout.addEventListener("click", async () => {
        logout.disabled = true;
        try {
          const { error } = await client.auth.signOut({ scope: "local" });
          if (error) throw error;
          location.replace("index.html");
        } catch (_) {
          logout.disabled = false;
          window.alert("로그아웃하지 못했습니다. 인터넷 연결을 확인한 뒤 다시 시도해 주세요.");
        }
      });
      nav.append(logout);
    } else {
      const a = document.createElement("a"); a.href = "login.html"; a.textContent = "로그인"; a.className = "account-login"; nav.append(a);
    }
    document.getElementById("mobileMenu")?.setAttribute("aria-expanded", "false");
    nav.classList.remove("open");
  }
  function applySession(session) {
    const next = session?.user || null;
    const changed = (user?.id || null) !== (next?.id || null);
    if (changed) {
      document.body.classList.remove("account-ready");
      window.dispatchEvent(new Event("sentry-account-changing"));
    }
    user = next;
    if (changed || !initialised) renderNavigation();
    if (initialised && changed && privatePage) location.replace(user ? location.pathname.split("/").pop() : loginUrl());
    window.dispatchEvent(new Event("sentry-auth-changed"));
  }
  // A page restored from browser history must re-check the account before revealing records.
  window.addEventListener("pagehide", () => { if (privatePage) document.body.classList.remove("account-ready"); });
  window.addEventListener("pageshow", event => {
    if (privatePage && event.persisted) { document.body.classList.remove("account-ready"); location.reload(); }
  });
  window.SentryAuth = {
    get client() { return client; }, get user() { return user; }, get error() { return configurationError; },
    safeNext, loginUrl, validConfig,
    async verifiedUser() {
      if (!client) throw new Error("인증 서버 연결 설정이 필요합니다.");
      const { data, error } = await client.auth.getUser();
      if (error || !data.user) throw new Error("로그인이 만료되었습니다. 다시 로그인해 주세요.");
      if (user?.id !== data.user.id) throw new Error("계정이 변경되었습니다. 페이지를 다시 열어 주세요.");
      return data.user;
    }
  };
  window.SentryAuth.ready = (async () => {
    if (!validConfig(window.SENTRY_CONFIG) || !window.supabase?.createClient) {
      configurationError = "로그인 서비스 연결 전입니다. 운영자가 서버 연결 설정을 완료하면 이용할 수 있습니다.";
      renderNavigation(); return null;
    }
    try {
      client = window.supabase.createClient(window.SENTRY_CONFIG.supabaseUrl, window.SENTRY_CONFIG.supabasePublishableKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: "sentry-account-session-v1", flowType: "implicit" }
      });
      client.auth.onAuthStateChange((_event, session) => { if (initialised) applySession(session); });
      const { data, error } = await client.auth.getSession();
      if (error) throw error;
      applySession(data.session); initialised = true;
      return user;
    } catch (_) {
      configurationError = "로그인 서비스에 연결하지 못했습니다. 인터넷 연결과 서버 설정을 확인해 주세요.";
      user = null; renderNavigation(); return null;
    }
  })();
})();
