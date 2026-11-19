import { store } from "../store.js";
import { openSheet, closeSheet, wireSheetClose, sheet, notifyChanged } from "./sheet.js";
import { openPopover, closePopover, popover } from "./popover.js";
import { showUndoToast } from "./toast.js";
import { blockPickerOptions, getBlock, blockSlotTimes, blockKey, parseBlockKey, blockIsOvernight } from "../timeblocks.js";
import { keyToDate, escapeHtml, timeToMinutes, dateKey, TYPE_EMOJI, deadlineStatus, isInPast, withHistory, closeOpenSegment, taskSnapshot } from "../utils.js";
import { relinkPatch } from "../unfinished.js";
import { openTaskComposer, openEventComposer, openDeadlineComposer, fieldErrorHtml, showFieldError, clearFieldError, blockOptionsHtml } from "../forms.js";

const LABEL = { task: "Task", event: "Event", deadline: "Deadline" };

export function openItemActionMenu(kind, item, onChange, anchorEl) {
  const status = kind === "task" ? (item.status || (item.done ? "completed" : "pending")) : null;
  const canReschedule = kind === "deadline" ? true : status !== "completed";
  const dlStatus = kind === "deadline" ? deadlineStatus(item) : null;
  const canSkip = (kind === "task" && status !== "completed" && status !== "skipped") || (kind === "deadline" && dlStatus !== "met" && dlStatus !== "skipped");

  openPopover(anchorEl, `
    <h2 class="sheet-title">${TYPE_EMOJI[kind]} ${escapeHtml(item.title)}</h2>
    <div class="sheet-options">
      ${canReschedule ? '<button class="sheet-option" data-act="reschedule"><span class="opt-icon">🕐</span> Reschedule</button>' : ""}
      <button class="sheet-option" data-act="edit"><span class="opt-icon">✎</span> Edit</button>
      ${canSkip ? '<button class="sheet-option" data-act="skip"><span class="opt-icon">⤫</span> Skip</button>' : ""}
      <button class="sheet-option" data-act="delete"><span class="opt-icon">🗑</span> Delete</button>
    </div>
  `);

  if (canReschedule) {
    popover.querySelector('[data-act="reschedule"]').addEventListener("click", () => {
      closePopover();
      openRescheduleSheet(kind, item, onChange);
    });
  }
  popover.querySelector('[data-act="edit"]').addEventListener("click", () => {
    closePopover();
    if (kind === "task") openTaskComposer(item, null, null, onChange);
    else if (kind === "event") openEventComposer(item, null, onChange);
    else openDeadlineComposer(item, null, onChange);
  });
  if (canSkip) {
    popover.querySelector('[data-act="skip"]').addEventListener("click", () => {
      if (kind === "deadline") {
        const prev = { skippedAt: item.skippedAt || null, history: item.history };
        store.updateDeadline(item.id, { skippedAt: Date.now(), history: withHistory(item, { type: "skipped", date: item.dueDate }) });
        closePopover();
        notifyChanged();
        if (onChange) onChange();
        showUndoToast("Deadline skipped", () => { store.updateDeadline(item.id, prev); notifyChanged(); if (onChange) onChange(); });
        return;
      }
      const snap = taskSnapshot(item);
      const skipPatch = { status: "skipped", history: withHistory(item, { type: "skipped", date: item.date }) };
      if (item.timeLog) skipPatch.timeLog = closeOpenSegment(item.timeLog);
      store.updateTask(item.id, skipPatch);
      closePopover();
      notifyChanged();
      if (onChange) onChange();
      showUndoToast("Task skipped", () => {
        store.updateTask(item.id, snap);
        notifyChanged();
        if (onChange) onChange();
      });
    });
  }
  popover.querySelector('[data-act="delete"]').addEventListener("click", () => {
    closePopover();
    deleteWithUndo(kind, item, onChange);
  });
}

function deleteWithUndo(kind, item, onChange) {
  if (kind === "task") store.deleteTask(item.id);
  else if (kind === "event") store.deleteEvent(item.id);
  else store.deleteDeadline(item.id);
  notifyChanged();
  if (onChange) onChange();
  showUndoToast(`${LABEL[kind]} deleted`, () => {
    if (kind === "task") store.addTask(item);
    else if (kind === "event") store.addEvent(item);
    else store.addDeadline(item);
    notifyChanged();
    if (onChange) onChange();
  });
}

// ---------------- Reschedule sheet ----------------

