/* An explicit file import, never an automatic transfer of another browser user's data. */
(() => {
  "use strict";
  const file = document.getElementById("accountImportFile"), button = document.getElementById("accountImportButton"), message = document.getElementById("accountImportMessage");
  if (!file) return;
  file.addEventListener("change", () => { button.disabled = !file.files.length; message.textContent = "선택한 파일의 시약을 현재 로그인한 계정에 추가합니다."; });
  button.addEventListener("click", async () => {
    const selected = file.files[0]; if (!selected) return;
    button.disabled = true;
    try {
      if (selected.size > 2 * 1024 * 1024) throw new Error("2MB 이하의 SENTRY JSON 백업 파일을 선택해 주세요.");
      const parsed = JSON.parse(await selected.text());
      if (!Array.isArray(parsed) || parsed.length > 1000) throw new Error("최대 1,000개의 시약이 담긴 SENTRY JSON 배열이 필요합니다.");
      const seen = new Set(), fields = ["name", "formula", "formType", "concentration", "storage", "location", "notes"];
      const items = parsed.map(x => {
        if (!x || typeof x !== "object" || !String(x.name || "").trim()) throw new Error("시약 이름이 없는 항목이 있습니다.");
        const id = String(x.id || crypto.randomUUID());
        if (id.length > 128 || seen.has(id)) throw new Error("파일에 중복되거나 잘못된 시약 번호가 있습니다.");
        seen.add(id);
        return { id, ...Object.fromEntries(fields.map(k => [k, String(x[k] ?? "")])), stateSource: "simulation" };
      });
      message.textContent = "내 계정으로 가져오는 중입니다…";
      const count = await window.SentryStore.importRecords(items);
      message.textContent = `${count}개 시약을 내 계정에 추가했습니다. 같은 번호의 기존 시약은 변경하지 않았습니다.`;
      file.value = "";
    } catch (error) { message.textContent = error instanceof SyntaxError ? "올바른 JSON 파일이 아닙니다." : error.message; }
    finally { button.disabled = !file.files.length; }
  });
})();
