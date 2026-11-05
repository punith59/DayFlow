import { store } from "./store.js";
import { openSheet, closeSheet, wireSheetClose, sheet, notifyChanged } from "./components/sheet.js";
import { blocksForPicker, blockPickerLabel, getBlock, blockIsOvernight, blockTimesOn } from "./timeblocks.js";
import { openColorPicker } from "./components/colorPicker.js";
import { goalPickerList } from "./goals.js";
import { keyToDate, sameColor, uid, dateKey, escapeHtml, timeToMinutes, pad2, formatTime, formatShortDate, formatDurationMins, isInPast, PALETTE, TYPE_EMOJI, RECURRENCE_OPTIONS } from "./utils.js";

// =====================================================================
// Shared field helpers
// =====================================================================

function paletteDefault(i) {
  const p = store.getPalette();
  return p.length ? p[i % p.length] : PALETTE[i % PALETTE.length];
}

// Swatches = the user's saved palette (More → Colour palette) + a "+" to pick any other colour.
// A colour picked with "+" is used for this item and kept in the colour HISTORY — not in the palette.
export function swatchesHtml(selectedColor, groupId) {
  const palette = store.getPalette();
  const extra = selectedColor && !palette.some((c) => sameColor(c, selectedColor)) ? selectedColor : null;
  const sw = (c, isExtra) => `<button type="button" class="swatch ${sameColor(c, selectedColor) ? "selected" : ""}" data-color="${c}" ${isExtra ? "data-extra" : ""} style="background:${c}"></button>`;
  return `
    <div class="swatches" id="${groupId}">
      ${palette.map((c) => sw(c, false)).join("")}
      ${extra ? sw(extra, true) : ""}
      <button type="button" class="swatch-add" data-color-add aria-label="Pick another colour"></button>
    </div>
  `;
}
export function wireSwatches(groupId, onPick) {
  const group = document.getElementById(groupId);
  const select = (el) => {
    group.querySelectorAll(".swatch").forEach((s) => s.classList.remove("selected"));
    el.classList.add("selected");
    onPick(el.getAttribute("data-color"));
  };
  const bind = (el) => el.addEventListener("click", () => select(el));
  group.querySelectorAll("[data-color]").forEach(bind);
  group.querySelector("[data-color-add]").addEventListener("click", () => {
    const current = group.querySelector(".swatch.selected");
    openColorPicker({
      color: current ? current.getAttribute("data-color") : undefined,
      title: "Pick a colour",
      confirmLabel: "Use colour",
      onConfirm: (hex) => {
        store.addColorHistory(hex);
        let el = [...group.querySelectorAll("[data-color]")].find((x) => sameColor(x.getAttribute("data-color"), hex));
        if (!el) {
          group.querySelectorAll("[data-extra]").forEach((x) => x.remove());
          el = document.createElement("button");
          el.type = "button";
          el.className = "swatch";
          el.setAttribute("data-color", hex);
          el.setAttribute("data-extra", "");
          el.style.background = hex;
          group.insertBefore(el, group.querySelector("[data-color-add]"));
          bind(el);
        }
        select(el);
      },
    });
  });
}