export function openRescheduleSheet(kind, item, onChange) {
  const isDeadline = kind === "deadline";
  const dateVal = isDeadline ? item.dueDate : item.date;
  const startVal = isDeadline ? (item.dueTime || "") : (item.startTime || "");
  const endVal = !isDeadline ? (item.endTime || "") : "";

  openSheet(`
    <button class="icon-btn sheet-close" data-action="close" aria-label="Close">✕</button>
    <h2 class="sheet-title">Reschedule ${TYPE_EMOJI[kind]} ${escapeHtml(item.title)}</h2>

    <div class="field">
      <label>${isDeadline ? "Due date" : "Date"}</label>
      <input type="date" id="rs-date" value="${dateVal}" />
    </div>
    ${store.getLiveTimeBlocks().length ? `
      <div class="field">
        <label>Time block (optional)</label>
        <select id="rs-block">${blockOptionsHtml(dateVal, item.blockId ? blockKey(item.blockId, item.blockSlot) : "")}</select>
        <p class="field-hint field-hint-after" id="rs-block-hint"></p>
      </div>` : ""}
    ${isDeadline ? `
      <div class="field">
        <label>Due time (optional)</label>
        <input type="time" id="rs-start" value="${startVal}" />
      </div>
    ` : `
      <div class="field-row">
        <div class="field"><label>Start time</label><input type="time" id="rs-start" value="${startVal}" /></div>
        <div class="field"><label>End time</label><input type="time" id="rs-end" value="${endVal}" /></div>
      </div>
    `}
    ${fieldErrorHtml("rs-time-error")}

    <div class="btn-row">
      <button class="btn" id="rs-cancel">Cancel</button>
      <button class="btn btn-primary" id="rs-save">Save</button>
    </div>
  `);

  wireSheetClose();
  document.getElementById("rs-cancel").addEventListener("click", closeSheet);

  // Time block: choosing one makes the card take that block's time (replacing the time that was there). A deadline's due time follows the block's start.
  const blockSel = document.getElementById("rs-block");
  if (blockSel) {
    const dateEl = document.getElementById("rs-date");
    const startEl = document.getElementById("rs-start");
    const endEl = document.getElementById("rs-end");
    const hint = document.getElementById("rs-block-hint");
    const adopt = () => {
      const k = parseBlockKey(blockSel.value);
      const day = dateEl.value;
      const onThatDay = k.id && day && blockPickerOptions(day).some((o) => o.key === blockSel.value);
      if (isDeadline) { startEl.disabled = !!onThatDay; }
      if (!onThatDay) { hint.textContent = k.id && day ? "This block isn't on that date, so its time isn't used." : ""; return; }
      const tm = blockSlotTimes(getBlock(k.id), keyToDate(day).getDay(), k.slot);
      startEl.value = tm.startTime;
      if (isDeadline) {
        hint.textContent = "Due time follows the block's start. Unlink it to choose your own time.";
      } else if (blockIsOvernight(tm)) {
        endEl.value = "";
        hint.textContent = "Overnight block: only the start time is filled in.";
      } else {
        endEl.value = tm.endTime;
        hint.textContent = "Time taken from the block — change it if you like.";
      }
    };
    blockSel.addEventListener("change", adopt);
    dateEl.addEventListener("change", () => {
      blockSel.innerHTML = blockOptionsHtml(dateEl.value, blockSel.value);
      adopt();
    });
    // Opening an already-linked deadline: keep its time, just lock the field.
    if (isDeadline && blockSel.value && dateEl.value && blockPickerOptions(dateEl.value).some((o) => o.key === blockSel.value)) {
      startEl.disabled = true;
      hint.textContent = "Due time follows the block's start. Unlink it to choose your own time.";
    }
  }

  document.getElementById("rs-save").addEventListener("click", () => {
    const newDate = document.getElementById("rs-date").value || dateKey();
    const newStart = document.getElementById("rs-start").value || null;
    const newEnd = !isDeadline ? (document.getElementById("rs-end").value || null) : null;

    if (!isDeadline) {
      clearFieldError("rs-time-error");
      if (newStart && newEnd && timeToMinutes(newEnd) <= timeToMinutes(newStart)) {
        showFieldError("rs-time-error", "End time must be after start time.");
        return;
      }
    } else {
      clearFieldError("rs-time-error");
    }

    if (isInPast(newDate, newStart)) {
      showFieldError("rs-time-error", "Can't reschedule to a day or time that's already passed.");
      return;
    }


    let prev, patch, updater, notes = [];
    if (kind === "deadline") {
      prev = { dueDate: item.dueDate, dueTime: item.dueTime };
      patch = { dueDate: newDate, dueTime: newStart };
      updater = store.updateDeadline;
    } else if (kind === "event") {
      prev = { date: item.date, startTime: item.startTime, endTime: item.endTime };
      patch = { date: newDate, startTime: newStart, endTime: newEnd };
      updater = store.updateEvent;
    } else {
      // The linked event/deadline and the task's own deadline stay if they still come at or after the task's new time; otherwise they're removed.
      const rl = relinkPatch(item, newDate, newStart);
      // No start time = an "anytime" task: it keeps its length (if it had one) and has no end time.
      const hadLength = item.startTime && item.endTime && !item.durationMins ? timeToMinutes(item.endTime) - timeToMinutes(item.startTime) : null;
      notes = rl.notes;
      prev = { date: item.date, startTime: item.startTime, endTime: item.endTime, durationMins: item.durationMins, linkedType: item.linkedType || null, linkedId: item.linkedId || null, deadline: item.deadline || null, deadlineTime: item.deadlineTime || null };
      patch = { date: newDate, startTime: newStart, endTime: newStart ? newEnd : null, ...rl.patch };
      if (!newStart && hadLength) patch.durationMins = hadLength;
      updater = store.updateTask;
    }

    // Time block link (only when the picker is shown); the block's time is already in the fields above.
    if (blockSel) {
      const k = parseBlockKey(blockSel.value);
      prev = { ...prev, blockId: item.blockId || null, blockSlot: item.blockSlot };
      patch = { ...patch, blockId: k.id, blockSlot: k.slot || undefined };
    }

    const prevHistory = item.history;
    const before = { date: isDeadline ? item.dueDate : item.date, time: startVal || null };
    patch.history = withHistory(item, { type: "rescheduled", from: before, to: { date: newDate, time: newStart } });
    updater(item.id, patch);
    closeSheet();
    notifyChanged();
    if (onChange) onChange();
    showUndoToast(`${LABEL[kind]} rescheduled${notes.length ? " · " + notes.join(", ") : ""}`, () => {
      updater(item.id, { ...prev, history: prevHistory });
      notifyChanged();
      if (onChange) onChange();
    });
  });
}
