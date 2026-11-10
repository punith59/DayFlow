// "Unfinished" tasks and what happens to a task's links when it is rescheduled. No UI here.
import { store } from "./store.js";
import { escapeHtml, dateKey, keyToDate, timeToMinutes } from "./utils.js";

const GRACE_MINS = 120;

/** A timed task becomes unfinished 2 hours after its end time (start time if it has no end); an anytime task when its day is over.
 *  Completed, skipped, repeating and currently running tasks are never listed. */
export function isUnfinished(t, now = new Date()) {
  if (!t || !t.date || (t.recurrence || "none") !== "none") return false;
  const status = t.status || (t.done ? "completed" : "pending");
  if (status === "completed" || status === "skipped" || status === "in_progress") return false;
  const clock = t.endTime || t.startTime;
  if (clock) return now.getTime() >= keyToDate(t.date).getTime() + (timeToMinutes(clock) + GRACE_MINS) * 60000;
  return t.date < dateKey(now);
}

export function unfinishedTasks(now = new Date()) {
  return store.getTasks()
    .filter((t) => isUnfinished(t, now))
    .sort((a, b) => a.date.localeCompare(b.date) || (a.startTime || "").localeCompare(b.startTime || ""));
}

// True when something on (date, time) is not earlier than the task's new (date, start time).
// Times are compared only when both sides have one; otherwise the day decides.
function notBefore(date, time, newDate, newStart) {
  if (!date) return true;
  if (date !== newDate) return date > newDate;
  if (time && newStart) return timeToMinutes(time) >= timeToMinutes(newStart);
  return true;
}

/** What rescheduling does to a task's link and personal deadline: they stay if they still come at or after the
 *  task's new time, and are removed if they'd now be before it. Returns { patch, notes }. */
export function relinkPatch(task, newDate, newStart) {
  const patch = {}, notes = [];
  if (task.linkedType && task.linkedId) {
    const target = (task.linkedType === "event" ? store.getEvents() : store.getDeadlines()).find((x) => x.id === task.linkedId);
    const date = target && (task.linkedType === "event" ? target.date : target.dueDate);
    const time = target && (task.linkedType === "event" ? target.startTime : target.dueTime);
    if (!target || !notBefore(date, time, newDate, newStart)) {
      patch.linkedType = null; patch.linkedId = null;
      if (target) notes.push(`unlinked from ${escapeHtml(target.title)}`);
    }
  }
  if (task.deadline && !notBefore(task.deadline, task.deadlineTime, newDate, newStart)) {
    patch.deadline = null; patch.deadlineTime = null;
    notes.push("its deadline cleared");
  }
  return { patch, notes };
}
