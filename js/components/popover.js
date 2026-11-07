/**
 * Small floating panel anchored next to a tapped card (used for the action menu
 * and the long-press overview). Forms (reschedule/edit) stay as full sheets.
 */
const popBackdrop = document.createElement("div");
popBackdrop.className = "popover-popBackdrop hidden";
const popEl = document.createElement("div");
popEl.className = "popover hidden";
popEl.setAttribute("role", "dialog");
document.body.append(popBackdrop, popEl);

popBackdrop.addEventListener("click", closePopover);
// Scrolling anywhere outside the panel dismisses it (wheel, touch-drag, or page scroll).
popBackdrop.addEventListener("wheel", closePopover, { passive: true });
popBackdrop.addEventListener("touchmove", closePopover, { passive: true });
window.addEventListener("scroll", (e) => {
  if (!popEl.classList.contains("hidden") && !popEl.contains(e.target)) closePopover();
}, true);
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closePopover(); });

export const popover = popEl;

export function openPopover(anchorEl, html) {
  popEl.innerHTML = `<button class="icon-btn sheet-close" data-popover-close aria-label="Close">✕</button>${html}`;
  popEl.querySelector("[data-popover-close]").addEventListener("click", closePopover);
  popEl.classList.remove("hidden");
  popBackdrop.classList.remove("hidden");
  popEl.scrollTop = 0;

  // Ghost-click guard: ignore the native click that follows the opening tap.
  popEl.style.pointerEvents = "none";
  popBackdrop.style.pointerEvents = "none";
  requestAnimationFrame(() => requestAnimationFrame(() => {
    popEl.style.pointerEvents = "";
    popBackdrop.style.pointerEvents = "";
  }));

  const margin = 12;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const w = Math.min(320, vw - margin * 2);
  popEl.style.width = `${w}px`;
  popEl.style.maxHeight = "";

  const r = anchorEl ? anchorEl.getBoundingClientRect() : { left: vw / 2, width: 0, top: vh / 2, bottom: vh / 2 };
  const left = Math.max(margin, Math.min(r.left + r.width / 2 - w / 2, vw - w - margin));
  const h = popEl.offsetHeight;
  const below = vh - r.bottom - margin;
  const above = r.top - margin;

  let top, maxH, origin;
  if (h <= below) { top = r.bottom + 6; maxH = below; origin = "top"; }
  else if (h <= above) { top = r.top - h - 6; maxH = above; origin = "bottom"; }
  else if (below >= above) { top = r.bottom + 6; maxH = below - 6; origin = "top"; }
  else { maxH = above - 6; top = margin; origin = "bottom"; }

  popEl.style.maxHeight = `${Math.max(140, maxH)}px`;
  if (origin === "bottom" && h > above) top = margin;
  popEl.style.left = `${left}px`;
  popEl.style.top = `${Math.max(margin, top)}px`;
  popEl.style.transformOrigin = `${Math.round(r.left + r.width / 2 - left)}px ${origin}`;
  popEl.classList.remove("popover-in");
  void popEl.offsetWidth;
  popEl.classList.add("popover-in");
}

export function closePopover() {
  popEl.classList.add("hidden");
  popBackdrop.classList.add("hidden");
  popEl.innerHTML = "";
}
