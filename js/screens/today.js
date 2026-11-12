import { store } from "../store.js";
import { greeting, escapeHtml, pad2, formatTime, timeToMinutes, occursOn, prettyDate, dateKey, TYPE_EMOJI, formatClockTime, formatDurationMins, formatShortDate, deadlineStatus, loggedMs, closeOpenSegment, taskSnapshot, withHistory } from "../utils.js";
import { dayNavHtml, wireDayNav } from "../components/dayNav.js";
import { openItemActionMenu } from "../components/actionMenu.js";
import { openOverviewSheet } from "../components/overview.js";
import { attachCardGestures } from "../components/swipe.js";
import { showToast, showUndoToast } from "../components/toast.js";
import { openBlockDaySheet } from "../components/blockSheet.js";
import { blockSegmentsOn, itemsLinkedTo, segmentTimeLabel } from "../timeblocks.js";
import { goalBadgeHtml } from "../goals.js";
import { unfinishedTasks } from "../unfinished.js";
import { openUnfinishedSheet } from "../components/unfinishedSheet.js";

// Persists for the session: defaults to today on first load, retains
// whichever day you were viewing if you switch tabs and come back.
let selectedDate = dateKey();

// Basic type filter — nothing selected shows everything.
let activeTypes = new Set();

export function getTodaySelectedDate() {
  return selectedDate;
}

// Lets Calendar's "View this day in Today" choose which day Today shows.
export function setTodaySelectedDate(key) {
  selectedDate = key;
}

// What a new item created from Today should default to: never let a past day you're
// merely viewing become a new item's date — a future day you're viewing is honored.
export function getTodayCreatePresetDate() {
  const now = dateKey();
  return selectedDate < now ? now : selectedDate;
}

function taskStatus(t) {
  if (t.status) return t.status; // "in_progress" | "paused" | "completed" | "skipped"
  return t.done ? "completed" : "pending";
}

function passesTypeFilter(kind) {
  return activeTypes.size === 0 || activeTypes.has(kind);
}

