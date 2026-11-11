// More → Time blocks: manage recurring blocks (class periods, gym, sleep...) and days off.
import { store } from "../store.js";
import { openSheet, closeSheet, wireSheetClose, notifyChanged } from "../components/sheet.js";
import { showUndoToast } from "../components/toast.js";
import { swatchesHtml, wireSwatches, fieldErrorHtml, showFieldError, clearFieldError } from "../forms.js";
import { blockDaysLabel, blockTimeSummary, blockGroups, blockIsOvernight } from "../timeblocks.js";
import { escapeHtml, dateKey, formatShortDate, timeToMinutes, WEEKDAY_SHORT, PALETTE } from "../utils.js";

const TB_DAY_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Mon-first for picking, stored as JS weekday numbers

function tbExceptionLabel(ex) {
  if (ex.scope === "all") return "All time blocks";
  if (ex.scope === "group") return `${ex.target} (group)`;
  const b = store.getTimeBlocks().find((x) => x.id === ex.target);
  return b ? b.title : "Deleted block";
}

function tbWhen(ex) {
  return ex.to && ex.to !== ex.from ? `${formatShortDate(ex.from)} – ${formatShortDate(ex.to)}` : formatShortDate(ex.from);
}

export function renderTimeBlocksManager(container, onBack) {
  const blocks = store.getTimeBlocks();
  const exceptions = store.getBlockExceptions().slice().sort((a, b) => a.from.localeCompare(b.from));
  const today = dateKey();

  const groups = {};
  blocks.forEach((b) => { (groups[(b.group || "").trim() || "Other"] ||= []).push(b); });
  const groupNames = Object.keys(groups).sort((a, b) => (a === "Other") - (b === "Other") || a.localeCompare(b));

  const groupsHtml = groupNames.map((g) => `
    <div class="cal-box-section">
      <div class="cal-sec-title">${escapeHtml(g)} <span class="cal-sec-count">${groups[g].length}</span></div>
      ${groups[g].slice().sort((a, b) => a.startTime.localeCompare(b.startTime) || a.title.localeCompare(b.title)).map((b) => `
        <button class="tb-row" data-block="${b.id}">
          <span class="tb-bar" style="background:${b.color || "#5CBED6"}"></span>
          <span class="tb-main">
            <span class="tb-title">${escapeHtml(b.title)}</span>
            <span class="tb-sub">${blockDaysLabel(b.days)} · ${blockTimeSummary(b)}${b.place ? ` · ${escapeHtml(b.place)}` : ""}</span>
          </span>
        </button>`).join("")}
    </div>`).join("");

  const offHtml = `
    <div class="cal-box-section">
      <div class="cal-sec-title">Days off ${exceptions.length ? `<span class="cal-sec-count">${exceptions.length}</span>` : ""}</div>
      ${exceptions.length ? exceptions.map((x) => `
        <div class="tb-off-row ${(x.to || x.from) < today ? "tb-off-past" : ""}">
          <span class="tb-main">
            <span class="tb-title">${escapeHtml(tbExceptionLabel(x))}</span>
            <span class="tb-sub">${tbWhen(x)}${x.reason ? ` · ${escapeHtml(x.reason)}` : ""}</span>
          </span>
          <button class="icon-btn tb-off-del" data-off-del="${x.id}" aria-label="Remove day off">✕</button>
        </div>`).join("") : `<p class="tb-empty">No days off. Use this for holidays, exam breaks or a cancelled class.</p>`}
    </div>`;

  container.innerHTML = `
    <button class="tb-back" data-tb="back">‹ More</button>
    <h1 class="page-date">Time blocks</h1>
    <p class="page-summary tb-quote">Time blocks show the life you already have. Tasks show what you want to accomplish within it.</p>
    <div class="tb-actions">
      <button class="btn btn-primary" data-tb="add">+ Add block</button>
      <button class="btn" data-tb="dayoff" ${blocks.length ? "" : "disabled"}>+ Day off</button>
    </div>
    ${blocks.length ? groupsHtml : `
      <div class="placeholder-panel">
        <div class="placeholder-icon">▦</div>
        <div class="placeholder-title">No time blocks yet</div>
        <p class="placeholder-text">Add the fixed parts of your week — each class period, gym, study, sleep.<br>They show up in the Calendar's Timetable and never create or move tasks.</p>
      </div>`}
    ${blocks.length ? offHtml : ""}
  `;

  const refresh = () => renderTimeBlocksManager(container, onBack);
  container.querySelector('[data-tb="back"]').addEventListener("click", onBack);
  container.querySelector('[data-tb="add"]').addEventListener("click", () => openBlockEditor(null, null, refresh));
  const dayoff = container.querySelector('[data-tb="dayoff"]');
  if (!dayoff.disabled) dayoff.addEventListener("click", () => openDayOffSheet(null, refresh));
  container.querySelectorAll("[data-block]").forEach((el) => el.addEventListener("click", () => {
    openBlockEditor(store.getTimeBlocks().find((b) => b.id === el.getAttribute("data-block")), null, refresh);
  }));
  container.querySelectorAll("[data-off-del]").forEach((el) => el.addEventListener("click", () => {
    const ex = store.getBlockExceptions().find((x) => x.id === el.getAttribute("data-off-del"));
    if (!ex) return;
    store.deleteBlockException(ex.id);
    refresh();
    showUndoToast("Day off removed", () => { store.addBlockException(ex); refresh(); });
  }));
}