// ---- Time block picker (shown only once the user has created time blocks) ----
function blockOptionsHtml(day, selectedId) {
  const blocks = blocksForPicker(day);
  const sel = selectedId ? getBlock(selectedId) : null;
  const stray = sel && !blocks.some((b) => b.id === sel.id)
    ? `<option value="${sel.id}" selected>${escapeHtml(sel.title)} — not on this date</option>` : "";
  return `<option value="">None</option>${stray}${blocks
    .map((b) => `<option value="${b.id}" ${b.id === selectedId ? "selected" : ""}>${escapeHtml(blockPickerLabel(b, day))}</option>`).join("")}`;
}
function blockFieldHtml(prefix, day, selectedId) {
  if (!store.getTimeBlocks().length) return "";
  return `
    <div class="field">
      <label>Time block (optional)</label>
      <p class="field-hint">Attach this to a class period or routine — e.g. a test during your Math class.</p>
      <select id="${prefix}-block">${blockOptionsHtml(day, selectedId)}</select>
      <p class="field-hint field-hint-after" id="${prefix}-block-hint"></p>
    </div>`;
}
// Picking a block only fills EMPTY start/end fields (visible, editable) — it never overwrites
// times the user typed and never changes anything after the form is saved.
function wireBlockSelect(prefix, dateId, startId, endId, applyNow) {
  const select = document.getElementById(`${prefix}-block`);
  if (!select) return;
  const hint = document.getElementById(`${prefix}-block-hint`);
  const dowOf = () => {
    const v = document.getElementById(dateId).value;
    return v ? keyToDate(v).getDay() : null;
  };

  // ----- Deadline (single due time): linked => the due time IS the block's start time; unlinked => empty -----
  if (startId && !endId) {
    const due = document.getElementById(startId);
    const sync = () => {
      const b = getBlock(select.value);
      if (b) {
        due.value = blockTimesOn(b, dowOf()).startTime;
        due.disabled = true;
        hint.textContent = "Due time follows the block's start. Unlink it to choose your own time.";
      } else {
        due.value = "";
        due.disabled = false;
        hint.textContent = "";
      }
    };
    select.addEventListener("change", sync);
    document.getElementById(dateId).addEventListener("change", () => {
      select.innerHTML = blockOptionsHtml(document.getElementById(dateId).value, select.value);
      sync(); // still linked: pick up that weekday's start time; dropped from the list: back to empty
    });
    if (select.value) {
      // Opening an already-linked deadline: keep its stored time, just lock the field.
      due.disabled = true;
      if (applyNow) sync(); else hint.textContent = "Due time follows the block's start. Unlink it to choose your own time.";
    }
    return;
  }

  // ----- Task / event: fill EMPTY start/end from the block (typed times are never overwritten) -----
  let filled = { s: null, e: null };
  const fill = () => {
    hint.textContent = "";
    const b = getBlock(select.value);
    if (!b || !startId) return;
    const tm = blockTimesOn(b, dowOf());
    const s = document.getElementById(startId);
    const e = document.getElementById(endId);
    const untouched = (!s.value && !e.value) || (s.value === filled.s && e.value === filled.e);
    if (!untouched || blockIsOvernight(tm)) return;
    s.value = tm.startTime;
    e.value = tm.endTime;
    filled = { s: s.value, e: e.value };
    hint.textContent = "Filled in from the block's time — change it if you like.";
  };
  select.addEventListener("change", fill);
  document.getElementById(dateId).addEventListener("change", () => {
    select.innerHTML = blockOptionsHtml(document.getElementById(dateId).value, select.value);
    hint.textContent = "";
  });
  if (applyNow) fill();
}
function readBlockId(prefix, existing) {
  const el = document.getElementById(`${prefix}-block`);
  return el ? el.value || null : (existing && existing.blockId) || null;
}

// Goals a task, event or deadline can belong to (active and paused, plus the one already chosen).
function goalSelectHtml(selectedGoalId, id = "tf-goal") {
  const options = goalPickerList(selectedGoalId)
    .map((g) => `<option value="${g.id}" ${g.id === selectedGoalId ? "selected" : ""}>${g.emoji ? g.emoji + " " : ""}${escapeHtml(g.name)}${g.status === "achieved" ? " (achieved)" : ""}</option>`)
    .join("");
  return `<select id="${id}"><option value="">None</option>${options}</select>`;
}
// Shown once at least one goal exists, so the forms stay uncluttered until then.
function goalFieldHtml(selectedGoalId, id, hint) {
  if (!store.getGoals().length) return "";
  return `
    <div class="field">
      <label>Goal (optional)</label>
      ${hint ? `<p class="field-hint">${hint}</p>` : ""}
      ${goalSelectHtml(selectedGoalId, id)}
    </div>`;
}
function readGoalId(id, existing) {
  const el = document.getElementById(id);
  return el ? el.value || null : (existing && existing.goalId) || null;
}