export function renderToday(container) {
  const rawTasks = store.getTasks().filter((t) => occursOn(t, selectedDate) && passesTypeFilter("task"));
  const rawEvents = store.getEvents().filter((e) => occursOn(e, selectedDate) && passesTypeFilter("event"));
  const rawDeadlines = store.getDeadlines().filter((d) => occursOn(d, selectedDate) && passesTypeFilter("deadline"));
  const totalUnfiltered = store.getTasks().filter((t) => occursOn(t, selectedDate)).length
    + store.getEvents().filter((e) => occursOn(e, selectedDate)).length
    + store.getDeadlines().filter((d) => occursOn(d, selectedDate)).length;

  const items = [
    ...rawTasks.map((t) => ({ kind: "task", bucket: t.startTime ? "scheduled" : "unscheduled", ...t })),
    ...rawEvents.map((e) => ({ kind: "event", bucket: e.startTime ? "scheduled" : "unscheduled", ...e })),
    ...rawDeadlines.map((d) => ({ kind: "deadline", bucket: d.dueTime ? "scheduled" : "unscheduled", ...d, startTime: d.dueTime || null })),
  ];

  // Time blocks are the day's background structure: always shown (whatever the filter),
  // with the day's items attached to them nested inside. Everything else sits on the rail by time.
  const segs = blockSegmentsOn(selectedDate);
  const nestedKeys = new Set();
  const railEntries = [];
  const timeOf = (x) => (x.startTime ? timeToMinutes(x.startTime) : 9999);
  segs.forEach((seg, i) => {
    let linked = [];
    if (seg.kind === "starts") {
      linked = itemsLinkedTo(seg.block.id, selectedDate)
        .map(({ kind, item }) => items.find((x) => x.kind === kind && x.id === item.id))
        .filter(Boolean)
        .sort((x, y) => timeOf(x) - timeOf(y));
      linked.forEach((x) => nestedKeys.add(`${x.kind}:${x.id}`));
    }
    railEntries.push({ at: seg.segStart, order: 0, html: railBlockHtml(seg, i, linked) });
  });
  const loose = items.filter((x) => !nestedKeys.has(`${x.kind}:${x.id}`));
  const timed = loose.filter((x) => x.bucket === "scheduled");
  const untimed = loose.filter((x) => x.bucket === "unscheduled");
  timed.forEach((x) => railEntries.push({ at: timeOf(x), order: 1, html: railItemHtml(x) }));
  railEntries.sort((x, y) => x.at - y.at || x.order - y.order);
  const hasContent = segs.length > 0 || items.length > 0;

  const carryN = unfinishedTasks().length;
  container.innerHTML = `
    <div class="greet-row">
      <p class="page-greeting">${greeting()}</p>
      ${carryN ? `<button class="rs-pill" id="rs-open">↺ Unfinished · ${carryN}</button>` : ""}
    </div>
    <h1 class="page-date">Timeline for the Day</h1>

    ${dayNavHtml(selectedDate)}


    ${filterRowHtml()}

    ${hasContent ? `
      <div class="card day-items-card">
        ${untimed.length ? `
          <div class="section-title day-section-title">Anytime</div>
          ${untimed.map(itemRowHtml).join("")}
        ` : ""}
        ${railEntries.length ? `
          ${untimed.length ? `<div class="section-title day-section-title">Scheduled</div>` : ""}
          <div class="rail">${railEntries.map((e) => e.html).join("")}</div>
        ` : ""}
      </div>
    ` : ""}

    ${totalUnfiltered === 0 ? (hasContent ? `
      <p class="rail-empty">Nothing else planned for ${prettyDate(selectedDate)}. Tap + to add something.</p>
    ` : `
      <div class="placeholder-panel" style="margin-top: 18px;">
        <div class="placeholder-icon">○</div>
        <div class="placeholder-title">Nothing scheduled</div>
        <p class="placeholder-text">Nothing planned for ${prettyDate(selectedDate)} yet.<br>Tap the + button to add a task, event, or deadline.</p>
      </div>
    `) : items.length === 0 ? (hasContent ? `
      <div class="rail-empty">Nothing here matches your filter.<br><button class="btn" id="filter-reset-empty" style="margin-top:10px;">Show everything</button></div>
    ` : `
      <div class="placeholder-panel" style="margin-top: 18px;">
        <div class="placeholder-icon">⌗</div>
        <div class="placeholder-title">Nothing matches your filter</div>
        <p class="placeholder-text">There's something on ${prettyDate(selectedDate)}, just not in what's currently shown.</p>
        <button class="btn" id="filter-reset-empty" style="margin-top:12px;">Show everything</button>
      </div>
    `) : ""}
  `;

  wireDayNav(container, selectedDate, (newDate) => {
    selectedDate = newDate;
    renderToday(container);
  });

  const rsBtn = container.querySelector("#rs-open");
  if (rsBtn) rsBtn.addEventListener("click", () => openUnfinishedSheet(() => renderToday(container)));

  wireFilterRow();
  wireRowInteractions();
  wireBlockTaps();

  // Tapping a time block opens its sheet (details, and "no <block> on this day").
  function wireBlockTaps() {
    container.querySelectorAll("[data-blk]").forEach((el) => {
      const open = () => openBlockDaySheet(segs[Number(el.getAttribute("data-blk"))]);
      el.addEventListener("click", open);
      el.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); }
      });
    });
  }

  function wireFilterRow() {
    container.querySelectorAll("[data-filter]").forEach((el) => {
      el.addEventListener("click", () => {
        const type = el.getAttribute("data-filter").split(":")[1];
        if (activeTypes.has(type)) activeTypes.delete(type);
        else activeTypes.add(type);
        renderToday(container);
      });
    });
    const resetBtn = document.getElementById("filter-reset-empty");
    if (resetBtn) {
      resetBtn.addEventListener("click", () => {
        activeTypes = new Set();
        renderToday(container);
      });
    }
  }

  function wireRowInteractions() {
    container.querySelectorAll("[data-item-card]").forEach((cardEl) => {
      const kind = cardEl.getAttribute("data-kind");
      const id = cardEl.getAttribute("data-item-card");
      const getItem = () => {
        if (kind === "task") return store.getTasks().find((x) => x.id === id);
        if (kind === "event") return store.getEvents().find((x) => x.id === id);
        return store.getDeadlines().find((x) => x.id === id);
      };

      const gestureOpts = {
        onTap: () => { const it = getItem(); if (it) openItemActionMenu(kind, it, () => renderToday(container), cardEl.closest(".swipe-wrap") || cardEl); },
        onLongPress: () => { const it = getItem(); if (it) openOverviewSheet(kind, it, cardEl.closest(".swipe-wrap") || cardEl); },
      };

      if (kind === "task") {
        gestureOpts.onSwipeRight = () => handleCompleteTask(id);
        gestureOpts.onSwipeLeft = () => handleStartTask(id);
        gestureOpts.onDrag = (dx) => {
          cardEl.closest(".swipe-wrap").classList.toggle("swipe-right-active", dx > 20);
          cardEl.closest(".swipe-wrap").classList.toggle("swipe-left-active", dx < -20);
        };
      } else if (kind === "deadline") {
        gestureOpts.onSwipeRight = () => handleMarkMet(id);
        gestureOpts.onSwipeLeft = () => handleSkipDeadline(id);
        gestureOpts.onDrag = (dx) => {
          cardEl.closest(".swipe-wrap").classList.toggle("swipe-right-active", dx > 20);
          cardEl.closest(".swipe-wrap").classList.toggle("swipe-left-active", dx < -20);
        };
      } else {
        gestureOpts.enableDrag = false;
      }

      attachCardGestures(cardEl, gestureOpts);
    });
  }

  // Left swipe: start -> pause -> resume. Right swipe: complete.
  function handleStartTask(taskId) {
    const t = store.getTasks().find((x) => x.id === taskId);
    if (!t) return;
    const status = taskStatus(t);
    if (status === "completed") { showToast("Already completed"); return; }
    if (status === "skipped") { showToast("This task was skipped"); return; }
    const snap = taskSnapshot(t);
    const now = Date.now();
    let patch, msg;
    if (status === "in_progress") {
      patch = { status: "paused", timeLog: closeOpenSegment(t.timeLog, now) };
      msg = "Task paused";
    } else {
      patch = { status: "in_progress", timeLog: [...(t.timeLog || []), { start: now, end: null }], actualStartTime: t.actualStartTime || now };
      msg = status === "paused" ? "Task resumed" : "Task started";
    }
    store.updateTask(taskId, patch);
    renderToday(container);
    showUndoToast(msg, () => { store.updateTask(taskId, snap); renderToday(container); });
  }

  function handleCompleteTask(taskId) {
    const t = store.getTasks().find((x) => x.id === taskId);
    if (!t) return;
    const status = taskStatus(t);
    if (status === "completed") { showToast("Already completed"); return; }
    if (status === "skipped") { showToast("This task was skipped"); return; }
    const snap = taskSnapshot(t);
    const now = Date.now();
    store.updateTask(taskId, { status: "completed", actualEndTime: now, done: true, timeLog: t.timeLog ? closeOpenSegment(t.timeLog, now) : undefined });
    renderToday(container);
    showUndoToast("Task completed", () => { store.updateTask(taskId, snap); renderToday(container); });
  }

  function handleSkipDeadline(deadlineId) {
    const d = store.getDeadlines().find((x) => x.id === deadlineId);
    if (!d) return;
    if (d.metAt) { showToast("Already met"); return; }
    if (d.skippedAt) { showToast("Already skipped"); return; }
    const prev = { skippedAt: null, history: d.history };
    store.updateDeadline(deadlineId, { skippedAt: Date.now(), history: withHistory(d, { type: "skipped", date: d.dueDate }) });
    renderToday(container);
    showUndoToast("Deadline skipped", () => { store.updateDeadline(deadlineId, prev); renderToday(container); });
  }

  function handleMarkMet(deadlineId) {
    const d = store.getDeadlines().find((x) => x.id === deadlineId);
    if (!d) return;
    if (d.metAt) { showToast("Already met"); return; }
    if (d.skippedAt) { showToast("This deadline was skipped"); return; }
    const prevMetAt = d.metAt || null;
    store.updateDeadline(deadlineId, { metAt: Date.now() });
    renderToday(container);
    showUndoToast("Deadline marked as met", () => {
      store.updateDeadline(deadlineId, { metAt: prevMetAt });
      renderToday(container);
    });
  }
}

