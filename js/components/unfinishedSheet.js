// The list behind Today's top-right "Unfinished" button: each task can be rescheduled (the normal Reschedule window) or skipped.
import { store } from "../store.js";
import { openSheet, closeSheet, wireSheetClose, notifyChanged } from "./sheet.js";
import { showUndoToast } from "./toast.js";
import { openRescheduleSheet } from "./actionMenu.js";
import { unfinishedTasks } from "../unfinished.js";
import { escapeHtml, formatShortDate, formatTime, withHistory, closeOpenSegment } from "../utils.js";

export function openUnfinishedSheet(onChange) {
  openSheet(`
    <button class="icon-btn sheet-close" data-action="close" aria-label="Close">✕</button>
    <h2 class="sheet-title">Unfinished ↺</h2>
    <p class="field-hint">Reschedule these or skip them. Nothing changes unless you tap.</p>
    <div class="co-list" id="co-list"></div>
  `);
  wireSheetClose();
  const list = document.getElementById("co-list");

  function paint() {
    const tasks = unfinishedTasks();
    if (!tasks.length) { closeSheet(); if (onChange) onChange(); return; }
    list.innerHTML = tasks.map((t) => `
      <div class="co-row">
        <div class="co-top">
          <div class="co-main"><span class="co-title">${escapeHtml(t.title)}</span>
            <span class="co-sub">${formatShortDate(t.date)}${t.startTime ? ` · ${formatTime(t.startTime)}` : ""}</span></div>
          <button class="btn btn-ghost" data-co="resched" data-id="${t.id}">Reschedule</button>
          <button class="btn btn-ghost" data-co="skip" data-id="${t.id}">Skip</button>
        </div>
      </div>`).join("");
    list.querySelectorAll("[data-co]").forEach((b) => b.addEventListener("click", () => {
      const t = store.getTasks().find((x) => x.id === b.getAttribute("data-id"));
      if (!t) return;
      if (b.getAttribute("data-co") === "resched") {
        closeSheet();
        openRescheduleSheet("task", t, onChange);
        return;
      }
      const before = { status: t.status, timeLog: t.timeLog, history: t.history };
      const patch = { status: "skipped", history: withHistory(t, { type: "skipped", date: t.date }) };
      if (t.timeLog) patch.timeLog = closeOpenSegment(t.timeLog);
      store.updateTask(t.id, patch);
      notifyChanged();
      showUndoToast("Task skipped", () => { store.updateTask(t.id, { ...before, status: before.status || null }); notifyChanged(); if (onChange) onChange(); }, 6000);
      paint();
    }));
  }
  paint();
}