// Only events/deadlines that haven't already happened can be linked to.
function linkSelectHtml(selectedType, selectedId) {
  const events = store.getEvents().filter((e) => !isInPast(e.date, e.endTime || e.startTime));
  const deadlines = store.getDeadlines().filter((d) => !isInPast(d.dueDate, d.dueTime));
  const eventOptions = events
    .map((e) => `<option value="event:${e.id}" ${selectedType === "event" && selectedId === e.id ? "selected" : ""}>${TYPE_EMOJI.event} ${escapeHtml(e.title)} — ${formatShortDate(e.date)}${e.startTime ? ` ${formatTime(e.startTime)}` : ""}</option>`)
    .join("");
  const deadlineOptions = deadlines
    .map((d) => `<option value="deadline:${d.id}" ${selectedType === "deadline" && selectedId === d.id ? "selected" : ""}>${TYPE_EMOJI.deadline} ${escapeHtml(d.title)} — due ${formatShortDate(d.dueDate)}${d.dueTime ? ` ${formatTime(d.dueTime)}` : ""}</option>`)
    .join("");
  return `
    <select id="tf-link">
      <option value="">None</option>
      ${events.length ? `<optgroup label="Events">${eventOptions}</optgroup>` : ""}
      ${deadlines.length ? `<optgroup label="Deadlines">${deadlineOptions}</optgroup>` : ""}
    </select>
    ${(store.getEvents().length > events.length || store.getDeadlines().length > deadlines.length) ? `<p class="field-hint field-hint-after">Past events and deadlines aren't shown — only upcoming ones can be linked.</p>` : ""}
  `;
}

function recurrenceSelectHtml(selectedValue) {
  return `
    <select id="tf-recurrence">
      ${RECURRENCE_OPTIONS.map((o) => `<option value="${o.value}" ${o.value === (selectedValue || "none") ? "selected" : ""}>${o.label}</option>`).join("")}
    </select>
  `;
}

// ---- Duration chips: fixed presets + a custom minutes option, scoped per form via `prefix` ----
function durationChipsHtml(prefix) {
  return `
    <div class="duration-chips" data-duration-group="${prefix}">
      <button type="button" class="chip" data-mins="15">15m</button>
      <button type="button" class="chip" data-mins="30">30m</button>
      <button type="button" class="chip" data-mins="60">1h</button>
      <button type="button" class="chip" data-mins="120">2h</button>
      <button type="button" class="chip" data-mins="custom">Custom</button>
    </div>
    <div class="duration-custom collapsed" id="${prefix}-duration-custom">
      <input type="number" min="1" placeholder="Minutes" id="${prefix}-duration-mins" />
      <button type="button" class="btn" id="${prefix}-duration-apply">Set</button>
    </div>
  `;
}
function applyDuration(startId, endId, mins) {
  const startInput = document.getElementById(startId);
  const endInput = document.getElementById(endId);
  if (!startInput.value) startInput.value = "09:00";
  const total = timeToMinutes(startInput.value) + mins;
  const h = Math.floor(total / 60) % 24;
  const m = total % 60;
  endInput.value = `${pad2(h)}:${pad2(m)}`;
}
// opts.onNoStart(mins): when set and the start time is empty, a duration chip
// records a plain duration instead of inventing a 9am start time.
function wireDurationChips(scope, startId, endId, prefix, opts = {}) {
  const group = scope.querySelector(`[data-duration-group="${prefix}"]`);
  const customBox = scope.querySelector(`#${prefix}-duration-custom`);
  const pick = (mins) => {
    const startInput = document.getElementById(startId);
    if (!startInput.value && opts.onNoStart) opts.onNoStart(mins);
    else applyDuration(startId, endId, mins);
  };
  group.querySelectorAll(".chip[data-mins]").forEach((chip) => {
    chip.addEventListener("click", () => {
      const val = chip.getAttribute("data-mins");
      if (val === "custom") {
        customBox.classList.toggle("collapsed");
        return;
      }
      pick(Number(val));
    });
  });
  const applyBtn = scope.querySelector(`#${prefix}-duration-apply`);
  applyBtn.addEventListener("click", () => {
    const minsInput = scope.querySelector(`#${prefix}-duration-mins`);
    const mins = Number(minsInput.value);
    if (mins > 0) pick(mins);
  });
}