// ---------------- Day summary + rail rows ----------------

function railMinsLabel(m) {
  return formatTime(`${pad2(Math.floor(m / 60) % 24)}:${pad2(m % 60)}`);
}

function railBlockHtml(seg, index, linked) {
  const b = seg.block;
  const sub = seg.off
    ? `Off${seg.off.reason ? ` — ${escapeHtml(seg.off.reason)}` : ""}`
    : [segmentTimeLabel(seg), b.group ? escapeHtml(b.group) : "", b.place ? escapeHtml(b.place) : ""].filter(Boolean).join(" · ");
  return `
    <div class="rail-row">
      <span class="rail-time">${railMinsLabel(seg.segStart)}</span>
      <span class="rail-node rail-node-block"></span>
      <div class="rail-card rail-block ${seg.off ? "off" : ""}" style="--c:${b.color || "#5CBED6"}">
        <div class="rail-block-head" data-blk="${index}" role="button" tabindex="0">
          <span class="rail-title">${escapeHtml(b.title)}</span>
          <span class="rail-sub">${sub}</span>
        </div>
        ${linked.length ? `<div class="rail-nest">${linked.map(itemRowHtml).join("")}</div>` : ""}
      </div>
    </div>`;
}

function railItemHtml(item) {
  return `
    <div class="rail-row">
      <span class="rail-time">${formatTime(item.startTime)}</span>
      <span class="rail-node"></span>
      <div class="rail-item">${itemRowHtml(item)}</div>
    </div>`;
}

