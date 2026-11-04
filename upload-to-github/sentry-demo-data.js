/* Initialise only a genuinely empty browser. Never reset or re-add deleted saved items. */
(() => {
  "use strict";
  const examples = [
    {id:"demo-1",name:"염화 나트륨",formula:"NaCl",formType:"solid",concentration:"고체",storage:"실온 · 건조 보관",location:"시약장 A-01",notes:"예시 보관 정보",light:"일반광"},
    {id:"demo-2",name:"과산화수소",formula:"H₂O₂",formType:"liquid",concentration:"예시 용액",storage:"차광 보관 조건 확인",location:"시약장 B-03",notes:"제품 라벨과 해당 제품의 SDS를 확인하세요.",light:"차광 조건 확인"},
    {id:"demo-3",name:"에탄올",formula:"C₂H₅OH",formType:"liquid",concentration:"예시 용액",storage:"인화성 물질 보관장",location:"인화성 물질 보관장",notes:"실제 농도별 제품 라벨과 SDS 확인",light:"일반광"},
    {id:"demo-4",name:"질산 은",formula:"AgNO₃",formType:"solid",concentration:"고체",storage:"차광 및 보관 이력 확인",location:"시약장 B-05",notes:"보관 이력과 차광 조건을 함께 검토하세요.",light:"차광 조건 확인"},
    {id:"demo-5",name:"황산 구리(II)",formula:"CuSO₄",formType:"solid",concentration:"고체",storage:"제품 라벨 기준 확인",location:"시약장 A-04",notes:"예시 보관 정보",light:"일반광"},
    {id:"demo-6",name:"염산",formula:"HCl",formType:"liquid",concentration:"예시 용액",storage:"부식성 물질 보관 절차 확인",location:"부식성 물질 보관장",notes:"농도별 SDS 확인 필요",light:"일반광"},
    {id:"demo-7",name:"질산 칼륨",formula:"KNO₃",formType:"solid",concentration:"고체",storage:"제품 라벨 기준 확인",location:"시약장 C-02",notes:"예시 보관 정보",light:"일반광"},
    {id:"demo-8",name:"아세트산",formula:"CH₃COOH",formType:"liquid",concentration:"예시 용액",storage:"농도와 제품 라벨 확인",location:"시약장 C-04",notes:"농도별 취급 기준 확인",light:"일반광"},
    {id:"demo-humidity",name:"염화 칼슘",formula:"CaCl₂",formType:"solid",concentration:"고체",storage:"건조 상태 유지 · 습기 주의",location:"시약장 C-05",notes:"흡습성 물질입니다. 실제 보관 조건은 제품 라벨과 SDS를 확인하세요.",light:"일반광"}
  ];
  window.SENTRY_DEMOS = examples;
  const KEY = "sentry-reagents-v1";
  const MIGRATION_KEY = "sentry-no-fake-sensor-values-v1";
  try {
    const stored = localStorage.getItem(KEY);
    if (stored === null) {
      // First visit: preserve the original sample reagent identities and locations.
      localStorage.setItem(KEY, JSON.stringify(examples));
    } else if (localStorage.getItem(MIGRATION_KEY) !== "1") {
      // One-time migration: erase only the simulated sensor attributes.
      // Name, formula, location, concentration, storage, notes and registered
      // reagent entries are NEVER changed by this migration.
      const rows = JSON.parse(stored);
      if (Array.isArray(rows)) {
        const cleaned = rows.map(item => {
          if (!item || typeof item !== "object") return item;
          const isDemo = String(item.id || "").startsWith("demo-");
          const isSimulation = item.stateSource === "simulation" || isDemo;
          if (!isSimulation) return item;
          const copy = { ...item };
          for (const field of ["temp", "humidity", "open", "cabinetStatus",
            "tiltStatus", "manualSimulationStatus", "stateSource"]) delete copy[field];
          // Demo-only review flags were seeded as part of the fake scenario.
          if (isDemo) delete copy.review;
          return copy;
        });
        localStorage.setItem(KEY, JSON.stringify(cleaned));
      }
    }
    localStorage.setItem(MIGRATION_KEY, "1");
  } catch (error) {
    console.warn("SENTRY: local sample migration unavailable", error);
  }
})();