// Validation error helpers, shared with the reschedule sheet in actionMenu.js
export function fieldErrorHtml(id) {
  return `<p class="field-error hidden" id="${id}"></p>`;
}
export function showFieldError(id, message) {
  const el = document.getElementById(id);
  el.textContent = message;
  el.classList.remove("hidden");
}
export function clearFieldError(id) {
  const el = document.getElementById(id);
  if (el) { el.textContent = ""; el.classList.add("hidden"); }
}
// Returns true (and shows the error) if end is set, before start, invalid.
export function validateTimeOrder(startId, endId, errorId) {
  clearFieldError(errorId);
  const start = document.getElementById(startId).value;
  const end = document.getElementById(endId).value;
  if (start && end && timeToMinutes(end) <= timeToMinutes(start)) {
    showFieldError(errorId, "End time must be after start time.");
    return false;
  }
  return true;
}

// ---- Linked tasks (Event / Deadline forms; only available once the item is saved) ----
// Only offer tasks that are still ahead of you: not finished/skipped and not already in the past.
// (Recurring tasks keep running, so they stay available.)
function isLinkableTask(t) {
  if ((t.recurrence || "none") !== "none") return true;
  const status = t.status || (t.done ? "completed" : "pending");
  if (status === "completed" || status === "skipped") return false;
  return !isInPast(t.date, t.endTime || t.startTime);
}
function linkedTasksListHtml(type, id) {
  const allTasks = store.getTasks().filter(isLinkableTask);
  const linkedIds = new Set(store.tasksLinkedTo(type, id).map((t) => t.id));
  return `
    <div class="linked-tasks-list" id="linked-tasks-list">
      ${allTasks.length ? allTasks.map((t) => `
        <label class="linked-task-row">
          <input type="checkbox" data-link-task="${t.id}" ${linkedIds.has(t.id) ? "checked" : ""} />
          <span>${TYPE_EMOJI.task} ${escapeHtml(t.title)}</span>
          <span class="linked-task-date">${t.date}</span>
        </label>
      `).join("") : `<p class="placeholder-text" style="margin:4px 0;">No tasks yet.</p>`}
    </div>
  `;
}
function wireLinkedTasksSection(scope, type, id, itemDate, itemColor) {
  const list = scope.querySelector("#linked-tasks-list");
  function wireCheckbox(cb) {
    cb.addEventListener("change", () => {
      const taskId = cb.getAttribute("data-link-task");
      store.updateTask(taskId, cb.checked ? { linkedType: type, linkedId: id } : { linkedType: null, linkedId: null });
    });
  }
  list.querySelectorAll("[data-link-task]").forEach(wireCheckbox);

  const addBtn = scope.querySelector("#quick-task-add-btn");
  const input = scope.querySelector("#quick-task-title");
  addBtn.addEventListener("click", () => {
    const title = input.value.trim();
    if (!title) return;
    const newId = uid();
    store.addTask({ id: newId, title, date: itemDate, color: itemColor, linkedType: type, linkedId: id });
    input.value = "";
    const placeholder = list.querySelector(".placeholder-text");
    if (placeholder) placeholder.remove();
    const row = document.createElement("label");
    row.className = "linked-task-row";
    row.innerHTML = `<input type="checkbox" data-link-task="${newId}" checked /><span>${TYPE_EMOJI.task} ${escapeHtml(title)}</span><span class="linked-task-date">${itemDate}</span>`;
    list.appendChild(row);
    wireCheckbox(row.querySelector("[data-link-task]"));
  });
}
function linkedTasksFieldHtml(existing, type) {
  if (!existing) {
    return `
      <div class="field">
        <label>Linked tasks</label>
        <p class="field-hint">Save this ${type} first, then reopen it to link tasks.</p>
      </div>
    `;
  }
  return `
    <div class="field">
      <label>Linked tasks</label>
      <p class="field-hint">${type === "event" ? "Prep tasks for this event" : "Tasks that work toward this deadline"} — check existing ones or quickly add new ones.</p>
      ${linkedTasksListHtml(type, existing.id)}
      <div class="quick-task-add">
        <input type="text" id="quick-task-title" placeholder="Quick add a linked task…" />
        <button type="button" class="btn" id="quick-task-add-btn">Add</button>
      </div>
    </div>
  `;
}

