// Remembers where you were, so a phone that closes DayFlow in the background doesn't send you back to the start.
//  - View state (tab, day, notebook, goal…) is restored if you return within a few hours.
//  - A half-filled form, or an open note, is restored if you return within a day.
// Kept under its own keys (not part of backups) and cleared whenever the form is saved or closed.
const UI_KEY = "dfui";
const DRAFT_KEY = "dfdraft";
const UI_TTL = 6 * 3600 * 1000;
const DRAFT_TTL = 24 * 3600 * 1000;

const providers = {};
let noteProvider = null;
let pendingMeta = null, draftMeta = null;

const read = (key, ttl) => {
  try {
    const v = JSON.parse(localStorage.getItem(key) || "null");
    return v && typeof v.t === "number" && Date.now() - v.t < ttl ? v : null;
  } catch (e) { return null; }
};
const write = (key, val) => { try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* best effort */ } };
const remove = (key) => { try { localStorage.removeItem(key); } catch (e) { /* ignore */ } };

export function registerViewState(name, get, set) { providers[name] = { get, set }; }
export function registerNoteState(fn) { noteProvider = fn; }

export function saveUi() {
  const views = {};
  Object.entries(providers).forEach(([k, p]) => { try { views[k] = p.get(); } catch (e) { /* skip */ } });
  let note = null;
  try { note = noteProvider ? noteProvider() : null; } catch (e) { /* skip */ }
  write(UI_KEY, { t: Date.now(), route: window.location.hash, views, note });
}

/** Before the first screen is drawn: puts back tab + view state. Returns the saved note state (if any) for later. */
export function restoreUiEarly() {
  const st = read(UI_KEY, UI_TTL);
  if (!st) return null;
  Object.entries(st.views || {}).forEach(([k, v]) => { try { if (providers[k]) providers[k].set(v); } catch (e) { /* skip */ } });
  if (!window.location.hash && st.route && /^#\/?(today|calendar|diary|goals|more)/.test(st.route)) {
    try { history.replaceState(history.state, "", st.route); } catch (e) { window.location.hash = st.route; }
  }
  return st.note || null;
}

// ---- unsaved forms ----
/** Call just before openSheet() in a form that should survive being backgrounded. */
export function trackDraft(kind, args) { pendingMeta = { kind, args: args || {} }; }
/** Called by openSheet. */
export function sheetOpened() { draftMeta = pendingMeta; pendingMeta = null; remove(DRAFT_KEY); }
export function clearDraft() { draftMeta = null; pendingMeta = null; remove(DRAFT_KEY); }

function collect(sheetEl) {
  const fields = [];
  sheetEl.querySelectorAll("input[id], select[id], textarea[id], .tx[id]").forEach((el) => {
    if (el.type === "file" || el.type === "password") return;
    if (el.type === "checkbox" || el.type === "radio") fields.push({ id: el.id, c: el.checked });
    else fields.push({ id: el.id, v: el.value, d: el.type === "date" ? 1 : 0, s: el.tagName === "SELECT" ? 1 : 0 });
  });
  const swatches = {};
  sheetEl.querySelectorAll(".swatches[id]").forEach((g) => {
    const s = g.querySelector(".swatch.selected");
    if (s) swatches[g.id] = s.getAttribute("data-color");
  });
  return { fields, swatches };
}

let saveTimer = null;
export function saveDraft() {
  clearTimeout(saveTimer);
  if (!draftMeta) return;
  const sh = document.getElementById("sheet");
  if (!sh || sh.classList.contains("hidden")) return;
  write(DRAFT_KEY, { t: Date.now(), kind: draftMeta.kind, args: draftMeta.args, ...collect(sh) });
}
const queueDraft = () => { clearTimeout(saveTimer); saveTimer = setTimeout(saveDraft, 300); };

export function takeDraft() { return read(DRAFT_KEY, DRAFT_TTL); }

/** After the form has been reopened: puts the typed values back. Dates first, then selects (their options depend on the date), then the rest. */
export function applyDraft(draft) {
  const sh = document.getElementById("sheet");
  if (!sh || !draft) return;
  const set = (f) => {
    const el = sh.querySelector(`#${CSS.escape(f.id)}`);
    if (!el) return;
    if ("c" in f) { if (el.checked !== f.c) { el.checked = f.c; el.dispatchEvent(new Event("change", { bubbles: true })); } return; }
    el.value = f.v;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  };
  const list = draft.fields || [];
  list.filter((f) => f.d).forEach(set);
  list.filter((f) => f.s).forEach(set);
  list.filter((f) => !f.d && !f.s).forEach(set);
  Object.entries(draft.swatches || {}).forEach(([gid, color]) => {
    const sw = [...sh.querySelectorAll(`#${CSS.escape(gid)} .swatch`)].find((s) => s.getAttribute("data-color") === color);
    if (sw) sw.click();
  });
}

export function startSession() {
  const sheetEl = document.getElementById("sheet");
  if (sheetEl) { sheetEl.addEventListener("input", queueDraft); sheetEl.addEventListener("change", queueDraft); sheetEl.addEventListener("click", queueDraft); }
  const flush = () => { saveUi(); saveDraft(); };
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flush(); });
  window.addEventListener("pagehide", flush);
  window.addEventListener("hashchange", saveUi);
}