// ---------------- Filter row (basic — type only) ----------------

function filterRowHtml() {
  return `
    <div class="filter-bar">
      <div class="filter-chip-group">
        <button class="filter-chip ${activeTypes.has("task") ? "active" : ""}" data-filter="type:task">${TYPE_EMOJI.task} Tasks</button>
        <button class="filter-chip ${activeTypes.has("event") ? "active" : ""}" data-filter="type:event">${TYPE_EMOJI.event} Events</button>
        <button class="filter-chip ${activeTypes.has("deadline") ? "active" : ""}" data-filter="type:deadline">${TYPE_EMOJI.deadline} Deadlines</button>
      </div>
    </div>
  `;
}

// ---------------- Row rendering (unified card look) ----------------

function itemRowHtml(item) {
  if (item.kind === "task") return taskRowHtml(item);
  if (item.kind === "event") return eventRowHtml(item);
  return deadlineRowHtml(item);
}

function linkedTargetInfo(item) {
  if (!item.linkedType || !item.linkedId) return null;
  const source = item.linkedType === "event" ? store.getEvents() : store.getDeadlines();
  const target = source.find((x) => x.id === item.linkedId);
  if (!target) return null;
  const icon = item.linkedType === "event" ? TYPE_EMOJI.event : TYPE_EMOJI.deadline;
  const date = item.linkedType === "event" ? target.date : target.dueDate;
  const time = item.linkedType === "event" ? target.startTime : target.dueTime;
  return `${icon} ${escapeHtml(target.title)} — ${formatShortDate(date)}${time ? ` ${formatTime(time)}` : ""}`;
}

