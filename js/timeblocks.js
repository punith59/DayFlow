// Time blocks: the recurring shape of the user's week (classes, gym, sleep...).
// Pure read-only helpers. Nothing here creates, moves or edits tasks/events/deadlines.
import { store } from "./store.js";
import { keyToDate, addDays, dateKey, timeToMinutes, formatTime, occursOn, escapeHtml, WEEKDAY_SHORT } from "./utils.js";

// A block has one default start/end, plus optional per-weekday overrides (b.dayTimes[weekday]).
// Weekday numbers follow JS: 0 = Sunday ... 6 = Saturday.
export function blockTimesOn(b, dow) {
  const o = b.dayTimes && dow !== null && dow !== undefined ? b.dayTimes[dow] : null;
  return o ? { startTime: o.startTime, endTime: o.endTime } : { startTime: b.startTime, endTime: b.endTime };
}

export function blockHasVaryingTimes(b) {
  return !!(b.dayTimes && Object.keys(b.dayTimes).length);
}

// A block can also repeat later the same day: b.extraTimes[weekday] = [{ startTime, endTime }, ...].
// "Slot 0" is the block's normal time; slots 1, 2... are those extra times.
export function blockSlotsOn(b, dow) {
  const extra = b.extraTimes && dow !== null && dow !== undefined ? b.extraTimes[dow] : null;
  return [blockTimesOn(b, dow), ...((extra || []).map((x) => ({ startTime: x.startTime, endTime: x.endTime })))];
}

/** Times of one slot of a block on a weekday (falls back to the first slot if that slot isn't there). */
export function blockSlotTimes(b, dow, slot) {
  const s = blockSlotsOn(b, dow);
  return s[slot] || s[0];
}

/** "key" used by the form pickers: "id" for the first slot, "id@2" for the third, and so on. */
export function blockKey(id, slot) { return slot ? `${id}@${slot}` : id; }
export function parseBlockKey(key) {
  if (!key) return { id: null, slot: 0 };
  const i = String(key).indexOf("@");
  return i === -1 ? { id: key, slot: 0 } : { id: key.slice(0, i), slot: Number(key.slice(i + 1)) || 0 };
}

