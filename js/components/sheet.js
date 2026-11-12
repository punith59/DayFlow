import { hardenTextFields } from "../textfield.js";
import { sheetOpened, clearDraft } from "../session.js";

const backdrop = document.getElementById("sheet-backdrop");
export const sheet = document.getElementById("sheet");

backdrop.addEventListener("click", closeSheet);

export function openSheet(html) {
  sheet.innerHTML = html;
  hardenTextFields(sheet);
  sheetOpened();
  sheet.classList.remove("hidden");
  backdrop.classList.remove("hidden");
  sheet.scrollTop = 0;
  // Ghost-click guard: the tap that opened this sheet can still fire a native
  // click at the same screen spot. Ignore pointer input for two frames.
  sheet.style.pointerEvents = "none";
  backdrop.style.pointerEvents = "none";
  requestAnimationFrame(() => requestAnimationFrame(() => {
    sheet.style.pointerEvents = "";
    backdrop.style.pointerEvents = "";
  }));
}

export function closeSheet() {
  clearDraft();
  sheet.classList.add("hidden");
  backdrop.classList.add("hidden");
  sheet.innerHTML = "";
}

export function wireSheetClose() {
  const btn = sheet.querySelector('[data-action="close"]');
  if (btn) btn.addEventListener("click", closeSheet);
}

export function notifyChanged() {
  document.dispatchEvent(new CustomEvent("dayflow:refresh"));
}