function taskRowHtml(t) {
  const status = taskStatus(t);
  const scheduledDuration = t.startTime && t.endTime ? formatDurationMins(timeToMinutes(t.endTime) - timeToMinutes(t.startTime)) : null;
  const linkedInfo = linkedTargetInfo(t);

  let scheduledLine = "";
  if (t.startTime) {
    scheduledLine = `<div class="task-sub">Scheduled: ${formatTime(t.startTime)}${t.endTime ? `–${formatTime(t.endTime)}` : ""}${scheduledDuration ? ` (${scheduledDuration})` : ""}</div>`;
  } else if (t.durationMins) {
    scheduledLine = `<div class="task-sub">Duration: ${formatDurationMins(t.durationMins)}, no fixed time</div>`;
  }

  let statusLine = "";
  const logged = formatDurationMins(loggedMs(t) / 60000);
  if (status === "in_progress") {
    statusLine = `<div class="task-sub task-inprogress">▶ In progress since ${formatClockTime(t.actualStartTime)}${(t.timeLog || []).length > 1 ? ` · ${logged} logged` : ""}</div>`;
  } else if (status === "paused") {
    statusLine = `<div class="task-sub task-inprogress">⏸ Paused · ${logged} logged</div>`;
  } else if (status === "completed") {
    if (t.actualStartTime && t.actualEndTime) {
      statusLine = `<div class="task-sub task-actual">✓ ${formatClockTime(t.actualStartTime)}–${formatClockTime(t.actualEndTime)} (${logged} logged)</div>`;
    } else if (t.actualEndTime) {
      statusLine = `<div class="task-sub task-actual">✓ Completed at ${formatClockTime(t.actualEndTime)}</div>`;
    }
  } else if (status === "skipped") {
    statusLine = `<div class="task-sub task-skipped">⤫ Skipped</div>`;
  }

  return `
    <div class="swipe-wrap">
      <div class="swipe-bg">
        <span class="swipe-hint swipe-hint-left">Complete ✓</span>
        <span class="swipe-hint swipe-hint-right">${status === "in_progress" ? "⏸ Pause" : status === "paused" ? "▶ Resume" : "▶ Start"}</span>
      </div>
      <div class="swipe-fg timeline-row item-card ${status}" data-item-card="${t.id}" data-kind="task">
        <div class="timeline-indicator ${status === "skipped" ? "cancelled-marker" : ""}" style="${status === "skipped" ? `color:${t.color}` : `background:${t.color}`}"></div>
        <div class="timeline-body">
          <div class="timeline-title-row">
            <span class="timeline-emoji">${TYPE_EMOJI.task}</span>
            <span class="timeline-title ${status === "completed" ? "done" : ""} ${status === "skipped" ? "skipped" : ""}">${escapeHtml(t.title)}</span>
          </div>
          ${t.deadline ? `<div class="task-sub deadline-tag">Due ${formatShortDate(t.deadline)}${t.deadlineTime ? ` ${formatTime(t.deadlineTime)}` : ""}</div>` : ""}
          ${linkedInfo ? `<div class="task-sub linked-badge">↳ ${linkedInfo}</div>` : ""}
          ${goalBadgeHtml(t.goalId)}
          ${scheduledLine}
          ${statusLine}
        </div>
      </div>
    </div>
  `;
}

function eventRowHtml(e) {
  return `
    <div class="timeline-row item-card" data-item-card="${e.id}" data-kind="event">
      <div class="timeline-indicator" style="background:${e.color}"></div>
      <div class="timeline-body">
        <div class="timeline-title-row">
          <span class="timeline-emoji">${TYPE_EMOJI.event}</span>
          <span class="timeline-title">${escapeHtml(e.title)}</span>
        </div>
        ${e.startTime ? `<div class="task-sub">Scheduled: ${formatTime(e.startTime)}${e.endTime ? `–${formatTime(e.endTime)}` : ""}</div>` : ""}
        ${e.location ? `<div class="task-sub">${escapeHtml(e.location)}</div>` : ""}
        ${goalBadgeHtml(e.goalId)}
      </div>
    </div>
  `;
}

function deadlineRowHtml(d) {
  const status = deadlineStatus(d);
  let statusLine = "";
  if (status === "missed") statusLine = `<div class="task-sub task-missed">⚠ Missed</div>`;
  else if (status === "met") statusLine = `<div class="task-sub task-actual">✓ Met${d.metAt ? ` at ${formatClockTime(d.metAt)}` : ""}</div>`;
  else if (status === "skipped") statusLine = `<div class="task-sub task-skipped">⤫ Skipped</div>`;

  return `
    <div class="swipe-wrap">
      <div class="swipe-bg">
        <span class="swipe-hint swipe-hint-left">Mark met ✓</span>
        <span class="swipe-hint swipe-hint-right">⤫ Skip</span>
      </div>
      <div class="swipe-fg timeline-row item-card ${status}" data-item-card="${d.id}" data-kind="deadline">
        <div class="timeline-indicator ${status === "skipped" ? "cancelled-marker" : ""}" style="${status === "skipped" ? `color:${d.color}` : `background:${d.color}`}"></div>
        <div class="timeline-body">
          <div class="timeline-title-row">
            <span class="timeline-emoji">${TYPE_EMOJI.deadline}</span>
            <span class="timeline-title ${status === "met" ? "done" : ""} ${status === "skipped" ? "skipped" : ""}">${escapeHtml(d.title)}</span>
          </div>
          <div class="task-sub">Due: ${formatShortDate(d.dueDate)}${d.dueTime ? ` ${formatTime(d.dueTime)}` : ""}</div>
          ${d.location ? `<div class="task-sub">${escapeHtml(d.location)}</div>` : ""}
          ${goalBadgeHtml(d.goalId)}
          ${statusLine}
        </div>
      </div>
    </div>
  `;
}
