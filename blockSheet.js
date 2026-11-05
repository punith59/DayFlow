// Sheet shown when a time block is tapped on a specific day (from the timetable or a day overview).
import { store } from "../store.js";
import { openSheet, closeSheet, wireSheetClose, notifyChanged } from "./sheet.js";
import { showUndoToast } from "./toast.js";
import { blockSegmentsOn, segmentTimeLabel, itemsLinkedTo, blockDaysLabel } from "../timeblocks.js";
import { openTaskComposer, openEventComposer, openDeadlineComposer } from "../forms.js";
import { escapeHtml, addDays, keyToDate, dateKey, formatTime, formatShortDate, WEEKDAY_NAMES, MONTH_NAMES, TYPE_EMOJI } from "../utils.js";

function bsDayLabel(day) {
  const d = keyToDate(day);
  const name = WEEKDAY_NAMES[d.getDay()];
  return `${name[0].toUpperCase()}${name.slice(1)}, ${MONTH_NAMES[d.getMonth()]} ${d.getDate()}`;
}

function bsWhen(ex) {
  return ex.to && ex.to !== ex.from ? `${formatShortDate(ex.from)} – ${formatShortDate(ex.to)}` : formatShortDate(ex.from);
}

/**
 * seg: a piece from blockSegmentsOn(day). opts.onBack (optional): where the back arrow returns to.
 */
export function openBlockDaySheet(seg, opts = {}) {
  const b = seg.block;
  const day = seg.day;
  const startDay = seg.kind === "continues" ? addDays(day, -1) : day;
  const off = seg.off;
  const linked = seg.kind === "starts" ? itemsLinkedTo(b.id, day) : [];
  const isPast = day < dateKey();
  const canAdd = !off && seg.kind === "starts" && !isPast;
  const ownSkip = off && off.scope === "block" && off.target === b.id && off.from === startDay && (off.to || off.from) === startDay;

  const linkedHtml = linked.length
    ? `<div class="bs-list">${linked.map(({ kind, item }) => {
        const t = kind === "deadline" ? item.dueTime : item.startTime;
        return `<div class="bs-item"><span class="bs-item-time">${t ? formatTime(t) : "Anytime"}</span><span>${TYPE_EMOJI[kind]} ${escapeHtml(item.title)}</span></div>`;
      }).join("")}</div>`
    : `<p class="bs-empty">${off ? "" : "Nothing attached to this period yet."}</p>`;

  openSheet(`
    <button class="icon-btn sheet-close" data-action="close" aria-label="Close">✕</button>
    ${opts.onBack ? `<button class="bs-back" data-bs="back">‹ Back</button>` : ""}
    <div class="bs-head">
      <span class="bs-swatch" style="background:${b.color || "#34C77B"}"></span>
      <div>
        <h2 class="sheet-title bs-title">${escapeHtml(b.title)}</h2>
        <div class="bs-sub">${escapeHtml(bsDayLabel(day))}</div>
      </div>
    </div>
    <div class="cal-box-section bs-info">
      <div class="bs-row"><span>Time</span><b>${segmentTimeLabel(seg)}</b></div>
      ${b.group ? `<div class="bs-row"><span>Group</span><b>${escapeHtml(b.group)}</b></div>` : ""}
      ${b.place ? `<div class="bs-row"><span>Place</span><b>${escapeHtml(b.place)}</b></div>` : ""}
      <div class="bs-row"><span>Repeats</span><b>${blockDaysLabel(b.days)}</b></div>
    </div>
    ${off ? `
      <div class="cal-box-section bs-off">
        <div class="cal-sec-title">Day off</div>
        <div class="bs-off-text">Not happening${off.reason ? ` — ${escapeHtml(off.reason)}` : ""} <span class="bs-muted">(${bsWhen(off)})</span></div>
        ${ownSkip
          ? `<button class="btn" data-bs="restore">Restore this day</button>`
          : `<p class="bs-muted">Set as a longer or group day off — manage it under More → Time blocks.</p>`}
      </div>` : ""}
    ${seg.kind === "starts" ? `
      <div class="cal-box-section">
        <div class="cal-sec-title">Attached to this period ${linked.length ? `<span class="cal-sec-count">${linked.length}</span>` : ""}</div>
        ${linkedHtml}
        ${canAdd ? `
          <div class="bs-add-row">
            <button class="btn" data-bs="event">+ Event</button>
            <button class="btn" data-bs="task">+ Task</button>
            <button class="btn" data-bs="deadline">+ Deadline</button>
          </div>` : ""}
      </div>` : ""}
    ${!off && seg.kind === "starts" && !isPast ? `<button class="btn bs-skip" data-bs="skip">No ${escapeHtml(b.title)} on this day</button>` : ""}
  `);
  wireSheetClose();

  const q = (k) => document.querySelector(`#sheet [data-bs="${k}"]`);
  const reopen = () => {
    const fresh = blockSegmentsOn(day).find((s) => s.block.id === b.id && s.kind === seg.kind);
    if (fresh) openBlockDaySheet(fresh, opts); else closeSheet();
  };
  if (q("back")) q("back").addEventListener("click", opts.onBack);
  if (q("skip")) q("skip").addEventListener("click", () => {
    if (isPast) return;
    const id = `skip-${b.id}-${startDay}`;
    store.addBlockException({ id, scope: "block", target: b.id, from: startDay, to: startDay, reason: "" });
    notifyChanged();
    reopen();
    showUndoToast(`${b.title} skipped on this day`, () => { store.deleteBlockException(id); notifyChanged(); reopen(); });
  });
  if (q("restore")) q("restore").addEventListener("click", () => {
    const prev = off;
    store.deleteBlockException(off.id);
    notifyChanged();
    reopen();
    showUndoToast(`${b.title} restored`, () => { store.addBlockException(prev); notifyChanged(); reopen(); });
  });
  if (q("event")) q("event").addEventListener("click", () => openEventComposer(null, day, null, b.id));
  if (q("task")) q("task").addEventListener("click", () => openTaskComposer(null, day, null, null, b.id));
  if (q("deadline")) q("deadline").addEventListener("click", () => openDeadlineComposer(null, day, null, b.id));
}