// =====================================================================
// Add menu (Task / Event / Deadline) — used from Today and Calendar
// =====================================================================

export function openCreateMenu(presetDate, presetGoalId = null) {
  openSheet(`
    <button class="icon-btn sheet-close" data-action="close" aria-label="Close">✕</button>
    <h2 class="sheet-title">Add</h2>
    <div class="sheet-options">
      <button class="sheet-option" data-open="task"><span class="opt-icon">${TYPE_EMOJI.task}</span> Task</button>
      <button class="sheet-option" data-open="event"><span class="opt-icon">${TYPE_EMOJI.event}</span> Event</button>
      <button class="sheet-option" data-open="deadline"><span class="opt-icon">${TYPE_EMOJI.deadline}</span> Deadline</button>
    </div>
  `);
  wireSheetClose();
  sheet.querySelectorAll("[data-open]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const kind = btn.getAttribute("data-open");
      if (kind === "task") openTaskComposer(null, presetDate, null, undefined, null, presetGoalId);
      else if (kind === "event") openEventComposer(null, presetDate, undefined, null, presetGoalId);
      else if (kind === "deadline") openDeadlineComposer(null, presetDate, undefined, null, presetGoalId);
    });
  });
}

// =====================================================================
// Task composer
// =====================================================================

export function openTaskComposer(existing = null, presetDate = null, presetLink = null, onSaved, presetBlockId = null, presetGoalId = null) {
  const t = existing || {
    id: null, title: "", date: presetDate || dateKey(), startTime: "", endTime: "", durationMins: null,
    goalId: presetGoalId || "", deadline: "", deadlineTime: "", description: "", color: paletteDefault(0),
    linkedType: presetLink ? presetLink.type : null, linkedId: presetLink ? presetLink.id : null,
    recurrence: "none", done: false,
  };
  let color = t.color;
  let durationOnly = !t.startTime && t.durationMins ? t.durationMins : null;

  openSheet(`
    <button class="icon-btn sheet-close" data-action="close" aria-label="Close">✕</button>
    <h2 class="sheet-title">${existing ? "Edit task" : "New task"} ${TYPE_EMOJI.task}</h2>

    <div class="field">
      <label>Task name</label>
      <input type="text" id="tf-title" value="${escapeHtml(t.title)}" placeholder="What needs doing?" />
    </div>

    <div class="field">
      <label>Date</label>
      <input type="date" id="tf-date" value="${t.date}" />
    </div>

    <div class="field-row">
      <div class="field"><label>Start time</label><input type="time" id="tf-start" value="${t.startTime || ""}" /></div>
      <div class="field"><label>End time</label><input type="time" id="tf-end" value="${t.endTime || ""}" /></div>
    </div>
    ${fieldErrorHtml("tf-time-error")}
    <div class="field">
      <label>Or just set a duration — no fixed start time</label>
      ${durationChipsHtml("tf")}
    </div>

    ${blockFieldHtml("tf", t.date, (existing && existing.blockId) || presetBlockId)}

    ${goalFieldHtml(t.goalId, "tf-goal")}

    <div class="field">
      <label>Personal deadline (optional)</label>
      <div class="field-row">
        <input type="date" id="tf-deadline" value="${t.deadline || ""}" />
        <input type="time" id="tf-deadline-time" value="${t.deadlineTime || ""}" placeholder="Time" />
      </div>
    </div>

    <div class="field">
      <label>Description (optional)</label>
      <textarea id="tf-description" rows="3" placeholder="Any notes…">${escapeHtml(t.description || "")}</textarea>
    </div>

    <div class="field">
      <label>Color</label>
      ${swatchesHtml(color, "tf-colors")}
    </div>

    <div class="field">
      <label>Link to an event or deadline (optional)</label>
      <p class="field-hint">e.g. a prep task for an event, or a follow-up for a deadline</p>
      ${linkSelectHtml(t.linkedType, t.linkedId)}
    </div>

    <div class="field">
      <label>Repeats</label>
      ${recurrenceSelectHtml(t.recurrence)}
    </div>

    <div class="btn-row">
      ${existing ? '<button class="btn btn-danger" id="tf-delete">Delete</button>' : ""}
      <button class="btn" id="tf-cancel">Cancel</button>
      <button class="btn btn-primary" id="tf-save">${existing ? "Save" : "Add task"}</button>
    </div>
  `);

  wireSheetClose();
  wireSwatches("tf-colors", (c) => (color = c));
  wireDurationChips(sheet, "tf-start", "tf-end", "tf", {
    onNoStart: (mins) => { durationOnly = mins; },
  });
  wireBlockSelect("tf", "tf-date", "tf-start", "tf-end", !existing && !!presetBlockId);
  // Typing a start time by hand after picking a no-start duration clears the duration-only hint,
  // since the two are mutually exclusive ways of describing the same task.
  document.getElementById("tf-start").addEventListener("input", (e) => {
    if (e.target.value && durationOnly) durationOnly = null;
  });

  document.getElementById("tf-cancel").addEventListener("click", closeSheet);
  if (existing) {
    document.getElementById("tf-delete").addEventListener("click", () => {
      store.deleteTask(existing.id);
      closeSheet();
      notifyChanged();
      if (onSaved) onSaved();
    });
  }
  document.getElementById("tf-save").addEventListener("click", () => {
    const title = document.getElementById("tf-title").value.trim();
    if (!title) { document.getElementById("tf-title").focus(); return; }
    if (!validateTimeOrder("tf-start", "tf-end", "tf-time-error")) return;
    const dateVal = document.getElementById("tf-date").value || dateKey();
    const startVal = document.getElementById("tf-start").value || null;
    if (!existing && isInPast(dateVal, startVal)) {
      showFieldError("tf-time-error", "Can't create a task for a day or time that's already passed.");
      return;
    }
    const linkVal = document.getElementById("tf-link").value; // "" | "event:ID" | "deadline:ID"
    const [linkType, linkId] = linkVal ? linkVal.split(":") : [null, null];
    const payload = {
      title,
      date: dateVal,
      startTime: startVal,
      endTime: document.getElementById("tf-end").value || null,
      durationMins: startVal ? null : durationOnly,
      goalId: readGoalId("tf-goal", existing),
      deadline: document.getElementById("tf-deadline").value || null,
      deadlineTime: document.getElementById("tf-deadline-time").value || null,
      description: document.getElementById("tf-description").value || "",
      color,
      linkedType: linkType || null,
      linkedId: linkId || null,
      blockId: readBlockId("tf", existing),
      recurrence: document.getElementById("tf-recurrence").value || "none",
    };
    if (existing) store.updateTask(existing.id, payload);
    else store.addTask(payload);
    closeSheet();
    notifyChanged();
    if (onSaved) onSaved();
  });
}