// ---------------- Block editor ----------------

export function openBlockEditor(existing, defaults, onDone) {
  const d = existing || { title: "", group: "", days: [1, 2, 3, 4, 5], startTime: "", endTime: "", place: "", color: (store.getPalette().length ? store.getPalette() : PALETTE)[store.getTimeBlocks().length % (store.getPalette().length || PALETTE.length)], ...(defaults || {}) };
  let days = [...d.days];
  let color = d.color;
  let vary = !!(d.dayTimes && Object.keys(d.dayTimes).length);
  let simple = { start: d.startTime || "", end: d.endTime || "" };
  const perDay = {}; // weekday -> { start, end } while "different times on different days" is on
  const seed = (n) => {
    if (perDay[n]) return;
    const o = d.dayTimes && d.dayTimes[n];
    perDay[n] = { start: o ? o.startTime : simple.start, end: o ? o.endTime : simple.end };
  };
  const groups = blockGroups();

  openSheet(`
    <button class="icon-btn sheet-close" data-action="close" aria-label="Close">✕</button>
    <h2 class="sheet-title">${existing ? "Edit time block" : "New time block"}</h2>

    <div class="field"><label>Name</label><input type="text" id="bf-title" value="${escapeHtml(d.title)}" placeholder="e.g. Mathematics, Gym, Sleep" /></div>
    <div class="field">
      <label>Group (optional)</label>
      <input type="text" id="bf-group" value="${escapeHtml(d.group || "")}" placeholder="e.g. College" autocomplete="off" />
      ${groups.length ? `<div class="chip-row tb-groups">${groups.map((g) => `<button type="button" class="chip" data-group="${escapeHtml(g)}">${escapeHtml(g)}</button>`).join("")}</div>` : ""}
      <p class="field-hint field-hint-after">Put related periods in one group (all your classes under "College") so a holiday can switch them off together.</p>
    </div>

    <div class="field">
      <label>Days</label>
      <div class="tb-days" id="bf-days">
        ${TB_DAY_ORDER.map((n) => `<button type="button" class="tb-day ${days.includes(n) ? "on" : ""}" data-d="${n}">${WEEKDAY_SHORT[n][0]}<small>${WEEKDAY_SHORT[n].slice(1)}</small></button>`).join("")}
      </div>
      <div class="chip-row tb-presets">
        <button type="button" class="chip" data-preset="1,2,3,4,5">Mon–Fri</button>
        <button type="button" class="chip" data-preset="1,2,3,4,5,6">Mon–Sat</button>
        <button type="button" class="chip" data-preset="0,1,2,3,4,5,6">Every day</button>
      </div>
    </div>

    <label class="tb-check"><input type="checkbox" id="bf-vary" ${vary ? "checked" : ""} /> Different times on different days</label>
    <div id="bf-times"></div>
    <p class="field-hint field-hint-after" id="bf-overnight"></p>
    ${fieldErrorHtml("bf-error")}

    <div class="field"><label>Place (optional)</label><input type="text" id="bf-place" value="${escapeHtml(d.place || "")}" placeholder="Room, campus, gym…" /></div>
    <div class="field"><label>Color</label>${swatchesHtml(color, "bf-colors")}</div>

    <div class="btn-row tb-editor-btns">
      ${existing ? '<button class="btn btn-danger" id="bf-delete">Delete</button>' : ""}
      ${existing ? '<button class="btn" id="bf-skip">Skip a day…</button>' : ""}
      <button class="btn" id="bf-cancel">Cancel</button>
      ${existing ? "" : '<button class="btn" id="bf-another">Save &amp; add another</button>'}
      <button class="btn btn-primary" id="bf-save">${existing ? "Save" : "Add block"}</button>
    </div>
  `);
  wireSheetClose();
  wireSwatches("bf-colors", (c) => (color = c));

  // ----- group: type a name, or tap an existing group (no native dropdown) -----
  const groupInput = document.getElementById("bf-group");
  const paintGroups = () => document.querySelectorAll(".tb-groups [data-group]").forEach((c) => {
    c.classList.toggle("tb-chip-on", c.getAttribute("data-group") === groupInput.value.trim());
  });
  document.querySelectorAll(".tb-groups [data-group]").forEach((c) => c.addEventListener("click", () => {
    const g = c.getAttribute("data-group");
    groupInput.value = groupInput.value.trim() === g ? "" : g;
    paintGroups();
  }));
  groupInput.addEventListener("input", paintGroups);
  paintGroups();

  // ----- days -----
  const dayBtns = document.querySelectorAll("#bf-days .tb-day");
  const paintDays = () => dayBtns.forEach((b) => b.classList.toggle("on", days.includes(Number(b.getAttribute("data-d")))));
  const onDaysChanged = () => { paintDays(); if (vary) renderTimes(); };
  dayBtns.forEach((b) => b.addEventListener("click", () => {
    const n = Number(b.getAttribute("data-d"));
    days = days.includes(n) ? days.filter((x) => x !== n) : [...days, n];
    onDaysChanged();
  }));
  document.querySelectorAll(".tb-presets [data-preset]").forEach((c) => c.addEventListener("click", () => {
    days = c.getAttribute("data-preset").split(",").map(Number);
    onDaysChanged();
  }));

  // ----- times: one start/end for every day, or a start/end per day -----
  const overnightHint = () => {
    const pairs = vary ? TB_DAY_ORDER.filter((n) => days.includes(n)).map((n) => perDay[n]) : [simple];
    const over = pairs.some((p) => p && p.start && p.end && timeToMinutes(p.end) <= timeToMinutes(p.start));
    document.getElementById("bf-overnight").textContent = over ? "A block that ends at or before its start runs past midnight and ends the next morning." : "";
  };
  function renderTimes() {
    const host = document.getElementById("bf-times");
    if (!vary) {
      host.innerHTML = `
        <div class="field-row">
          <div class="field"><label>Starts</label><input type="time" id="bf-start" value="${simple.start}" /></div>
          <div class="field"><label>Ends</label><input type="time" id="bf-end" value="${simple.end}" /></div>
        </div>`;
      host.querySelector("#bf-start").addEventListener("input", (e) => { simple.start = e.target.value; overnightHint(); });
      host.querySelector("#bf-end").addEventListener("input", (e) => { simple.end = e.target.value; overnightHint(); });
    } else {
      const sel = TB_DAY_ORDER.filter((n) => days.includes(n));
      sel.forEach(seed);
      host.innerHTML = sel.length ? `<div class="tb-time-rows">${sel.map((n) => `
        <div class="tb-time-row">
          <span class="tb-time-day">${WEEKDAY_SHORT[n]}</span>
          <input type="time" data-s="${n}" value="${perDay[n].start}" aria-label="${WEEKDAY_SHORT[n]} start" />
          <span class="tb-time-dash">–</span>
          <input type="time" data-e="${n}" value="${perDay[n].end}" aria-label="${WEEKDAY_SHORT[n]} end" />
        </div>`).join("")}</div>` : `<p class="field-hint field-hint-after">Pick the days above first.</p>`;
      host.querySelectorAll("[data-s]").forEach((el) => el.addEventListener("input", () => { perDay[el.getAttribute("data-s")].start = el.value; overnightHint(); }));
      host.querySelectorAll("[data-e]").forEach((el) => el.addEventListener("input", () => { perDay[el.getAttribute("data-e")].end = el.value; overnightHint(); }));
    }
    overnightHint();
  }
  document.getElementById("bf-vary").addEventListener("change", (e) => {
    if (e.target.checked) {
      vary = true;
    } else {
      // back to a single time: use the first selected day's times as the shared ones
      const first = TB_DAY_ORDER.find((n) => days.includes(n));
      if (first && perDay[first]) simple = { ...perDay[first] };
      vary = false;
    }
    renderTimes();
  });
  renderTimes();

  document.getElementById("bf-cancel").addEventListener("click", closeSheet);

  const collect = () => {
    clearFieldError("bf-error");
    const title = document.getElementById("bf-title").value.trim();
    if (!title) { document.getElementById("bf-title").focus(); return null; }
    if (!days.length) { showFieldError("bf-error", "Pick at least one day."); return null; }
    let startTime, endTime, dayTimes = null;
    if (!vary) {
      startTime = simple.start; endTime = simple.end;
      if (!startTime || !endTime) { showFieldError("bf-error", "Set a start and end time."); return null; }
      if (startTime === endTime) { showFieldError("bf-error", "Start and end can't be the same time."); return null; }
    } else {
      const sel = TB_DAY_ORDER.filter((n) => days.includes(n));
      dayTimes = {};
      for (const n of sel) {
        const { start, end } = perDay[n];
        if (!start || !end) { showFieldError("bf-error", `Set a start and end time for ${WEEKDAY_SHORT[n]}.`); return null; }
        if (start === end) { showFieldError("bf-error", `Start and end can't be the same on ${WEEKDAY_SHORT[n]}.`); return null; }
        dayTimes[n] = { startTime: start, endTime: end };
      }
      startTime = dayTimes[sel[0]].startTime; endTime = dayTimes[sel[0]].endTime;
    }
    return {
      title, group: groupInput.value.trim(), days: [...days].sort((a, b) => a - b),
      startTime, endTime, dayTimes, place: document.getElementById("bf-place").value.trim(), color,
    };
  };

  document.getElementById("bf-save").addEventListener("click", () => {
    const payload = collect();
    if (!payload) return;
    if (existing) store.updateTimeBlock(existing.id, payload); else store.addTimeBlock(payload);
    closeSheet();
    notifyChanged();
    if (onDone) onDone();
  });

  if (!existing) {
    document.getElementById("bf-another").addEventListener("click", () => {
      const payload = collect();
      if (!payload) return;
      store.addTimeBlock(payload);
      if (onDone) onDone();
      // Next period: same group/days/color, starting where this one ended.
      openBlockEditor(null, {
        group: payload.group, days: payload.days, color: payload.color,
        startTime: blockIsOvernight(payload) ? "" : payload.endTime,
      }, onDone);
    });
  } else {
    document.getElementById("bf-delete").addEventListener("click", () => {
      const removed = { ...existing };
      store.deleteTimeBlock(existing.id);
      closeSheet();
      notifyChanged();
      if (onDone) onDone();
      showUndoToast(`${existing.title} deleted`, () => { store.addTimeBlock(removed); notifyChanged(); if (onDone) onDone(); });
    });
    document.getElementById("bf-skip").addEventListener("click", () => {
      openDayOffSheet({ scope: "block", target: existing.id }, onDone);
    });
  }
}

