function gsHoursOf(mins) {
  return mins ? String(Math.round((mins / 60) * 100) / 100) : "";
}
// Sheets for goals: create/edit a goal (with an optional target) and log progress toward a target.
import { store } from "../store.js";
import { openSheet, closeSheet, wireSheetClose, notifyChanged } from "./sheet.js";
import { showUndoToast } from "./toast.js";
import { swatchesHtml, wireSwatches, fieldErrorHtml, showFieldError, clearFieldError } from "../forms.js";
import { goalNorm } from "../goals.js";
import { escapeHtml, dateKey, GOAL_EMOJIS, PALETTE, uid } from "../utils.js";

// A wider set to pick from; anything else can be typed or pasted into the "Your own" box.
const MORE_EMOJIS = ["🎯","🌱","🏆","📈","🔥","💡","🧗","📖","📚","✍️","🎨","🎵","🎸","🎹","🏃","🚴","🏊","🧘","💪","🥗","💧","😴","🧠","💻","🛠️","🔬","🧪","📐","🗣️","🌍","✈️","🏠","💰","🛒","🧹","🌿","🐶","❤️","🤝","🎓","📝","⭐","🚀","🎮","📷","🍳","🧵","⚽"];

// First visible character (so a pasted word or several emoji become one icon).
function gsFirstChar(str) {
  const t = String(str || "").trim();
  if (!t) return "";
  try {
    const seg = new Intl.Segmenter(undefined, { granularity: "grapheme" });
    for (const x of seg.segment(t)) return x.segment;
  } catch (e) { /* older browsers */ }
  return Array.from(t)[0] || "";
}

/**
 * Create a goal (existing = null) or edit one. onSaved(goalId) runs after saving.
 * Targets are optional and can be mixed: milestones, time to log, a date — any, all or none.
 */