// =====================================================================
// Event composer
// =====================================================================

export function openEventComposer(existing = null, presetDate = null, onSaved, presetBlockId = null, presetGoalId = null) {
  const e = existing || {
    id: null, title: "", date: presetDate || dateKey(), startTime: "", endTime: "",
    location: "", description: "", color: paletteDefault(1), recurrence: "none", goalId: presetGoalId || "",
  };
  let color = e.color;

  openSheet(`
    <button class="icon-btn sheet-close" data-action="close" aria-label="Close">✕</button>
    <h2 class="sheet-title">${existing ? "Edit event" : "New event"} ${TYPE_EMOJI.event}</h2>

    <div class="field"><label>Event name</label><input type="text" id="ef-title" value="${escapeHtml(e.title)}" placeholder="Class, meeting, appointment…" /></div>
    <div class="field"><label>Date</label><input type="date" id="ef-date" value="${e.date}" /></div>
    <div class="field-row">
      <div class="field"><label>Start time</label><input type="time" id="ef-start" value="${e.startTime || ""}" /></div>
      <div class="field"><label>End time</label><input type="time" id="ef-end" value="${e.endTime || ""}" /></div>
    </div>
    ${fieldErrorHtml("ef-time-error")}
    <div class="field">
      <label>Or set a duration from the start time</label>
      ${durationChipsHtml("ef")}
    </div>
    ${blockFieldHtml("ef", e.date, (existing && existing.blockId) || presetBlockId)}
    ${goalFieldHtml(e.goalId, "ef-goal")}
    <div class="field"><label>Location (optional)</label><input type="text" id="ef-location" value="${escapeHtml(e.location || "")}" placeholder="Where is it?" /></div>
    <div class="field"><label>Description (optional)</label><textarea id="ef-description" rows="3">${escapeHtml(e.description || "")}</textarea></div>
    <div class="field"><label>Repeats</label>${recurrenceSelectHtml(e.recurrence)}</div>
    <div class="field"><label>Color</label>${swatchesHtml(color, "ef-colors")}</div>

    ${linkedTasksFieldHtml(existing, "event")}

    <div class="btn-row">
      ${existing ? '<button class="btn btn-danger" id="ef-delete">Delete</button>' : ""}
      <button class="btn" id="ef-cancel">Cancel</button>
      <button class="btn btn-primary" id="ef-save">${existing ? "Save" : "Add event"}</button>
    </div>
  `);

  wireSheetClose();
  wireSwatches("ef-colors", (c) => (color = c));
  wireDurationChips(sheet, "ef-start", "ef-end", "ef");
  wireBlockSelect("ef", "ef-date", "ef-start", "ef-end", !existing && !!presetBlockId);
  if (existing) wireLinkedTasksSection(sheet, "event", existing.id, existing.date, color);

  document.getElementById("ef-cancel").addEventListener("click", closeSheet);
  if (existing) {
    document.getElementById("ef-delete").addEventListener("click", () => {
      store.deleteEvent(existing.id);
      closeSheet();
      notifyChanged();
      if (onSaved) onSaved();
    });
  }
  document.getElementById("ef-save").addEventListener("click", () => {
    const title = document.getElementById("ef-title").value.trim();
    if (!title) { document.getElementById("ef-title").focus(); return; }
    if (!validateTimeOrder("ef-start", "ef-end", "ef-time-error")) return;
    const dateVal = document.getElementById("ef-date").value || dateKey();
    const startVal = document.getElementById("ef-start").value || null;
    if (!existing && isInPast(dateVal, startVal)) {
      showFieldError("ef-time-error", "Can't create an event for a day or time that's already passed.");
      return;
    }
    const payload = {
      title,
      date: dateVal,
      startTime: startVal,
      endTime: document.getElementById("ef-end").value || null,
      location: document.getElementById("ef-location").value || "",
      description: document.getElementById("ef-description").value || "",
      blockId: readBlockId("ef", existing),
      goalId: readGoalId("ef-goal", existing),
      recurrence: document.getElementById("tf-recurrence").value || "none",
      color,
    };
    if (existing) store.updateEvent(existing.id, payload);
    else store.addEvent(payload);
    closeSheet();
    notifyChanged();
    if (onSaved) onSaved();
  });
}

