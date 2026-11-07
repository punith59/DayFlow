// Sheets for the Diary: create/edit a notebook, and the notebooks overview.
import { store } from "../store.js";
import { openSheet, closeSheet, wireSheetClose, notifyChanged } from "./sheet.js";
import { showUndoToast } from "./toast.js";
import { swatchesHtml, wireSwatches, fieldErrorHtml, showFieldError, clearFieldError } from "../forms.js";
import { escapeHtml, PALETTE, formatShortDate } from "../utils.js";
import { allNotebooks, notesIn, notesByDay } from "../notebooks.js";

/** Create a notebook (existing = null) or edit/delete a custom one. */
export function openNotebookSheet(existing = null, onSaved, onDeleted) {
  let color = existing ? existing.color || PALETTE[0] : (store.getPalette()[0] || PALETTE[0]);
  const count = existing ? notesIn(existing.id).length : 0;
  openSheet(`
    <button class="icon-btn sheet-close" data-action="close" aria-label="Close">✕</button>
    <h2 class="sheet-title">${existing ? "Edit notebook" : "New notebook"} ▤</h2>
    <div class="field">
      <label>Name</label>
      <input type="text" id="nb-name" maxlength="40" value="${escapeHtml(existing ? existing.name : "")}" placeholder="e.g. Ideas, Gratitude, Travel" />
    </div>
    <div class="field">
      <label>Colour</label>
      ${swatchesHtml(color, "nb-colors")}
    </div>
    ${existing ? `<p class="field-hint">Deleting this notebook also deletes its ${count} note${count === 1 ? "" : "s"}. You can undo it right after.</p>` : ""}
    ${fieldErrorHtml("nb-error")}
    <div class="btn-row">
      ${existing ? '<button class="btn btn-danger" id="nb-delete">Delete</button>' : '<button class="btn" id="nb-cancel">Cancel</button>'}
      <button class="btn btn-primary" id="nb-save">${existing ? "Save" : "Create"}</button>
    </div>
  `);
  wireSheetClose();
  wireSwatches("nb-colors", (c) => (color = c));
  const name = document.getElementById("nb-name");
  if (!existing) name.focus();
  const cancel = document.getElementById("nb-cancel");
  if (cancel) cancel.addEventListener("click", closeSheet);

  document.getElementById("nb-save").addEventListener("click", () => {
    const n = name.value.trim();
    if (!n) { showFieldError("nb-error", "Give the notebook a name."); name.focus(); return; }
    let id = existing ? existing.id : null;
    if (existing) store.updateNotebook(existing.id, { name: n, color });
    else id = store.addNotebook({ name: n, color });
    closeSheet();
    notifyChanged();
    if (onSaved) onSaved(id);
  });

  if (existing) {
    document.getElementById("nb-delete").addEventListener("click", () => {
      const removed = store.deleteNotebook(existing.id);
      closeSheet();
      if (onDeleted) onDeleted();
      notifyChanged();
      showUndoToast("Notebook deleted", () => { store.restoreNotebook(removed); notifyChanged(); }, 8000);
    });
  }
}

/** Overview of every notebook: counts, last note, edit each one, and create new ones. */
export function openNotebooksSheet(onPick) {
  const books = allNotebooks();
  openSheet(`
    <button class="icon-btn sheet-close" data-action="close" aria-label="Close">✕</button>
    <h2 class="sheet-title">Notebooks ▤</h2>
    <div class="nbm-list">
      ${books.map((b) => {
        const n = notesIn(b.id).length;
        const days = notesByDay(b.id);
        const last = days.length && days[0].date ? ` · last ${formatShortDate(days[0].date)}` : "";
        return `
        <div class="nbm-row" style="--c:${b.color}">
          <button class="nbm-main" data-open="${b.id}">
            <span class="nbm-name">${escapeHtml(b.name)}</span>
            <span class="nbm-meta">${n} note${n === 1 ? "" : "s"}${last}</span>
          </button>
          ${b.builtIn ? `<span class="nbm-fixed">Built in</span>` : `<button class="btn btn-ghost" data-edit="${b.id}">Edit</button>`}
        </div>`;
      }).join("")}
    </div>
    <button class="btn btn-primary nb-new" id="nbm-new">+ New notebook</button>
  `);
  wireSheetClose();
  const sh = document.getElementById("sheet");
  sh.querySelectorAll("[data-open]").forEach((b) => b.addEventListener("click", () => { closeSheet(); if (onPick) onPick(b.getAttribute("data-open")); }));
  sh.querySelectorAll("[data-edit]").forEach((b) => b.addEventListener("click", () => {
    const nb = store.getNotebooks().find((x) => x.id === b.getAttribute("data-edit"));
    if (nb) openNotebookSheet(nb, () => openNotebooksSheet(onPick), () => { if (onPick) onPick("all"); });
  }));
  document.getElementById("nbm-new").addEventListener("click", () => openNotebookSheet(null, (id) => { if (onPick) onPick(id); }));
}
