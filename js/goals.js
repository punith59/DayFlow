// Goals: read-only helpers. A goal is a container you link tasks, events and deadlines to;
// these functions only read and summarise — nothing here creates, moves or edits anything.
// Repeating items are one record each (done/skipped isn't kept per occurrence), so they are
// never counted toward a goal yet.
import { store } from "./store.js";
import {
  dateKey, keyToDate, addDays, escapeHtml, formatShortDate, formatTime, formatDurationMins,
  loggedMs, deadlineStatus,
} from "./utils.js";

const goalIsRepeating = (x) => (x.recurrence || "none") !== "none";

export function goalTaskState(t) {
  return t.status || (t.done ? "completed" : "pending");
}

// Fills in defaults so older or hand-edited goal records never break a screen.
// v19: a goal can use any mix of three targets — milestones, time to log, and a date — listed in `types`.
// Older goals (single targetType) are read as before: a time target stays a time target, a saved date stays a date,
// and the retired "count" target is simply not shown (its values stay in the record).
export function goalNorm(g) {
  const num = (v) => (Number(v) > 0 ? Number(v) : 0);
  const ALL = ["milestones", "time", "date"];
  let types;
  if (Array.isArray(g.targetTypes)) types = ALL.filter((t) => g.targetTypes.includes(t));
  else {
    types = [];
    if (g.targetType === "time" && num(g.targetMins)) types.push("time");
    if (g.targetDate) types.push("date");
  }
  const milestones = (Array.isArray(g.milestones) ? g.milestones : [])
    .filter((m) => m && typeof m === "object")
    .map((m, i) => ({ id: m.id || `m${i}`, title: String(m.title || "").trim() || "Milestone", doneAt: m.doneAt || null }));
  return {
    ...g,
    name: g.name || "Untitled goal",
    emoji: g.emoji || "",
    color: g.color || "#5CBED6",
    why: g.why || "",
    status: ["active", "paused", "achieved"].includes(g.status) ? g.status : "active",
    types,
    useMilestones: types.includes("milestones"),
    useTime: types.includes("time"),
    useDate: types.includes("date"),
    milestones,
    targetMins: types.includes("time") ? num(g.targetMins) : 0,
    targetDate: types.includes("date") ? g.targetDate || "" : "",
    manual: Array.isArray(g.manual) ? g.manual : [],
  };
}

export function goalById(id) {
  if (!id) return null;
  const g = store.getGoals().find((x) => x.id === id);
  return g ? goalNorm(g) : null;
}

export function goalList() {
  return store.getGoals().map(goalNorm);
}

// Goals a form can offer: active and paused ones, plus the one already chosen (even if achieved).
export function goalPickerList(selectedId) {
  return goalList().filter((g) => g.status !== "achieved" || g.id === selectedId);
}

// Everything linked to a goal. One-off items are counted and listed; repeating ones only tallied.
export function goalLinked(goalId) {
  const tasks = store.getTasks().filter((t) => t.goalId === goalId);
  const events = store.getEvents().filter((e) => e.goalId === goalId);
  const deadlines = store.getDeadlines().filter((d) => d.goalId === goalId);
  return {
    tasks: tasks.filter((x) => !goalIsRepeating(x)),
    events: events.filter((x) => !goalIsRepeating(x)),
    deadlines: deadlines.filter((x) => !goalIsRepeating(x)),
    repeating: [...tasks, ...events, ...deadlines].filter(goalIsRepeating).length,
  };
}

// Minutes of time logged against a goal, each stamped with when it happened.
// Task time-log segments count on the day they started; time added by hand counts when the goal has a time target.
export function goalTimeEntries(goal, linked) {
  const g = goalNorm(goal);
  const L = linked || goalLinked(g.id);
  const out = [];
  const now = Date.now();
  L.tasks.forEach((t) => {
    if (Array.isArray(t.timeLog) && t.timeLog.length) {
      t.timeLog.forEach((seg) => out.push({ at: seg.start, mins: Math.max(0, (seg.end ?? now) - seg.start) / 60000 }));
    } else if (loggedMs(t) > 0) {
      out.push({ at: t.actualStartTime || now, mins: loggedMs(t) / 60000 });
    }
  });
  if (g.useTime) {
    g.manual.filter((m) => m.kind === "time").forEach((m) => out.push({ at: m.at, mins: Number(m.amount) || 0 }));
  }
  return out;
}

// The numbers behind a goal's read-out. `value`/`target` are set only when the goal has a target.
export function goalStats(goal) {
  const g = goalNorm(goal);
  const L = goalLinked(g.id);
  const state = L.tasks.map(goalTaskState);
  const done = state.filter((s) => s === "completed").length;
  const skipped = state.filter((s) => s === "skipped").length;
  const dlMet = L.deadlines.filter((d) => deadlineStatus(d) === "met").length;
  const timeMin = goalTimeEntries(g, L).reduce((n, e) => n + e.mins, 0);
  const manualOf = (kind) => g.manual.filter((m) => m.kind === kind).reduce((n, m) => n + (Number(m.amount) || 0), 0);

  // One bar per measurable target. A date target has no bar (see goalDateLine).
  const bars = [];
  if (g.useMilestones && g.milestones.length) {
    const d = g.milestones.filter((m) => m.doneAt).length;
    bars.push({ kind: "milestones", value: d, target: g.milestones.length, label: `${d} of ${g.milestones.length} milestone${g.milestones.length === 1 ? "" : "s"}` });
  }
  if (g.useTime && g.targetMins > 0) {
    bars.push({ kind: "time", value: timeMin, target: g.targetMins, label: `${formatDurationMins(timeMin)} of ${formatDurationMins(g.targetMins)}` });
  }
  bars.forEach((x) => { x.pct = Math.min(100, Math.round((x.value / x.target) * 100)); x.reached = x.value >= x.target; });

  return {
    goal: g, linked: L, bars,
    reached: bars.length > 0 && bars.every((x) => x.reached),
    tasksTotal: L.tasks.length, tasksDone: done, tasksSkipped: skipped,
    deadlinesTotal: L.deadlines.filter((d) => deadlineStatus(d) !== "skipped").length, deadlinesMet: dlMet,
    timeMin,
  };
}