// ---------------- Days off ----------------

export function openDayOffSheet(preset, onDone) {
  const blocks = store.getTimeBlocks();
  const groups = blockGroups();
  const p = preset || { scope: "all", target: "" };
  const selected = p.scope === "all" ? "all" : `${p.scope}:${p.target}`;
  const today = dateKey();

  openSheet(`
    <button class="icon-btn sheet-close" data-action="close" aria-label="Close">✕</button>
    <h2 class="sheet-title">Add a day off</h2>
    <p class="field-hint field-hint-after tb-off-intro">Marks time blocks as "not happening" on those dates. Your tasks and events stay exactly as they are.</p>

    <div class="field">
      <label>What's off?</label>
      <select id="of-scope">
        <option value="all" ${selected === "all" ? "selected" : ""}>Everything (all time blocks)</option>
        ${groups.length ? `<optgroup label="Groups">${groups.map((g) => `<option value="group:${escapeHtml(g)}" ${selected === `group:${g}` ? "selected" : ""}>${escapeHtml(g)}</option>`).join("")}</optgroup>` : ""}
        <optgroup label="Single blocks">${blocks.map((b) => `<option value="block:${b.id}" ${selected === `block:${b.id}` ? "selected" : ""}>${escapeHtml(b.title)}${b.group ? ` (${escapeHtml(b.group)})` : ""} — ${blockDaysLabel(b.days)}</option>`).join("")}</optgroup>
      </select>
    </div>
    <div class="field-row">
      <div class="field"><label>From</label><input type="date" id="of-from" value="${p.from && p.from >= today ? p.from : today}" min="${today}" /></div>
      <div class="field"><label>To (optional)</label><input type="date" id="of-to" value="" min="${today}" /></div>
    </div>
    <p class="field-hint field-hint-after">Leave "To" empty for a single day.</p>
    <div class="field"><label>Reason (optional)</label><input type="text" id="of-reason" placeholder="Holiday, exam break, class cancelled…" /></div>
    ${fieldErrorHtml("of-error")}
    <div class="btn-row">
      <button class="btn" id="of-cancel">Cancel</button>
      <button class="btn btn-primary" id="of-save">Add day off</button>
    </div>
  `);
  wireSheetClose();
  document.getElementById("of-cancel").addEventListener("click", closeSheet);
  document.getElementById("of-save").addEventListener("click", () => {
    clearFieldError("of-error");
    const raw = document.getElementById("of-scope").value;
    const from = document.getElementById("of-from").value;
    const to = document.getElementById("of-to").value || from;
    if (!from) { showFieldError("of-error", "Pick a date."); return; }
    if (from < dateKey()) { showFieldError("of-error", "Days off can only be set for today or later — past days can't be changed."); return; }
    if (to < from) { showFieldError("of-error", "The end date is before the start date."); return; }
    const i = raw.indexOf(":");
    const scope = i === -1 ? "all" : raw.slice(0, i);
    const target = i === -1 ? "" : raw.slice(i + 1);
    store.addBlockException({ scope, target, from, to, reason: document.getElementById("of-reason").value.trim() });
    closeSheet();
    notifyChanged();
    if (onDone) onDone();
  });
}
