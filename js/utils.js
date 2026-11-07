export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function pad2(n) { return String(n).padStart(2, "0"); }

export function dateKey(d = new Date()) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function keyToDate(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(key, delta) {
  const d = keyToDate(key);
  d.setDate(d.getDate() + delta);
  return dateKey(d);
}

export function startOfWeek(key) {
  const d = keyToDate(key);
  const day = d.getDay(); // 0 = Sunday
  d.setDate(d.getDate() - day);
  return dateKey(d);
}

export function weekDays(weekStartKey) {
  const out = [];
  for (let i = 0; i < 7; i++) out.push(addDays(weekStartKey, i));
  return out;
}

export const WEEKDAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
export const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];

export function prettyDate(key) {
  const d = keyToDate(key);
  return `${WEEKDAY_LONG[d.getDay()]}, ${MONTH_NAMES[d.getMonth()]} ${d.getDate()}`;
}
const WEEKDAY_LONG = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

export function formatTime(t) {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${pad2(m)} ${period}`;
}

export function timeToMinutes(t) {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

export function minutesBetween(t1, t2) {
  const a = timeToMinutes(t1), b = timeToMinutes(t2);
  if (a == null || b == null) return null;
  return b - a;
}

export function formatClockTime(ms) {
  const d = new Date(ms);
  return formatTime(`${pad2(d.getHours())}:${pad2(d.getMinutes())}`);
}

export function formatDurationMins(mins) {
  const m = Math.max(0, Math.round(mins));
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem ? `${h}h ${rem}m` : `${h}h`;
}

export function formatShortDate(dk) {
  if (!dk) return "";
  const d = keyToDate(dk);
  return `${MONTH_NAMES[d.getMonth()].slice(0, 3)} ${d.getDate()}`;
}

/**
 * Whether a given date+time (time optional) has already fully passed relative
 * to the real current moment. A date-only value (no time) is only "in the
 * past" once the whole day has elapsed.
 */
export function isInPast(dateStr, timeStr) {
  if (!dateStr) return false;
  const nowKey = dateKey();
  if (dateStr < nowKey) return true;
  if (dateStr > nowKey) return false;
  if (!timeStr) return false;
  const now = new Date();
  return timeToMinutes(timeStr) < now.getHours() * 60 + now.getMinutes();
}

// Alias read more naturally at overdue call sites — same semantics as isInPast.
export const isOverdueOn = isInPast;

export function deadlineStatus(d) {
  if (d.metAt) return "met";
  return isInPast(d.dueDate, d.dueTime) ? "missed" : "pending";
}

export function escapeHtml(str) {
  if (str == null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function greeting() {
  const h = new Date().getHours();
  if (h < 5) return "Still up?";
  if (h < 12) return "Good morning.";
  if (h < 17) return "Good afternoon.";
  if (h < 21) return "Good evening.";
  return "Winding down?";
}

export const PALETTE = [
  "#5CBED6", "#4FA3E3", "#E3B34F", "#E36B9E",
  "#9B7BE0", "#4FD1C5", "#E3854F", "#7BE0A0",
  "#6E9BE0", "#D0D0C8",
];

export const TASK_EMOJIS = ["📌","📝","💪","📚","🍽️","🧹","💻","🎯","☎️","🧘","🛒","🎨","💤","✈️","💰"];
export const EVENT_EMOJIS = ["📅","🏫","🧪","📄","🤝","🎤","⚕️","✈️","🎓","⏰"];
export const DEADLINE_EMOJIS = ["🚩","⏰","📌","⚠️","🔔","🧾","🎯","📄"];
export const GOAL_EMOJIS = ["🧭","🌱","🏆","📈","🔥","💡","🧗","📖"];
export const MOODS = ["😊","😐","😞","😴","🥳","😤","😌","🤔"];

// Default representative icon shown on the Add menu and used as the fixed
// type indicator next to every item in the timeline.
export const TYPE_EMOJI = { task: "📝", event: "📅", deadline: "🎯" };

export const RECURRENCE_OPTIONS = [
  { value: "none", label: "Does not repeat" },
  { value: "daily", label: "Every day" },
  { value: "weekly", label: "Every week" },
  { value: "monthly", label: "Every month" },
];

/**
 * Whether an item with a base `date` (YYYY-MM-DD) and `recurrence` should
 * appear on the given target date. Recurrence has no end date (yet) — it
 * simply repeats forward from its original date.
 */
export function occursOn(item, targetDateKey) {
  const base = item.date || item.dueDate;
  if (!base) return false;
  if (targetDateKey < base) return false;
  const recurrence = item.recurrence || "none";
  if (recurrence === "none") return targetDateKey === base;

  const baseD = keyToDate(base);
  const targetD = keyToDate(targetDateKey);
  if (recurrence === "daily") return true;
  if (recurrence === "weekly") return baseD.getDay() === targetD.getDay();
  if (recurrence === "monthly") return baseD.getDate() === targetD.getDate();
  return targetDateKey === base;
}

export function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

// ---------------- Task time log & history ----------------
// timeLog: [{ start, end }] — the last segment with end === null is currently running.
// Logged time is always computed from stored timestamps at render time (no ticking timers).

export function loggedMs(t, now = Date.now()) {
  if (Array.isArray(t.timeLog) && t.timeLog.length) {
    return t.timeLog.reduce((sum, seg) => sum + Math.max(0, (seg.end ?? now) - seg.start), 0);
  }
  // Legacy tasks (pre time-log): single start/end timestamps.
  if (t.actualStartTime && t.actualEndTime) return t.actualEndTime - t.actualStartTime;
  return 0;
}

export function closeOpenSegment(timeLog, at = Date.now()) {
  return (timeLog || []).map((seg, i, arr) => (i === arr.length - 1 && seg.end == null ? { ...seg, end: at } : seg));
}

// Snapshot of every field a status action can change, for Undo.
export function taskSnapshot(t) {
  return {
    status: t.status || null, done: !!t.done,
    timeLog: t.timeLog ? t.timeLog.map((s) => ({ ...s })) : undefined,
    actualStartTime: t.actualStartTime || null, actualEndTime: t.actualEndTime || null,
    history: t.history ? t.history.map((h) => ({ ...h })) : undefined,
  };
}

// history: [{ at, type: "rescheduled" | "skipped", from?, to? }] — recorded from now on only.
export function withHistory(item, entry) {
  return [...(item.history || []), { at: Date.now(), ...entry }];
}

// ---------------- Colours ----------------
// "#abc", "abc", "#AABBCC" -> "#AABBCC"; anything else -> null.
export function normalizeHex(v) {
  if (typeof v !== "string") return null;
  let h = v.trim().replace(/^#/, "");
  if (/^[0-9a-fA-F]{3}$/.test(h)) h = h.split("").map((c) => c + c).join("");
  return /^[0-9a-fA-F]{6}$/.test(h) ? `#${h.toUpperCase()}` : null;
}
export function sameColor(a, b) {
  const x = normalizeHex(a);
  return !!x && x === normalizeHex(b);
}