// Short description of a block's time(s) for list rows.
export function blockTimeSummary(b) {
  const hasExtra = !!(b.extraTimes && Object.values(b.extraTimes).some((l) => l && l.length));
  if (!blockHasVaryingTimes(b) && !hasExtra) return blockTimeLabel(b);
  const labels = [...new Set((b.days || []).map((n) => blockSlotsOn(b, n).map(blockTimeLabel).join(", ")))];
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
  return [...new Set(store.getLiveTimeBlocks().map((b) => (b.group || "").trim()).filter(Boolean))].sort();
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
  store.getTimeBlocks().forEach((raw) => {
    // The block as it was on each of the two days (edits, pauses and deletion only apply from their date onward).
    const block = blockAt(raw, day);
    const days = block ? block.days || [] : [];
    if (block && days.includes(dow)) {
      blockSlotsOn(block, dow).forEach((tm, slot) => {
        const overnight = blockIsOvernight(tm);
        segs.push({
          block, day, slot, kind: "starts", overnight, startTime: tm.startTime, endTime: tm.endTime,
          segStart: timeToMinutes(tm.startTime),
          segEnd: overnight ? 1440 : timeToMinutes(tm.endTime),
          off: exceptionFor(block, day),
        });
      });
    }
    const pb = blockAt(raw, prev);
    if (pb && (pb.days || []).includes(prevDow)) {
      blockSlotsOn(pb, prevDow).forEach((tm, slot) => {
        if (!blockIsOvernight(tm)) return;
        segs.push({
          block: pb, day, slot, kind: "continues", overnight: true, startTime: tm.startTime, endTime: tm.endTime,
          segStart: 0, segEnd: timeToMinutes(tm.endTime),
          off: exceptionFor(pb, prev),
        });
      });
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
// `slot` is which time of the block (0 = first). An item attached to a slot the block doesn't have that day sits under its last slot.
export function itemsLinkedTo(blockId, day, slot = 0) {
  const raw = getBlock(blockId);
  const b = raw ? blockAt(raw, day) : null;
  const count = b ? blockSlotsOn(b, keyToDate(day).getDay()).length : 1;
  const mine = (x) => x.blockId === blockId && Math.min(x.blockSlot || 0, count - 1) === slot;
  return [
    ...store.getTasks().filter((t) => mine(t) && occursOn(t, day)).map((item) => ({ kind: "task", item })),
    ...store.getEvents().filter((e) => mine(e) && occursOn(e, day)).map((item) => ({ kind: "event", item })),
    ...store.getDeadlines().filter((d) => mine(d) && occursOn(d, day)).map((item) => ({ kind: "deadline", item })),
  ];
}

// Blocks a new/edited item can be attached to on `day` (blocks that start that day and aren't switched off).
export function blocksForPicker(day) {
  return blockSegmentsOn(day).filter((s) => s.kind === "starts" && !s.off && s.slot === 0).map((s) => s.block);
}

// One entry per time of each block that day (a block that repeats twice gives two): { key, block, slot, label }.
export function blockPickerOptions(day) {
  return blockSegmentsOn(day).filter((s) => s.kind === "starts" && !s.off)
    .map((s) => ({ key: blockKey(s.block.id, s.slot), block: s.block, slot: s.slot, label: `${s.block.title} — ${blockTimeLabel(s)}${s.block.group ? ` (${s.block.group})` : ""}` }));
}

// ---------------------------------------------------------------------
// History: a block's edits, pauses and deletion only apply from a date onward.
//   versions: [{ to, fields }]  how the block looked up to and including `to` (oldest first)
//   since:    first day the current fields apply (set when edited)
//   gaps:     [{ from, to|null }]  paused stretches (to = last paused day; null = until resumed)
//   deletedFrom: first day the block no longer exists
// Blocks without these fields behave exactly as before.
// ---------------------------------------------------------------------
const VERSIONED = ["title", "group", "days", "startTime", "endTime", "dayTimes", "extraTimes", "place", "color"];

/** The block as it was on `day`, or null if it was paused / deleted that day. */
export function blockAt(block, day) {
  if (block.deletedFrom && day >= block.deletedFrom) return null;
  if ((block.gaps || []).some((g) => day >= g.from && (!g.to || day <= g.to))) return null;
  const v = (block.versions || []).find((x) => day <= x.to);
  return v ? { ...block, ...v.fields } : block;
}

/** Fields to save for an edit of `existing`: remembers the old version for the days before `today`. */
export function editedBlockFields(existing, payload, today) {
  const same = (k) => JSON.stringify(existing[k] ?? null) === JSON.stringify(payload[k] ?? null);
  if (VERSIONED.every(same)) return payload;
  let versions = existing.versions || [];
  if (existing.since !== today) {
    const fields = {};
    VERSIONED.forEach((k) => { fields[k] = existing[k]; });
    versions = [...versions, { to: addDays(today, -1), fields }];
  }
  return { ...payload, versions, since: today };
}

/** { state: "active" | "paused" | "pauses", from, resumesOn } as of `today`. */
export function blockPauseInfo(block, today) {
  const g = (block.gaps || []).filter((x) => !x.to || x.to >= today).sort((a, b) => a.from.localeCompare(b.from))[0];
  if (!g) return { state: "active" };
  return { state: g.from <= today ? "paused" : "pauses", from: g.from, resumesOn: g.to ? addDays(g.to, 1) : null };
}

// Tasks/events/deadlines attached to a block from `from` onward are detached and keep the block's time
// (only filled in where they had none). Repeating items are left attached: they can't be split by date.
function detachItems(blockIds, from) {
  const blocks = store.getTimeBlocks();
  const timesFor = (id, day, slot) => {
    const b = blocks.find((x) => x.id === id);
    return b ? blockSlotTimes(blockAt(b, day) || b, keyToDate(day).getDay(), slot || 0) : null;
  };
  const once = (x) => !x.recurrence || x.recurrence === "none";
  let n = 0;
  const detach = (list, dayOf, fill) => list.map((x) => {
    if (!x.blockId || !blockIds.includes(x.blockId) || !once(x) || !dayOf(x) || dayOf(x) < from) return x;
    const tm = timesFor(x.blockId, dayOf(x), x.blockSlot);
    n += 1;
    return { ...fill(x, tm), blockId: null, blockSlot: undefined };
  });
  const span = (x, tm) => ({
    ...x,
    startTime: x.startTime || (tm ? tm.startTime : x.startTime),
    endTime: x.endTime || (tm && !x.startTime && !blockIsOvernight(tm) ? tm.endTime : x.endTime),
  });
  store.saveTasks(detach(store.getTasks(), (x) => x.date, span));
  store.saveEvents(detach(store.getEvents(), (x) => x.date, span));
  store.saveDeadlines(detach(store.getDeadlines(), (x) => x.dueDate, (x, tm) => ({ ...x, dueTime: x.dueTime || (tm ? tm.startTime : x.dueTime) })));
  return n;
}

/** Pauses blocks from `from` (today or later). Returns how many items were detached. */
export function pauseBlocks(ids, from) {
  store.saveTimeBlocks(store.getTimeBlocks().map((b) => {
    if (!ids.includes(b.id)) return b;
    const gaps = (b.gaps || []).map((g) => ({ ...g }));
    const cover = gaps.find((g) => from >= g.from && (!g.to || from <= addDays(g.to, 1)));
    if (cover) cover.to = null; else gaps.push({ from, to: null });
    return { ...b, gaps };
  }));
  return detachItems(ids, from);
}

/** Resumes paused blocks from `on` (today or later); the paused days before it stay empty. */
export function resumeBlocks(ids, on) {
  store.saveTimeBlocks(store.getTimeBlocks().map((b) => {
    if (!ids.includes(b.id)) return b;
    const gaps = (b.gaps || []).map((g) => ({ ...g }));
    const g = gaps.filter((x) => !x.to || x.to >= on).sort((a, c) => a.from.localeCompare(c.from))[0];
    if (!g) return b;
    if (on <= g.from) return { ...b, gaps: gaps.filter((x) => x !== g) };
    g.to = addDays(on, -1);
    return { ...b, gaps };
  }));
}

/** "Deletes" a block from today onward; every earlier day keeps showing it exactly as it was. */
export function deleteBlockFromToday(id) {
  const today = dateKey();
  store.saveTimeBlocks(store.getTimeBlocks().map((b) => (b.id === id ? { ...b, deletedFrom: today } : b)));
  return detachItems([id], today);
}

export function blockPickerLabel(b, day, slot = 0) {
  const tm = blockSlotTimes(b, day ? keyToDate(day).getDay() : null, slot);
  return `${b.title} — ${blockTimeLabel(tm)}${b.group ? ` (${b.group})` : ""}`;
}

// Small HTML label for the overview sheets.
export function linkedBlockHtml(item) {
  const raw = getBlock(item.blockId);
  if (!raw) return "";
  const day = item.date || item.dueDate;
  const b = (day && blockAt(raw, day)) || raw;
  const tm = blockSlotTimes(b, day ? keyToDate(day).getDay() : null, item.blockSlot || 0);
  return `<span class="blk-dot" style="background:${b.color || "#5CBED6"}"></span>${escapeHtml(b.title)} <span class="overview-label">${blockTimeLabel(tm)}${b.group ? ` · ${escapeHtml(b.group)}` : ""}</span>`;
}
