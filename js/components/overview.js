import { store } from "../store.js";
import { openPopover } from "./popover.js";
import { linkedBlockHtml } from "../timeblocks.js";
import { escapeHtml, formatTime, formatShortDate, formatClockTime, formatDurationMins, timeToMinutes, TYPE_EMOJI, deadlineStatus, loggedMs, RECURRENCE_OPTIONS } from "../utils.js";

function row(label, value) {
  if (!value) return "";
  return `<div class="overview-row"><span class="overview-label">${label}</span><span class="overview-value">${value}</span></div>`;
}

function whenLabel(w) {
  if (!w || !w.date) return "";
  return `${formatShortDate(w.date)}${w.time ? ` ${formatTime(w.time)}` : ""}`;
}

// Reschedule / skip log — only covers actions taken after history tracking shipped.
function historyHtml(item) {
  const h = item.history || [];
  if (!h.length) return "";
  return h.map((e) => {
    const at = `${formatShortDate(new Date(e.at).toISOString().slice(0, 10))} ${formatClockTime(e.at)}`;
    const what = e.type === "skipped" ? "Skipped" : `Rescheduled ${whenLabel(e.from)} → ${whenLabel(e.to)}`;
    return `${what} <span class="overview-label">(${at})</span>`;
  }).join("<br>");
}

function recurrenceLabel(value) {
  const found = RECURRENCE_OPTIONS.find((o) => o.value === (value || "none"));
  return found && found.value !== "none" ? found.label : "";
}

function goalName(goalId) {
  if (!goalId) return "";
  const g = store.getGoals().find((x) => x.id === goalId);
  return g ? `${g.emoji ? g.emoji + " " : ""}${escapeHtml(g.name)}` : "";
}

function linkedInfoHtml(item) {
  if (!item.linkedType || !item.linkedId) return "";
  const source = item.linkedType === "event" ? store.getEvents() : store.getDeadlines();
  const target = source.find((x) => x.id === item.linkedId);
  if (!target) return "";
  const icon = item.linkedType === "event" ? TYPE_EMOJI.event : TYPE_EMOJI.deadline;
  const date = item.linkedType === "event" ? target.date : target.dueDate;
  const time = item.linkedType === "event" ? target.startTime : target.dueTime;
  return `${icon} ${escapeHtml(target.title)} — ${formatShortDate(date)}${time ? ` ${formatTime(time)}` : ""}`;
}

function linkedTasksHtml(kind, id) {
  const tasks = store.tasksLinkedTo(kind, id);
  if (!tasks.length) return "";
  return tasks.map((t) => `${TYPE_EMOJI.task} ${escapeHtml(t.title)}`).join("<br>");
}

function swatchDot(color) {
  return `<span class="overview-swatch" style="background:${color}"></span>`;
}

export function openOverviewSheet(kind, item, anchorEl) {
  let body = "";
  if (kind === "task") body = taskOverviewHtml(item);
  else if (kind === "event") body = eventOverviewHtml(item);
  else body = deadlineOverviewHtml(item);

  openPopover(anchorEl, `
    <h2 class="sheet-title">${TYPE_EMOJI[kind]} ${escapeHtml(item.title)}</h2>
    <div class="overview-list">${body}</div>
  `);
}

function taskOverviewHtml(t) {
  const status = t.status || (t.done ? "completed" : "pending");
  const statusLabel = { pending: "Not started", in_progress: "In progress", paused: "Paused", completed: "Completed", skipped: "Skipped" }[status] || status;

  let timingRows = "";
  if (t.startTime) {
    const dur = t.endTime ? formatDurationMins(timeToMinutes(t.endTime) - timeToMinutes(t.startTime)) : "";
    timingRows += row("Scheduled", `${formatTime(t.startTime)}${t.endTime ? `–${formatTime(t.endTime)}` : ""}${dur ? ` (${dur})` : ""}`);
  } else if (t.durationMins) {
    timingRows += row("Duration", `${formatDurationMins(t.durationMins)} (no fixed time)`);
  }
  if ((status === "in_progress" || status === "paused") && t.actualStartTime) {
    timingRows += row("Started", formatClockTime(t.actualStartTime));
  }
  if (t.timeLog && t.timeLog.length) {
    timingRows += row("Time logged", formatDurationMins(loggedMs(t) / 60000));
    if (t.timeLog.length > 1 || status === "completed") {
      timingRows += row("Sessions", t.timeLog.map((s) => `${formatClockTime(s.start)}–${s.end ? formatClockTime(s.end) : "now"}`).join("<br>"));
    }
  }
  if (status === "completed") {
    if (t.timeLog && t.timeLog.length) {
      timingRows += row("Completed at", formatClockTime(t.actualEndTime));
    } else if (t.actualStartTime && t.actualEndTime) {
      const mins = (t.actualEndTime - t.actualStartTime) / 60000;
      timingRows += row("Actually took", `${formatClockTime(t.actualStartTime)}–${formatClockTime(t.actualEndTime)} (${formatDurationMins(mins)})`);
    } else if (t.actualEndTime) {
      timingRows += row("Completed at", formatClockTime(t.actualEndTime));
    }
  }

  return [
    row("Status", statusLabel),
    row("Color", swatchDot(t.color)),
    row("Date", formatShortDate(t.date)),
    timingRows,
    row("Personal deadline", t.deadline ? `${formatShortDate(t.deadline)}${t.deadlineTime ? ` ${formatTime(t.deadlineTime)}` : ""}` : ""),
    row("Linked to", linkedInfoHtml(t)),
    row("Goal", goalName(t.goalId)),
    row("Repeats", recurrenceLabel(t.recurrence)),
    row("Description", t.description ? escapeHtml(t.description).replace(/\n/g, "<br>") : ""),
    row("Time block", linkedBlockHtml(t)),
    row("History", historyHtml(t)),
  ].filter(Boolean).join("");
}

function eventOverviewHtml(e) {
  return [
    row("Color", swatchDot(e.color)),
    row("Date", formatShortDate(e.date)),
    row("Time", e.startTime ? `${formatTime(e.startTime)}${e.endTime ? `–${formatTime(e.endTime)}` : ""}` : ""),
    row("Location", e.location ? escapeHtml(e.location) : ""),
    row("Repeats", recurrenceLabel(e.recurrence)),
    row("Description", e.description ? escapeHtml(e.description).replace(/\n/g, "<br>") : ""),
    row("Goal", goalName(e.goalId)),
    row("Linked tasks", linkedTasksHtml("event", e.id)),
    row("Time block", linkedBlockHtml(e)),
    row("History", historyHtml(e)),
  ].filter(Boolean).join("");
}

function deadlineOverviewHtml(d) {
  const status = deadlineStatus(d);
  const statusLabel = { pending: "Upcoming", met: "Met", missed: "Missed", skipped: "Skipped" }[status];
  return [
    row("Status", statusLabel),
    row("Color", swatchDot(d.color)),
    row("Due", `${formatShortDate(d.dueDate)}${d.dueTime ? ` ${formatTime(d.dueTime)}` : ""}`),
    row("Met at", d.metAt ? formatClockTime(d.metAt) : ""),
    row("Location", d.location ? escapeHtml(d.location) : ""),
    row("Repeats", recurrenceLabel(d.recurrence)),
    row("Description", d.description ? escapeHtml(d.description).replace(/\n/g, "<br>") : ""),
    row("Goal", goalName(d.goalId)),
    row("Linked tasks", linkedTasksHtml("deadline", d.id)),
    row("Time block", linkedBlockHtml(d)),
    row("History", historyHtml(d)),
  ].filter(Boolean).join("");
}
