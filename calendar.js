import { store } from "../store.js";
import { dayNavHtml, wireDayNav } from "../components/dayNav.js";
import { blockSegmentsOn, segmentTimeLabel } from "../timeblocks.js";
import { navigate } from "../router.js";
import { setTodaySelectedDate } from "./today.js";
import {
  dateKey, keyToDate, addDays, escapeHtml, formatTime, formatShortDate, formatClockTime,
  formatDurationMins, timeToMinutes, pad2, occursOn, loggedMs, deadlineStatus, WEEKDAY_SHORT, WEEKDAY_NAMES, MONTH_NAMES, TYPE_EMOJI,
} from "../utils.js";

function formatShortDateTime(ms) {
  return `${formatShortDate(dateKey(new Date(ms)))}, ${formatClockTime(ms)}`;
}

// First day of the month being viewed, as a date key ("2026-09-01"). Survives tab switches.
let calViewMonth = dateKey().slice(0, 8) + "01";

function calShiftMonth(key, delta) {
  const d = keyToDate(key);
  return dateKey(new Date(d.getFullYear(), d.getMonth() + delta, 1));
}

function calItemsOn(day) {
  return {
    tasks: store.getTasks().filter((t) => occursOn(t, day)),
    events: store.getEvents().filter((e) => occursOn(e, day)),
    deadlines: store.getDeadlines().filter((d) => occursOn(d, day)),
  };
}

// Recurring items are one record, so their done/skipped state only belongs to the original date.
function calTaskStatus(t, day) {
  if ((t.recurrence || "none") !== "none" && t.date !== day) return "pending";
  return t.status || (t.done ? "completed" : "pending");
}

function calTaskSpentMs(t, day) {
  return (t.recurrence || "none") !== "none" && t.date !== day ? 0 : loggedMs(t);
}

function calPlannedMins(t) {
  if (t.startTime && t.endTime) return Math.max(0, timeToMinutes(t.endTime) - timeToMinutes(t.startTime));
  return t.durationMins || 0;
}

// ---------------- Month grid ----------------

export function renderCalendar(container) {
  calContainer = container;
  if (calDay) { renderCalendarDay(container); return; }
  const first = keyToDate(calViewMonth);
  const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const lead = first.getDay();
  const weeks = Math.ceil((lead + daysInMonth) / 7);
  const today = dateKey();
  const noteDays = new Set(store.getNotes().map((n) => n.date));

  let tasksN = 0, eventsN = 0, deadlinesN = 0, spentMs = 0;
  let cells = "";
  for (let i = 0; i < weeks * 7; i++) {
    const dayNum = i - lead + 1;
    if (dayNum < 1 || dayNum > daysInMonth) { cells += '<div class="cal-cell cal-empty"></div>'; continue; }
    const key = addDays(calViewMonth, dayNum - 1);
    const { tasks, events, deadlines } = calItemsOn(key);
    tasksN += tasks.length; eventsN += events.length; deadlinesN += deadlines.length;
    tasks.forEach((t) => { spentMs += calTaskSpentMs(t, key); });
    const colors = [...tasks, ...events, ...deadlines].map((x) => x.color || "#34C77B");
    const dots = colors.slice(0, 4).map((c) => `<i style="background:${c}"></i>`).join("");
    const more = colors.length > 4 ? `<b>+${colors.length - 4}</b>` : "";
    cells += `
      <button class="cal-cell ${key === today ? "cal-today" : ""} ${key < today ? "cal-past" : ""}" data-day="${key}" aria-label="${key}">
        <span class="cal-num">${dayNum}${noteDays.has(key) ? '<em class="cal-note" title="Diary note"></em>' : ""}</span>
        <span class="cal-dots">${dots}${more}</span>
      </button>`;
  }

  const bits = [];
  if (tasksN) bits.push(`${tasksN} task${tasksN === 1 ? "" : "s"}`);
  if (eventsN) bits.push(`${eventsN} event${eventsN === 1 ? "" : "s"}`);
  if (deadlinesN) bits.push(`${deadlinesN} deadline${deadlinesN === 1 ? "" : "s"}`);
  if (spentMs > 0) bits.push(`${formatDurationMins(spentMs / 60000)} spent`);
  const onThisMonth = calViewMonth === dateKey().slice(0, 8) + "01";

  container.innerHTML = `
    <h1 class="page-date">Calendar</h1>
    <p class="page-summary">${bits.length ? bits.join(" · ") : "Nothing planned this month."}</p>
    <div class="cal-head">
      <button class="day-nav-arrow" data-cal="prev" aria-label="Previous month">‹</button>
      <div class="cal-title">${MONTH_NAMES[first.getMonth()]} <span>${first.getFullYear()}</span></div>
      <button class="day-nav-arrow" data-cal="next" aria-label="Next month">›</button>
    </div>
    <div class="day-today-row"><button class="btn day-today-btn" data-cal="today" ${onThisMonth ? "disabled" : ""}>This month</button></div>
    <div class="cal-grid">
      ${WEEKDAY_SHORT.map((w) => `<div class="cal-dow">${w[0]}</div>`).join("")}
      ${cells}
    </div>
    <p class="cal-hint">Tap a day to see how it went.</p>
  `;

  container.querySelector('[data-cal="prev"]').addEventListener("click", () => { calViewMonth = calShiftMonth(calViewMonth, -1); renderCalendar(container); });
  container.querySelector('[data-cal="next"]').addEventListener("click", () => { calViewMonth = calShiftMonth(calViewMonth, 1); renderCalendar(container); });
  const thisBtn = container.querySelector('[data-cal="today"]');
  if (!thisBtn.disabled) thisBtn.addEventListener("click", () => { calViewMonth = dateKey().slice(0, 8) + "01"; renderCalendar(container); });
  container.querySelectorAll("[data-day]").forEach((b) => b.addEventListener("click", () => openDayOverview(b.getAttribute("data-day"), container)));
}