// One calm line of plain facts for a goal card.
// skipBars: leave out the target bars' labels (the goal card shows those on its own progress row).
export function goalReadout(st, { skipBars = false } = {}) {
  const parts = skipBars ? [] : st.bars.map((x) => x.label);
  if (st.tasksTotal) parts.push(`${st.tasksDone} of ${st.tasksTotal} task${st.tasksTotal === 1 ? "" : "s"} done`);
  if (st.deadlinesTotal) parts.push(`${st.deadlinesMet} of ${st.deadlinesTotal} deadline${st.deadlinesTotal === 1 ? "" : "s"} met`);
  if (st.timeMin > 0 && !st.bars.some((x) => x.kind === "time")) parts.push(`${formatDurationMins(st.timeMin)} logged`);
  return parts.length ? parts.join(" · ") : "Nothing linked yet";
}

// Linked items as { kind, item, day, time, state } rows, sorted by date.
export function goalRows(goalId) {
  const L = goalLinked(goalId);
  return [
    ...L.tasks.map((item) => ({ kind: "task", item, day: item.date, time: item.startTime || "", state: goalTaskState(item) })),
    ...L.events.map((item) => ({ kind: "event", item, day: item.date, time: item.startTime || "", state: "pending" })),
    ...L.deadlines.map((item) => ({ kind: "deadline", item, day: item.dueDate, time: item.dueTime || "", state: deadlineStatus(item) })),
  ].sort((a, b) => (a.day || "").localeCompare(b.day || "") || (a.time || "99:99").localeCompare(b.time || "99:99"));
}

// A row still ahead of you: today or later, and not already finished/skipped/met.
export function goalRowIsAhead(r) {
  if (!r.day || r.day < dateKey()) return false;
  return !["completed", "skipped", "met"].includes(r.state);
}

export function goalNextUp(goalId) {
  return goalRows(goalId).find(goalRowIsAhead) || null;
}

// Plain weekly totals of logged time, most recent first. Weeks start on Sunday, like the calendar.
export function goalWeekRows(goal, weeks = 4) {
  const entries = goalTimeEntries(goal);
  const today = dateKey();
  const thisStart = addDays(today, -keyToDate(today).getDay());
  const rows = [];
  // Weeks that ended before the goal was created are left out (a goal without a creation stamp shows all).
  const born = goal.createdAt ? dateKey(new Date(goal.createdAt)) : "";
  for (let i = 0; i < weeks; i++) {
    const start = addDays(thisStart, -7 * i);
    const end = addDays(start, 6);
    if (born && end < born) break;
    const mins = entries.reduce((n, e) => {
      const d = dateKey(new Date(e.at));
      return d >= start && d <= end ? n + e.mins : n;
    }, 0);
    rows.push({ label: i === 0 ? "This week" : i === 1 ? "Last week" : `${formatShortDate(start)} – ${formatShortDate(end)}`, mins });
  }
  return rows;
}

// The target date as plain facts: days to go, or how many days past it is. Used by the goal card line and the detail tile.
// `achieved` goals just show the date. Nothing here moves, reschedules or warns.
export function goalDateInfo(goal, achieved = false) {
  if (!goal.targetDate) return null;
  const diff = Math.round((keyToDate(goal.targetDate) - keyToDate(dateKey())) / 86400000);
  const date = formatShortDate(goal.targetDate);
  const n = Math.abs(diff);
  const days = `${n} day${n === 1 ? "" : "s"}`;
  if (achieved) return { diff, date, value: date, sub: "target date", tail: "" };
  if (diff > 1) return { diff, date, value: days, sub: `to go · ${date}`, tail: `${days} to go` };
  if (diff === 1) return { diff, date, value: "1 day", sub: `to go · ${date}`, tail: "tomorrow" };
  if (diff === 0) return { diff, date, value: "Today", sub: date, tail: "today" };
  return { diff, date, value: days, sub: `past · ${date}`, tail: `${days} past` };
}

// "Target date Dec 20 · 68 days to go" (or "· 3 days past" once it has passed).
export function goalDateLine(goal) {
  const i = goalDateInfo(goal);
  if (!i) return "";
  return `Target date ${i.date}${i.tail ? ` · ${i.tail}` : ""}`;
}

// Small coloured label shown on item cards that belong to a goal.
export function goalBadgeHtml(goalId) {
  const g = goalById(goalId);
  if (!g) return "";
  return `<div class="task-sub goal-badge"><span class="goal-dot" style="background:${g.color}"></span>${g.emoji ? `${g.emoji} ` : ""}${escapeHtml(g.name)}</div>`;
}

export function goalWhen(row) {
  if (!row.day) return "";
  return `${formatShortDate(row.day)}${row.time ? ` ${formatTime(row.time)}` : ""}`;
}
