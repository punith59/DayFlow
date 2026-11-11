// More → Colour palette: saved colours (used in every form) and the history of one-off colours.
import { store } from "../store.js";
import { openColorPicker } from "../components/colorPicker.js";
import { showToast, showUndoToast } from "../components/toast.js";
import { notifyChanged } from "../components/sheet.js";
import { normalizeHex } from "../utils.js";

function plSavedHtml(palette) {
  return palette.length
    ? `<div class="pl-grid">${palette.map((c) => `
        <button class="pl-item" data-pl-saved="${c}" aria-label="Edit ${c}">
          <span class="pl-dot" style="background:${c}"></span><span class="pl-hex">${c}</span>
        </button>`).join("")}</div>`
    : `<p class="tb-empty">No saved colours. Forms will still let you pick any colour with the + button.</p>`;
}

function plHistoryHtml(history) {
  return history.length
    ? `<div class="pl-grid">${history.map((c) => `
        <button class="pl-item" data-pl-hist="${c}" aria-label="Recent colour ${c}">
          <span class="pl-dot" style="background:${c}"></span><span class="pl-hex">${c}</span>
        </button>`).join("")}</div>`
    : `<p class="tb-empty">Colours you pick with the + button in a form (and don't save) will show up here.</p>`;
}

// Adds a colour to the palette via the picker. Used by the "+ Add colour" button and the + FAB.
export function openAddPaletteColor(onDone) {
  openColorPicker({
    color: "#4FA3E3",
    title: "Add to palette",
    confirmLabel: "Save to palette",
    onConfirm: (hex) => {
      if (store.addPaletteColor(hex)) {
        store.removeColorHistory(hex);
        notifyChanged();
      } else {
        showToast("That colour is already in your palette");
      }
      if (onDone) onDone();
    },
  });
}

export function renderPalette(container, onBack) {
  const palette = store.getPalette();
  const history = store.getColorHistory();

  container.innerHTML = `
    <button class="tb-back" data-pl="back">‹ More</button>
    <h1 class="page-date">Colour palette</h1>
    <p class="page-summary">Saved colours appear in every form. A colour you pick on the spot isn't saved here — it goes to History.</p>
    <div class="tb-actions"><button class="btn btn-primary" data-pl="add">+ Add colour</button></div>
    <div class="cal-box-section">
      <div class="cal-sec-title">Saved colours <span class="cal-sec-count">${palette.length}</span></div>
      ${plSavedHtml(palette)}
    </div>
    <div class="cal-box-section">
      <div class="cal-sec-title">History <span class="cal-sec-count">${history.length}</span></div>
      ${plHistoryHtml(history)}
      ${history.length ? `<button class="btn pl-clear" data-pl="clear">Clear history</button>` : ""}
    </div>
  `;

  const refresh = () => renderPalette(container, onBack);
  container.querySelector('[data-pl="back"]').addEventListener("click", onBack);
  container.querySelector('[data-pl="add"]').addEventListener("click", () => openAddPaletteColor(refresh));

  container.querySelectorAll("[data-pl-saved]").forEach((el) => el.addEventListener("click", () => {
    const old = el.getAttribute("data-pl-saved");
    openColorPicker({
      color: old,
      title: "Edit colour",
      confirmLabel: "Save",
      removeLabel: "Remove",
      onConfirm: (hex) => {
        const list = store.getPalette();
        const i = list.indexOf(old);
        // Replace in place; if the new colour already exists elsewhere, just drop the old one.
        store.savePalette(list.includes(hex) && hex !== old ? list.filter((c) => c !== old) : list.map((c, j) => (j === i ? hex : c)));
        notifyChanged();
        refresh();
      },
      onRemove: () => {
        const before = store.getPalette();
        store.removePaletteColor(old);
        notifyChanged();
        refresh();
        showUndoToast("Colour removed from palette", () => { store.savePalette(before); notifyChanged(); refresh(); });
      },
    });
  }));

  container.querySelectorAll("[data-pl-hist]").forEach((el) => el.addEventListener("click", () => {
    const c = el.getAttribute("data-pl-hist");
    openColorPicker({
      color: c,
      title: "Recent colour",
      confirmLabel: "Save to palette",
      removeLabel: "Delete",
      onConfirm: (hex) => {
        store.removeColorHistory(c);
        if (!store.addPaletteColor(hex)) showToast("That colour is already in your palette");
        notifyChanged();
        refresh();
      },
      onRemove: () => {
        const before = store.getColorHistory();
        store.removeColorHistory(c);
        refresh();
        showUndoToast("Removed from history", () => { store.saveColorHistory(before); refresh(); });
      },
    });
  }));

  const clear = container.querySelector('[data-pl="clear"]');
  if (clear) clear.addEventListener("click", () => {
    const before = store.getColorHistory();
    store.saveColorHistory([]);
    refresh();
    showUndoToast("History cleared", () => { store.saveColorHistory(before); refresh(); });
  });
}