// ---------------- Day overview (read-only) ----------------

function calRelative(day) {
  const diff = Math.round((keyToDate(day) - keyToDate(dateKey())) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  return diff > 0 ? `In ${diff} days` : `${-diff} days ago`;
}

function calWhen(w) {
  return w && w.date ? `${formatShortDate(w.date)}${w.time ? ` ${formatTime(w.time)}` : ""}` : "";
}

// One entry per history event touching `day`, each carrying enough detail
// (old time, new time, which occurrence) to stand alone in the log.
function calHistoryLines(day) {
  const lines = [];
  const all = [
    ...store.getTasks().map((item) => ({ kind: "task", item })),
    ...store.getEvents().map((item) => ({ kind: "event", item })),
    ...store.getDeadlines().map((item) => ({ kind: "deadline", item })),
  ];
  all.forEach(({ kind, item }) => {
    (item.history || []).forEach((h) => {
      const name = `${TYPE_EMOJI[kind]} ${escapeHtml(item.title)}`;
      if (h.type === "skipped" && h.date === day) {
        lines.push({ at: h.at, kind: "skipped", html: `${name} <span class="cal-hist-verb">skipped</span>` });
      } else if (h.type === "rescheduled") {
        const fromHere = h.from && h.from.date === day;
        const toHere = h.to && h.to.date === day;
        if (!fromHere && !toHere) return;
        const detail = fromHere && toHere
          ? `time changed <span class="cal-hist-old">${calWhen(h.from)}</span> → <span class="cal-hist-new">${calWhen(h.to)}</span>`
          : fromHere
            ? `moved to <span class="cal-hist-new">${calWhen(h.to)}</span> <span class="cal-hist-from">(was ${calWhen(h.from)})</span>`
            : `moved here <span class="cal-hist-from">(was ${calWhen(h.from)})</span>`;
        lines.push({ at: h.at, kind: "rescheduled", html: `${name} <span class="cal-hist-verb">${detail}</span>` });
      }
    });
  });
  return lines.sort((a, b) => a.at - b.at);
}

// ---------------- Day view (a screen inside the app, not a pop-up) ----------------
// Tapping a day swaps the Calendar screen for that day, keeping the background, glass UI and
// the bottom navigation. ✕ (or Escape) goes back to the month; arrows / date pill move between days.

let calDay = null;        // date key of the day being viewed, or null for the month grid
let calContainer = null;

function openDayOverview(day, container) {
  calDay = day;
  calContainer = container;
  renderCalendar(container);
  window.scrollTo(0, 0);
}

function calCloseDay() {
  if (!calDay) return;
  calViewMonth = calDay.slice(0, 8) + "01"; // land the grid on the month last looked at
  calDay = null;
  renderCalendar(calContainer);
  window.scrollTo(0, 0);
}

function calGoToDay(key, dir) {
  calDay = key;
  renderCalendarDay(calContainer, dir);
  window.scrollTo(0, 0);
}

// Used by the + button: new items default to the day being viewed (never a past day).
export function getCalendarCreatePresetDate() {
  if (!calDay) return undefined;
  const today = dateKey();
  return calDay < today ? today : calDay;
}

function renderCalendarDay(container, dir) {
  const built = calBuildDay(calDay);
  container.innerHTML = `
    <button class="tb-back" data-cd="close" aria-label="Back to the month">‹ Calendar</button>
    ${dayNavHtml(calDay)}
    <div class="cd-body ${dir ? (dir === "next" ? "dv-in-right" : "dv-in-left") : ""}">${built.html}</div>
  `;
  container.querySelector('[data-cd="close"]').addEventListener("click", calCloseDay);
  wireDayNav(container, calDay, (key, d) => calGoToDay(key, d));
  calWireDay(container.querySelector(".cd-body"), calDay);
}

document.addEventListener("keydown", (e) => {
  if (!calDay || !calContainer || !calContainer.querySelector(".cd-body")) return;
  if (!document.getElementById("sheet").classList.contains("hidden")) return;
  if (document.querySelector(".cp-panel:not(.hidden), .modal:not(.hidden)")) return;
  if (e.key === "Escape") calCloseDay();
  else if (e.key === "ArrowLeft") calGoToDay(addDays(calDay, -1), "prev");
  else if (e.key === "ArrowRight") calGoToDay(addDays(calDay, 1), "next");
});

// ---- Day snapshot: counts, names, a one-line "what happened", routine, moved & skipped, diary ----

function calMark(kind, item, day) {
  if (kind === "task") {
    const st = calTaskStatus(item, day);
    return st === "completed" ? "✓" : st === "skipped" ? "⤫" : st === "in_progress" ? "▶" : st === "paused" ? "⏸" : "";
  }
  if (kind === "deadline") {
    const st = deadlineStatus(item);
    return st === "met" ? "✓" : st === "missed" ? "missed" : "";
  }
  return "";
}

function cdRow({ color, title, meta, dim, struck }) {
  return `
    <div class="cd-row ${dim ? "dim" : ""}">
      <span class="cd-dot" style="background:${color}"></span>
      <span class="cd-title ${struck ? "struck" : ""}">${escapeHtml(title)}</span>
      ${meta ? `<span class="cd-meta">${meta}</span>` : ""}
    </div>`;
}

function cdGroup(emoji, label, rows) {
  if (!rows.length) return "";
  return `
    <div class="cd-group">
      <div class="cal-sec-title">${emoji} ${label} <span class="cal-sec-count">${rows.length}</span></div>
      ${rows.join("")}
    </div>`;
}

const cdByTime = (get) => (a, b) => (get(a) || "99:99").localeCompare(get(b) || "99:99");

// Tasks that were rescheduled away from `day` (they no longer belong to it, so they're not in its task list).
function calMovedAway(day) {
  const out = [];
  store.getTasks().forEach((t) => (t.history || []).forEach((h) => {
    if (h.type === "rescheduled" && h.from && h.from.date === day && !(h.to && h.to.date === day)) out.push(h.to && h.to.date);
  }));
  return out;
}

// One calm line about how the day went. Plain facts, no verdicts.
function cdSummaryText(day, tasks) {
  const today = dateKey();
  const st = tasks.map((t) => calTaskStatus(t, day));
  const done = st.filter((s) => s === "completed").length;
  const skipped = st.filter((s) => s === "skipped").length;
  const open = st.length - done - skipped;
  const spentMin = tasks.reduce((n, t) => n + calTaskSpentMs(t, day), 0) / 60000;
  const plannedMin = tasks.reduce((n, t) => n + calPlannedMins(t), 0);
  const moved = calMovedAway(day);
  const parts = [];
  if (day > today) {
    if (tasks.length) parts.push(`${tasks.length} task${tasks.length === 1 ? "" : "s"} planned`);
    if (plannedMin) parts.push(`${formatDurationMins(plannedMin)} planned`);
  } else {
    if (tasks.length) parts.push(`${done} of ${tasks.length} done`);
    if (spentMin) parts.push(`${formatDurationMins(spentMin)} logged`);
    if (skipped) parts.push(`${skipped} skipped`);
  }
  if (moved.length === 1 && moved[0]) parts.push(`1 moved to ${formatShortDate(moved[0]).replace(/ /g, "\u00a0")}`);
  else if (moved.length) parts.push(`${moved.length} moved`);
  if (day < today && open > 0) parts.push(`${open} left undone`);
  return parts.join(" · ");
}

function calBuildDay(day) {
  const { tasks, events, deadlines } = calItemsOn(day);
  const d = keyToDate(day);
  const isPast = day < dateKey();
  const segs = blockSegmentsOn(day);

  const taskRows = tasks.slice().sort(cdByTime((t) => t.startTime)).map((t) => {
    const st = calTaskStatus(t, day);
    const mark = calMark("task", t, day);
    return cdRow({
      color: t.color || "#34C77B", title: t.title, dim: st === "completed", struck: st === "skipped",
      meta: [mark, t.startTime ? formatTime(t.startTime) : ""].filter(Boolean).join(" "),
    });
  });
  const eventRows = events.slice().sort(cdByTime((e) => e.startTime)).map((e) => cdRow({
    color: e.color || "#34C77B", title: e.title, meta: e.startTime ? formatTime(e.startTime) : "",
  }));
  const deadlineRows = deadlines.slice().sort(cdByTime((x) => x.dueTime)).map((x) => cdRow({
    color: x.color || "#34C77B", title: x.title,
    meta: [calMark("deadline", x, day), x.dueTime ? formatTime(x.dueTime) : ""].filter(Boolean).join(" "),
  }));
  const blockRows = segs.map((seg) => cdRow({
    color: seg.block.color || "#34C77B", title: seg.block.title, struck: !!seg.off,
    meta: seg.off ? "Off" : segmentTimeLabel(seg),
  }));

  const groups = [
    cdGroup(TYPE_EMOJI.task, "Tasks", taskRows),
    cdGroup(TYPE_EMOJI.event, "Events", eventRows),
    cdGroup(TYPE_EMOJI.deadline, "Deadlines", deadlineRows),
    cdGroup("🕒", "Time blocks", blockRows),
  ].join("");

  const summary = cdSummaryText(day, tasks);
  const hist = calHistoryLines(day);
  const notes = store.getNotes().filter((n) => n.date === day).sort((a, b) => a.createdAt - b.createdAt);

  const count = (n, label) => `<div class="cd-count"><b>${n}</b><span>${label}</span></div>`;
  const year = d.getFullYear() !== new Date().getFullYear() ? `, ${d.getFullYear()}` : "";
  return {
    title: `${MONTH_NAMES[d.getMonth()]} ${d.getDate()}${year}`,
    subtitle: WEEKDAY_NAMES[d.getDay()],
    html: `
      <span class="cal-chip">${calRelative(day)}</span>
      <div class="cd-counts">${count(tasks.length, "Tasks")}${count(events.length, "Events")}${count(deadlines.length, "Deadlines")}</div>
      ${summary ? `<p class="cd-summary">${summary}</p>` : ""}
      ${groups
        ? `<div class="cal-box-section cd-snap">${groups}</div>`
        : `<div class="cal-box-section cd-empty">${isPast ? "Nothing was recorded for this day." : "Nothing planned for this day."}</div>`}
      ${hist.length ? `<div class="cal-box-section"><div class="cal-sec-title">Moved &amp; skipped <span class="cal-sec-count">${hist.length}</span></div><div class="cal-hist">${hist.map((h) => `<div class="cal-hist-row"><span class="cal-hist-dot cal-hist-${h.kind}"></span><span class="cal-hist-text">${h.html}</span><span class="cal-hist-at">${formatShortDateTime(h.at)}</span></div>`).join("")}</div></div>` : ""}
      <button class="btn btn-primary cd-open" data-cd="open">View this day in Today →</button>
      ${notes.length ? `<div class="cal-sec-title">Diary</div>${notes.map((n) => `<div class="cal-note-card"><span>${formatClockTime(n.createdAt)}${n.title ? ` · <b>${escapeHtml(n.title)}</b>` : ""}</span>${escapeHtml(n.text || "")}</div>`).join("")}` : ""}
    `,
  };
}

function calWireDay(body, day) {
  // Calendar is for looking back and ahead; Today is where a day gets acted on.
  body.querySelector('[data-cd="open"]').addEventListener("click", () => {
    setTodaySelectedDate(day);
    navigate("today");
  });
}