export function openGoalComposer(existing = null, onSaved) {
  const g = existing ? goalNorm(existing) : {
    id: null, name: "", emoji: GOAL_EMOJIS[0], color: (store.getPalette()[0] || PALETTE[0]), why: "",
    types: [], milestones: [], targetMins: 0, targetDate: "",
  };
  const raw = existing || {};
  let color = g.color;
  let emoji = g.emoji;
  const on = { milestones: g.useMilestones, time: g.useTime, date: g.useDate };
  // Values for a switched-off type are kept, so toggling back loses nothing.
  let ms = (g.milestones || []).map((m) => ({ ...m }));
  const savedMins = g.targetMins || Number(raw.targetMins) || 0;
  const savedDate = g.targetDate || raw.targetDate || "";

  openSheet(`
    <button class="icon-btn sheet-close" data-action="close" aria-label="Close">✕</button>
    <h2 class="sheet-title">${existing ? "Edit goal" : "New goal"} ◎</h2>

    <div class="field">
      <label>Goal</label>
      <input type="text" id="gf-name" value="${escapeHtml(g.name)}" placeholder="What are you working toward?" />
    </div>

    <div class="field">
      <label>Icon</label>
      <div class="emoji-row" id="gf-emoji"></div>
      <div class="emoji-more hidden" id="gf-emoji-more">
        <div class="emoji-row" id="gf-emoji-grid">
          ${MORE_EMOJIS.map((e) => `<button type="button" class="emoji-opt" data-emoji="${e}">${e}</button>`).join("")}
        </div>
        <div class="emoji-own">
          <input type="text" id="gf-emoji-own" placeholder="Your own — type or paste an emoji" autocomplete="off" />
          <button type="button" class="btn" id="gf-emoji-use">Use</button>
        </div>
      </div>
    </div>

    <div class="field">
      <label>Colour</label>
      ${swatchesHtml(color, "gf-colors")}
    </div>

    <div class="field">
      <label>Why it matters (optional)</label>
      <textarea id="gf-why" rows="2" placeholder="A line to come back to…">${escapeHtml(g.why)}</textarea>
    </div>

    <div class="field">
      <label>Targets (optional)</label>
      <p class="field-hint">Switch on any, all or none. They're only for you — nothing is scheduled or flagged if you fall short.</p>
      <div class="gf-types" id="gf-types">
        <button type="button" class="filter-chip ${on.milestones ? "active" : ""}" data-ttype="milestones">Milestones</button>
        <button type="button" class="filter-chip ${on.time ? "active" : ""}" data-ttype="time">Time to log</button>
        <button type="button" class="filter-chip ${on.date ? "active" : ""}" data-ttype="date">A date</button>
      </div>

      <div class="gf-target ${on.milestones ? "" : "hidden"}" id="gf-box-milestones">
        <div id="gf-ms-list"></div>
        <button type="button" class="btn btn-ghost" id="gf-ms-add">+ Add milestone</button>
        <p class="field-hint field-hint-after">Small steps toward the goal. You tick them off yourself on the goal page.</p>
      </div>
      <div class="gf-target ${on.time ? "" : "hidden"}" id="gf-box-time">
        <input type="number" min="0.25" step="0.25" id="gf-hours" value="${gsHoursOf(savedMins)}" placeholder="Hours in total" />
        <p class="field-hint field-hint-after">Time logged on linked tasks counts toward it. You can also add time by hand.</p>
      </div>
      <div class="gf-target ${on.date ? "" : "hidden"}" id="gf-box-date">
        <input type="date" id="gf-date" value="${savedDate}" />
        <p class="field-hint field-hint-after">The day you're aiming for. The goal page shows how many days are left — nothing changes when it passes.</p>
      </div>
    </div>
    ${fieldErrorHtml("gf-error")}

    <div class="btn-row">
      <button class="btn" id="gf-cancel">Cancel</button>
      <button class="btn btn-primary" id="gf-save">${existing ? "Save" : "Add goal"}</button>
    </div>
  `);

  wireSheetClose();
  wireSwatches("gf-colors", (c) => (color = c));
  document.getElementById("gf-cancel").addEventListener("click", closeSheet);

  // ---- icon ----
  const emojiRow = document.getElementById("gf-emoji");
  const moreBox = document.getElementById("gf-emoji-more");
  const ownInput = document.getElementById("gf-emoji-own");
  const paintEmoji = () => {
    const shown = GOAL_EMOJIS.slice();
    if (emoji && !shown.includes(emoji)) shown.unshift(emoji);
    emojiRow.innerHTML = shown.map((e) => `<button type="button" class="emoji-opt ${e === emoji ? "selected" : ""}" data-emoji="${e}">${e}</button>`).join("")
      + `<button type="button" class="emoji-opt emoji-toggle" id="gf-emoji-toggle" aria-label="More icons">${moreBox.classList.contains("hidden") ? "＋" : "−"}</button>`;
    document.getElementById("gf-emoji-grid").querySelectorAll(".emoji-opt").forEach((x) => x.classList.toggle("selected", x.getAttribute("data-emoji") === emoji));
    emojiRow.querySelectorAll("[data-emoji]").forEach((b) => b.addEventListener("click", () => { emoji = b.getAttribute("data-emoji"); paintEmoji(); }));
    document.getElementById("gf-emoji-toggle").addEventListener("click", () => { moreBox.classList.toggle("hidden"); paintEmoji(); });
  };
  document.getElementById("gf-emoji-grid").querySelectorAll("[data-emoji]").forEach((b) => b.addEventListener("click", () => { emoji = b.getAttribute("data-emoji"); paintEmoji(); }));
  const useOwn = () => { const c = gsFirstChar(ownInput.value); if (c) { emoji = c; ownInput.value = ""; paintEmoji(); } };
  document.getElementById("gf-emoji-use").addEventListener("click", useOwn);
  ownInput.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); useOwn(); } });
  paintEmoji();

  // ---- target types (independent switches) ----
  const typeRow = document.getElementById("gf-types");
  typeRow.querySelectorAll("[data-ttype]").forEach((b) => b.addEventListener("click", () => {
    const t = b.getAttribute("data-ttype");
    on[t] = !on[t];
    b.classList.toggle("active", on[t]);
    document.getElementById(`gf-box-${t}`).classList.toggle("hidden", !on[t]);
    if (t === "milestones" && on[t] && !ms.length) { ms.push({ id: uid(), title: "", doneAt: null }); paintMs(); }
    clearFieldError("gf-error");
  }));

  // ---- milestones (add / rename / remove) ----
  const msList = document.getElementById("gf-ms-list");
  const paintMs = (focusLast) => {
    msList.innerHTML = ms.map((m, i) => `
      <div class="gf-ms-row">
        <input type="text" data-ms="${i}" value="${escapeHtml(m.title)}" placeholder="e.g. Finish chapter 1" maxlength="80" />
        <button type="button" class="icon-btn" data-ms-rm="${i}" aria-label="Remove milestone">✕</button>
      </div>`).join("");
    msList.querySelectorAll("[data-ms]").forEach((inp) => inp.addEventListener("input", () => { ms[+inp.getAttribute("data-ms")].title = inp.value; }));
    msList.querySelectorAll("[data-ms-rm]").forEach((b) => b.addEventListener("click", () => { ms.splice(+b.getAttribute("data-ms-rm"), 1); paintMs(); }));
    if (focusLast) { const all = msList.querySelectorAll("[data-ms]"); if (all.length) all[all.length - 1].focus(); }
  };
  document.getElementById("gf-ms-add").addEventListener("click", () => { ms.push({ id: uid(), title: "", doneAt: null }); paintMs(true); });
  paintMs();

  document.getElementById("gf-save").addEventListener("click", () => {
    clearFieldError("gf-error");
    const name = document.getElementById("gf-name").value.trim();
    if (!name) { document.getElementById("gf-name").focus(); return; }

    const cleanMs = ms.map((m) => ({ ...m, title: m.title.trim() })).filter((m) => m.title);
    const hours = Number(document.getElementById("gf-hours").value);
    const date = document.getElementById("gf-date").value || "";
    if (on.milestones && !cleanMs.length) { showFieldError("gf-error", "Add at least one milestone, or switch Milestones off."); return; }
    if (on.time && !(hours > 0)) { showFieldError("gf-error", "Enter the hours you're aiming for, or switch Time to log off."); return; }
    if (on.date && !date) { showFieldError("gf-error", "Pick the date you're aiming for, or switch A date off."); return; }
    if (on.date && date < dateKey() && date !== savedDate) { showFieldError("gf-error", "Pick today or a later day for the target date."); return; }

    const payload = {
      name, emoji, color,
      why: document.getElementById("gf-why").value.trim(),
      targetTypes: ["milestones", "time", "date"].filter((t) => on[t]),
      milestones: cleanMs,
      targetMins: hours > 0 ? Math.round(hours * 60) : (savedMins || 0),
      targetDate: date || savedDate,
      targetType: null, targetCount: null, targetUnit: null, // retired fields from v17/v18
    };
    let id = existing ? existing.id : null;
    if (existing) store.updateGoal(existing.id, payload);
    else id = store.addGoal(payload);
    closeSheet();
    notifyChanged();
    if (onSaved) onSaved(id);
  });
}

