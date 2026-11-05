// Time blocks: the recurring shape of the user's week (classes, gym, sleep...).
// Pure read-only helpers. Nothing here creates, moves or edits tasks/events/deadlines.
import { store } from "./store.js";
import { keyToDate, addDays, timeToMinutes, formatTime, occursOn, escapeHtml, WEEKDAY_SHORT } from "./utils.js";

// A block has one default start/end, plus optional per-weekday overrides (b.dayTimes[weekday]).
// Weekday numbers follow JS: 0 = Sunday ... 6 = Saturday.
export function blockTimesOn(b, dow) {
  const o = b.dayTimes && dow !== null && dow !== undefined ? b.dayTimes[dow] : null;
  return o ? { startTime: o.startTime, endTime: o.endTime } : { startTime: b.startTime, endTime: b.endTime };
}

export function blockHasVaryingTimes(b) {
  return !!(b.dayTimes && Object.keys(b.dayTimes).length);
}

// Short description of a block's time(s) for list rows.
export function blockTimeSummary(b) {
  if (!blockHasVaryingTimes(b)) return blockTimeLabel(b);
  const labels = [...new Set((b.days || []).map((n) => blockTimeLabel(blockTimesOn(b, n))))];
  return labels.length === 1 ? labels[0] : "times vary by day";
}

export function blockIsOvernight(b) {
  return timeToMinutes(b.endTime) <= timeToMinutes(b.startTime);
}

export function blockDurationMins(b) {
  const s = timeToMinutes(b.startTime);
  const e = timeToMinutes(b.endTime);
  return e > s ? e - s : 1440 - s + e;
}

export function blockDaysLabel(days) {
  const d = [...new Set(days || [])].sort((a, b) => a - b);
  if (d.length === 7) return "Every day";
  if (d.length === 0) return "No days";
  const key = d.join(",");
  if (key === "1,2,3,4,5") return "Mon–Fri";
  if (key === "1,2,3,4,5,6") return "Mon–Sat";
  if (key === "0,6") return "Weekends";
  return d.map((n) => WEEKDAY_SHORT[n]).join(", ");
}

export function blockTimeLabel(b) {
  return `${formatTime(b.startTime)}–${formatTime(b.endTime)}`;
}

export function getBlock(id) {
  return id ? store.getTimeBlocks().find((b) => b.id === id) || null : null;
}

export function blockGroups() {
  return [...new Set(store.getTimeBlocks().map((b) => (b.group || "").trim()).filter(Boolean))].sort();
}

// The day-off entry (if any) that switches this block off on the day it STARTS.
export function exceptionFor(block, startDay) {
  return store.getBlockExceptions().find((x) => {
    if (startDay < x.from || startDay > (x.to || x.from)) return false;
    if (x.scope === "all") return true;
    if (x.scope === "group") return !!block.group && x.target === block.group;
    return x.scope === "block" && x.target === block.id;
  }) || null;
}

/**
 * Every piece of a block that lands on `day`, sorted by time. Overnight blocks
 * (e.g. Sleep 11 PM–7 AM) appear as a "starts" piece on their first day and a
 * "continues" piece on the next morning. `off` is the day-off entry, if any.
 */
export function blockSegmentsOn(day) {
  const dow = keyToDate(day).getDay();
  const prev = addDays(day, -1);
  const prevDow = keyToDate(prev).getDay();
  const segs = [];
  store.getTimeBlocks().forEach((block) => {
    const days = block.days || [];
    if (days.includes(dow)) {
      const tm = blockTimesOn(block, dow);
      const overnight = blockIsOvernight(tm);
      segs.push({
        block, day, kind: "starts", overnight, startTime: tm.startTime, endTime: tm.endTime,
        segStart: timeToMinutes(tm.startTime),
        segEnd: overnight ? 1440 : timeToMinutes(tm.endTime),
        off: exceptionFor(block, day),
      });
    }
    if (days.includes(prevDow)) {
      const tm = blockTimesOn(block, prevDow);
      if (blockIsOvernight(tm)) {
        segs.push({
          block, day, kind: "continues", overnight: true, startTime: tm.startTime, endTime: tm.endTime,
          segStart: 0, segEnd: timeToMinutes(tm.endTime),
          off: exceptionFor(block, prev),
        });
      }
    }
  });
  return segs.sort((a, b) => a.segStart - b.segStart || a.segEnd - b.segEnd);
}

export function segmentTimeLabel(seg) {
  if (!seg.overnight) return blockTimeLabel(seg);
  return seg.kind === "starts"
    ? `${formatTime(seg.startTime)} → ${formatTime(seg.endTime)} next day`
    : `until ${formatTime(seg.endTime)}`;
}

// Tasks / events / deadlines the user has attached to this block on `day`.
export function itemsLinkedTo(blockId, day) {
  return [
    ...store.getTasks().filter((t) => t.blockId === blockId && occursOn(t, day)).map((item) => ({ kind: "task", item })),
    ...store.getEvents().filter((e) => e.blockId === blockId && occursOn(e, day)).map((item) => ({ kind: "event", item })),
    ...store.getDeadlines().filter((d) => d.blockId === blockId && occursOn(d, day)).map((item) => ({ kind: "deadline", item })),
  ];
}

// Blocks a new/edited item can be attached to on `day` (blocks that start that day and aren't switched off).
export function blocksForPicker(day) {
  return blockSegmentsOn(day).filter((s) => s.kind === "starts" && !s.off).map((s) => s.block);
}

export function blockPickerLabel(b, day) {
  const tm = blockTimesOn(b, day ? keyToDate(day).getDay() : null);
  return `${b.title} — ${blockTimeLabel(tm)}${b.group ? ` (${b.group})` : ""}`;
}

// Small HTML label for the overview sheets.
export function linkedBlockHtml(item) {
  const b = getBlock(item.blockId);
  if (!b) return "";
  const day = item.date || item.dueDate;
  const tm = blockTimesOn(b, day ? keyToDate(day).getDay() : null);
  return `<span class="blk-dot" style="background:${b.color || "#34C77B"}"></span>${escapeHtml(b.title)} <span class="overview-label">${blockTimeLabel(tm)}${b.group ? ` · ${escapeHtml(b.group)}` : ""}</span>`;
}
