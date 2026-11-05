(() => {
  "use strict";
  const form = document.getElementById("accountForm"), message = document.getElementById("accountMessage");
  const mode = document.body.dataset.accountMode;
  const show = (text, kind = "") => { message.textContent = text; message.className = "account-message " + kind; message.hidden = false; };
  const next = window.SentryAuth.safeNext(new URLSearchParams(location.search).get("next"));
  const url = file => new URL(file, location.href).href;
  const fail = error => ({
    invalid_credentials: "이메일 또는 비밀번호를 확인해 주세요.", email_not_confirmed: "가입 확인 이메일의 링크를 먼저 눌러 주세요.",
    user_already_exists: "이미 사용 중인 이메일입니다. 로그인하거나 비밀번호를 재설정해 주세요.",
    weak_password: "비밀번호가 서버의 보안 조건을 충족하지 않습니다. 더 긴 비밀번호를 사용해 주세요.",
    over_email_send_rate_limit: "이메일 요청이 많습니다. 잠시 후 다시 시도해 주세요.",
    over_request_rate_limit: "요청이 많습니다. 잠시 후 다시 시도해 주세요."
  }[error?.code] || "요청을 처리하지 못했습니다. 인터넷 연결을 확인하거나 잠시 후 다시 시도해 주세요.");
  form.querySelectorAll("button").forEach(x => x.disabled = true);
  window.SentryAuth.ready.then(user => {
    if (window.SentryAuth.error) { show(window.SentryAuth.error, "is-error"); return; }
    if (user && ["login", "signup"].includes(mode)) { location.replace(next); return; }
    if (mode === "reset" && !user) { show("비밀번호 재설정 이메일의 링크를 통해 이 화면을 열어 주세요.", "is-error"); return; }
    form.querySelectorAll("button").forEach(x => x.disabled = false);
  });
  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const button = form.querySelector('button[type="submit"]');
    if (button.disabled) return;
    const auth = window.SentryAuth.client;
    if (!auth) { show(window.SentryAuth.error, "is-error"); return; }
    const email = form.elements.namedItem("email")?.value.trim();
    const password = form.elements.namedItem("password")?.value;
    const confirm = form.elements.namedItem("passwordConfirm")?.value;
    if (confirm !== undefined && password !== confirm) { show("비밀번호가 서로 다릅니다.", "is-error"); return; }
    button.disabled = true; show("처리 중입니다…");
    try {
      if (mode === "login") {
        const { error } = await auth.auth.signInWithPassword({ email, password });
        if (error) throw error;
        form.reset(); location.replace(next);
      } else if (mode === "signup") {
        const { data, error } = await auth.auth.signUp({ email, password, options: { emailRedirectTo: url("login.html?confirmed=1"), data: { display_name: form.elements.namedItem("displayName").value.trim() } } });
        if (error) throw error;
        form.reset();
        if (data.session) { location.replace("my-sentry.html"); return; }
        show("가입 요청을 받았습니다. 이메일로 도착한 확인 링크를 누른 뒤 로그인해 주세요. 이미 가입한 이메일이라면 로그인 또는 비밀번호 찾기를 이용하세요.", "is-success");
      } else if (mode === "forgot") {
        const { error } = await auth.auth.resetPasswordForEmail(email, { redirectTo: url("reset-password.html") });
        if (error) throw error;
        form.reset(); show("가입한 이메일이라면 비밀번호 재설정 링크가 발송됩니다. 받은편지함과 스팸함을 확인해 주세요.", "is-success");
      } else if (mode === "reset") {
        const { error } = await auth.auth.updateUser({ password });
        if (error) throw error;
        form.reset(); show("비밀번호를 변경했습니다. 나의 SENTRY로 이동해 이용할 수 있습니다.", "is-success");
      }
    } catch (error) { show(fail(error), "is-error"); }
    finally { button.disabled = false; }
  });
})();
