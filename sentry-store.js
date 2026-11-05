/* Account-scoped cloud records. No private reagent cache is written to localStorage. */
(() => {
  "use strict";
  let owner = null, rows = [], versions = new Map(), readings = new Map(), revision = 0;
  const clone = value => JSON.parse(JSON.stringify(value));
  const emit = () => window.dispatchEvent(new Event("sentry-reagents-changed"));
  const failure = (error, message = "계정에 저장하지 못했습니다. 인터넷 연결을 확인한 뒤 다시 시도해 주세요.") => new Error(error?.message?.startsWith("계정") ? error.message : message);
  function clear() { owner = null; rows = []; versions.clear(); readings.clear(); revision++; }
  function identity() {
    const id = window.SentryAuth.user?.id;
    if (!id || id !== owner) throw new Error("계정이 변경되었거나 로그인이 만료되었습니다. 다시 로그인해 주세요.");
    return id;
  }
  function same(id) { if (window.SentryAuth.user?.id !== id || owner !== id) throw new Error("계정이 변경되었습니다. 페이지를 다시 열어 주세요."); }
  function unpack(row) { return { ...row.data, id: row.id }; }
  window.addEventListener("sentry-account-changing", clear);
  async function load() {
    const auth = window.SentryAuth;
    const account = await auth.verifiedUser();
    const id = account.id;
    if (owner !== id) { clear(); owner = id; }
    const stamp = ++revision;
    const [reagents, latest] = await Promise.all([
      auth.client.from("sentry_reagents").select("id,data,version").eq("user_id", id).order("created_at", { ascending: true }),
      auth.client.from("sentry_sensor_latest").select("reagent_id,data,received_at").eq("user_id", id)
    ]);
    same(id);
    if (stamp !== revision) return;
    if (reagents.error || latest.error) throw failure(reagents.error || latest.error, "계정 데이터를 불러오지 못했습니다. 인터넷 연결과 서버의 데이터베이스 설정을 확인해 주세요.");
    rows = reagents.data.map(unpack); versions = new Map(reagents.data.map(x => [x.id, x.version]));
    readings = new Map(latest.data.map(x => [x.reagent_id, { ...x.data, receivedAt: Date.parse(x.received_at) }]));
    emit();
  }
  async function add(item) {
    const id = identity();
    const { data, error } = await window.SentryAuth.client.from("sentry_reagents").insert({ user_id: id, id: String(item.id), data: clone(item) }).select("id,data,version").single();
    same(id);
    if (error || !data) throw failure(error);
    revision++; rows.push(unpack(data)); versions.set(data.id, data.version); emit(); return unpack(data);
  }
  async function update(reagentId, patch) {
    const id = identity(), previous = rows.find(x => x.id === reagentId);
    if (!previous) throw new Error("계정에서 시약을 찾을 수 없습니다. 새로고침해 주세요.");
    const merged = { ...previous, ...clone(patch), id: reagentId };
    const { data, error } = await window.SentryAuth.client.from("sentry_reagents").update({ data: merged }).eq("user_id", id).eq("id", reagentId).eq("version", versions.get(reagentId)).select("id,data,version").maybeSingle();
    same(id);
    if (error) throw failure(error);
    if (!data) throw new Error("다른 창에서 시약이 수정되었거나 삭제되었습니다. 새로고침 후 다시 편집해 주세요.");
    revision++; rows = rows.map(x => x.id === reagentId ? unpack(data) : x); versions.set(reagentId, data.version); emit();
  }
  async function remove(reagentId) {
    const id = identity();
    const { data, error } = await window.SentryAuth.client.from("sentry_reagents").delete().eq("user_id", id).eq("id", reagentId).eq("version", versions.get(reagentId)).select("id");
    same(id);
    if (error) throw failure(error);
    if (!data?.length) throw new Error("다른 창에서 시약이 수정되었거나 삭제되었습니다. 새로고침 후 다시 확인해 주세요.");
    revision++; rows = rows.filter(x => x.id !== reagentId); versions.delete(reagentId); readings.delete(reagentId); emit();
  }
  async function saveReading(reagentId, reading) {
    const id = identity();
    if (!rows.some(x => x.id === reagentId)) throw new Error("계정에 등록된 시약을 선택해 주세요.");
    const payload = {
      temp: reading.temp, humidity: reading.humidity, open: reading.open,
      tiltStatus: reading.tiltStatus, irDetected: reading.irDetected, buzzer: reading.buzzer,
      firmwareWarning: reading.firmwareWarning, uptime: reading.uptime
    };
    const { error } = await window.SentryAuth.client.from("sentry_sensor_latest").upsert({ user_id: id, reagent_id: reagentId, data: payload, received_at: new Date(reading.receivedAt).toISOString() }, { onConflict: "user_id,reagent_id" });
    same(id);
    if (error) throw failure(error, "센서값을 계정에 저장하지 못했습니다. 인터넷 연결을 확인해 주세요.");
    revision++; readings.set(reagentId, { ...payload, receivedAt: reading.receivedAt });
  }
  function overlay(item) {
    const reading = readings.get(String(item.id));
    return !reading ? item : { ...item, ...clone(reading), cabinetStatus: "unknown", stateSource: "sensor", sensorBound: true, sensorFresh: false };
  }
  async function importRecords(items) {
    const id = identity();
    const existing = new Set(rows.map(x => x.id));
    const batch = items.filter(x => !existing.has(x.id));
    if (!batch.length) return 0;
    const { data, error } = await window.SentryAuth.client.from("sentry_reagents").insert(batch.map(x => ({ user_id: id, id: x.id, data: clone(x) }))).select("id,data,version");
    same(id);
    if (error) throw failure(error, "시약 파일을 계정에 저장하지 못했습니다. 기존 데이터는 변경되지 않았습니다.");
    revision++; rows.push(...data.map(unpack)); for (const x of data) versions.set(x.id, x.version); emit(); return data.length;
  }
  window.SentryStore = { load, add, update, remove, saveReading, importRecords, overlay, clear, list: () => clone(rows) };
})();