/** Add time by hand toward a time target (minutes). Entries can be removed from the goal's page. */
export function openGoalLogSheet(goal, onDone) {
  const g = goalNorm(goal);
  if (!g.useTime) return;
  openSheet(`
    <button class="icon-btn sheet-close" data-action="close" aria-label="Close">✕</button>
    <h2 class="sheet-title">Log time ◎</h2>
    <p class="field-hint">${escapeHtml(g.name)}</p>
    <div class="field">
      <label>Time (minutes)</label>
      <input type="number" min="1" step="1" id="gl-amount" placeholder="e.g. 45" />
    </div>
    <div class="duration-chips" id="gl-chips">
      <button type="button" class="chip" data-mins="15">15m</button>
      <button type="button" class="chip" data-mins="30">30m</button>
      <button type="button" class="chip" data-mins="60">1h</button>
      <button type="button" class="chip" data-mins="120">2h</button>
    </div>
    ${fieldErrorHtml("gl-error")}
    <div class="btn-row">
      <button class="btn" id="gl-cancel">Cancel</button>
      <button class="btn btn-primary" id="gl-save">Add</button>
    </div>
  `);
  wireSheetClose();
  document.getElementById("gl-cancel").addEventListener("click", closeSheet);
  const input = document.getElementById("gl-amount");
  document.getElementById("gl-chips").querySelectorAll("[data-mins]").forEach((c) => c.addEventListener("click", () => { input.value = c.getAttribute("data-mins"); }));
  input.focus();
  document.getElementById("gl-save").addEventListener("click", () => {
    clearFieldError("gl-error");
    const amount = Math.floor(Number(input.value));
    if (!(amount > 0)) { showFieldError("gl-error", "Enter a number above zero."); return; }
    const entryId = store.addGoalProgress(g.id, { kind: "time", amount });
    closeSheet();
    notifyChanged();
    if (onDone) onDone();
    showUndoToast("Time added", () => { store.removeGoalProgress(g.id, entryId); notifyChanged(); if (onDone) onDone(); });
  });
}