// =====================================================================
// Deadline composer
// =====================================================================

export function openDeadlineComposer(existing = null, presetDate = null, onSaved, presetBlockId = null, presetGoalId = null) {
  const d = existing || {
    id: null, title: "", dueDate: presetDate || dateKey(), dueTime: "",
    location: "", description: "", color: paletteDefault(3), recurrence: "none", goalId: presetGoalId || "",
  };
  let color = d.color;

  openSheet(`
    <button class="icon-btn sheet-close" data-action="close" aria-label="Close">✕</button>
    <h2 class="sheet-title">${existing ? "Edit deadline" : "New deadline"} ${TYPE_EMOJI.deadline}</h2>

    <div class="field"><label>Deadline name</label><input type="text" id="df-title" value="${escapeHtml(d.title)}" placeholder="What's due?" /></div>
    <div class="field-row">
      <div class="field"><label>Due date</label><input type="date" id="df-duedate" value="${d.dueDate}" /></div>
      <div class="field"><label>Due time (optional)</label><input type="time" id="df-duetime" value="${d.dueTime || ""}" /></div>
    </div>
    ${fieldErrorHtml("df-time-error")}
    ${blockFieldHtml("df", d.dueDate, (existing && existing.blockId) || presetBlockId)}
    ${goalFieldHtml(d.goalId, "df-goal", "A deadline linked to a goal works as a milestone toward it.")}
    <div class="field"><label>Location (optional)</label><input type="text" id="df-location" value="${escapeHtml(d.location || "")}" placeholder="Where, if relevant" /></div>
    <div class="field"><label>Description (optional)</label><textarea id="df-description" rows="3">${escapeHtml(d.description || "")}</textarea></div>
    <div class="field"><label>Repeats</label>${recurrenceSelectHtml(d.recurrence)}</div>
    <div class="field"><label>Color</label>${swatchesHtml(color, "df-colors")}</div>

    ${linkedTasksFieldHtml(existing, "deadline")}

    <div class="btn-row">
      ${existing ? '<button class="btn btn-danger" id="df-delete">Delete</button>' : ""}
      <button class="btn" id="df-cancel">Cancel</button>
      <button class="btn btn-primary" id="df-save">${existing ? "Save" : "Add deadline"}</button>
    </div>
  `);

  wireSheetClose();
  wireSwatches("df-colors", (c) => (color = c));
  wireBlockSelect("df", "df-duedate", "df-duetime", null, !existing && !!presetBlockId);
  if (existing) wireLinkedTasksSection(sheet, "deadline", existing.id, existing.dueDate, color);

  document.getElementById("df-cancel").addEventListener("click", closeSheet);
  if (existing) {
    document.getElementById("df-delete").addEventListener("click", () => {
      store.deleteDeadline(existing.id);
      closeSheet();
      notifyChanged();
      if (onSaved) onSaved();
    });
  }
  document.getElementById("df-save").addEventListener("click", () => {
    const title = document.getElementById("df-title").value.trim();
    if (!title) { document.getElementById("df-title").focus(); return; }
    clearFieldError("df-time-error");
    const dueDateVal = document.getElementById("df-duedate").value || dateKey();
    const dueTimeVal = document.getElementById("df-duetime").value || null;
    if (!existing && isInPast(dueDateVal, dueTimeVal)) {
      showFieldError("df-time-error", "Can't create a deadline for a day or time that's already passed.");
      return;
    }
    const payload = {
      title,
      dueDate: dueDateVal,
      dueTime: dueTimeVal,
      location: document.getElementById("df-location").value || "",
      description: document.getElementById("df-description").value || "",
      blockId: readBlockId("df", existing),
      goalId: readGoalId("df-goal", existing),
      recurrence: document.getElementById("tf-recurrence").value || "none",
      color,
    };
    if (existing) store.updateDeadline(existing.id, payload);
    else store.addDeadline(payload);
    closeSheet();
    notifyChanged();
    if (onSaved) onSaved();
  });
}