/** Rename or remove one milestone, or add a new one (milestone = null). */
export function openMilestoneSheet(goalId, milestone, onDone) {
  openSheet(`
    <button class="icon-btn sheet-close" data-action="close" aria-label="Close">✕</button>
    <h2 class="sheet-title">${milestone ? "Edit milestone" : "New milestone"} ◎</h2>
    <div class="field">
      <label>Milestone</label>
      <input type="text" id="ms-title" maxlength="80" value="${escapeHtml(milestone ? milestone.title : "")}" placeholder="e.g. Finish chapter 1" />
    </div>
    ${fieldErrorHtml("ms-error")}
    <div class="btn-row">
      ${milestone ? `<button class="btn btn-danger" id="ms-del">Delete</button>` : `<button class="btn" id="ms-cancel">Cancel</button>`}
      <button class="btn btn-primary" id="ms-save">Save</button>
    </div>
  `);
  wireSheetClose();
  const input = document.getElementById("ms-title");
  input.focus();
  const list = () => (store.getGoals().find((x) => x.id === goalId) || {}).milestones || [];
  const done = () => { closeSheet(); notifyChanged(); if (onDone) onDone(); };
  const c = document.getElementById("ms-cancel"); if (c) c.addEventListener("click", closeSheet);
  document.getElementById("ms-save").addEventListener("click", () => {
    const title = input.value.trim();
    if (!title) { showFieldError("ms-error", "Give the milestone a name."); return; }
    const before = list();
    const next = milestone ? before.map((m) => (m.id === milestone.id ? { ...m, title } : m)) : [...before, { id: uid(), title, doneAt: null }];
    store.updateGoal(goalId, { milestones: next });
    done();
    if (!milestone) showUndoToast("Milestone added", () => { store.updateGoal(goalId, { milestones: before }); notifyChanged(); });
  });
  const d = document.getElementById("ms-del");
  if (d) d.addEventListener("click", () => {
    const before = list();
    store.updateGoal(goalId, { milestones: before.filter((m) => m.id !== milestone.id) });
    done();
    showUndoToast("Milestone deleted", () => { store.updateGoal(goalId, { milestones: before }); notifyChanged(); });
  });
}

/** Resuming a paused goal: offer a fresh target date (and hours, if it has them). onResume(patch) does the resuming. */
export function openResumeSheet(goal, onResume) {
  const g = goalNorm(goal);
  const today = dateKey();
  const dateVal = g.useDate && g.targetDate >= today ? g.targetDate : "";
  openSheet(`
    <button class="icon-btn sheet-close" data-action="close" aria-label="Close">✕</button>
    <h2 class="sheet-title">Resume this goal ◎</h2>
    <p class="field-hint">${escapeHtml(g.name)}${g.useDate && g.targetDate && g.targetDate < today ? " — its target date has passed." : ""}</p>
    <div class="field">
      <label>New target date${g.useDate ? "" : " (optional)"}</label>
      <input type="date" id="rs-date" min="${today}" value="${dateVal}" />
      <p class="field-hint field-hint-after">${g.useDate ? "Pick a new day to aim for, or keep the current one." : "Add one if you want a day to aim for."}</p>
    </div>
    ${g.useTime ? `
    <div class="field">
      <label>Hours to log in total</label>
      <input type="number" min="0.25" step="0.25" id="rs-hours" value="${gsHoursOf(g.targetMins)}" />
    </div>` : ""}
    ${fieldErrorHtml("rs-error")}
    <div class="btn-row">
      <button class="btn" id="rs-skip">${g.useDate ? "Keep as is" : "Just resume"}</button>
      <button class="btn btn-primary" id="rs-save">Resume</button>
    </div>
  `);
  wireSheetClose();
  document.getElementById("rs-skip").addEventListener("click", () => { closeSheet(); onResume({}); });
  document.getElementById("rs-save").addEventListener("click", () => {
    clearFieldError("rs-error");
    const date = document.getElementById("rs-date").value;
    if (date && date < today) { showFieldError("rs-error", "Pick today or a later day."); return; }
    const patch = {};
    if (date) {
      patch.targetDate = date;
      if (!g.useDate) patch.targetTypes = [...g.types, "date"];
    }
    const h = document.getElementById("rs-hours");
    if (h && Number(h.value) > 0) patch.targetMins = Math.round(Number(h.value) * 60);
    closeSheet();
    onResume(patch);
  });
}
