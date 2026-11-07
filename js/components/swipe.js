/**
 * Attaches tap / horizontal-swipe / long-press gestures to a card element,
 * using Pointer Events so it works with touch AND mouse (desktop-friendly).
 *
 * - A plain tap (no significant movement, released before longPressMs) fires onTap.
 * - Holding still past longPressMs fires onLongPress and suppresses the tap/swipe
 *   that would otherwise follow.
 * - Dragging horizontally past `threshold` fires onSwipeRight/onSwipeLeft.
 *   Set enableDrag:false for cards with no swipe action (e.g. events) — tap and
 *   long-press still work, the card just won't visually follow the pointer.
 */
export function attachCardGestures(el, {
  onTap, onSwipeRight, onSwipeLeft, onLongPress, onDrag,
  threshold = 70, max = 110, longPressMs = 550, moveTolerance = 10, enableDrag = true,
} = {}) {
  let startX = 0;
  let startY = 0;
  let currentX = 0;
  let dragging = false;
  let moved = false;
  let longPressTimer = null;
  let longPressFired = false;

  function clearLongPressTimer() {
    if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
  }

  function onPointerDown(e) {
    if (e.button !== undefined && e.button !== 0) return; // left mouse button / touch only
    dragging = true;
    moved = false;
    longPressFired = false;
    startX = e.clientX;
    startY = e.clientY;
    currentX = 0;
    el.classList.add("swipe-dragging");
    try { el.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    if (onLongPress) {
      longPressTimer = setTimeout(() => {
        if (!moved) {
          longPressFired = true;
          onLongPress();
        }
      }, longPressMs);
    }
  }

  function onPointerMove(e) {
    if (!dragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (!moved && (Math.abs(dx) > moveTolerance || Math.abs(dy) > moveTolerance)) {
      moved = true;
      clearLongPressTimer();
    }
    currentX = dx;
    if (enableDrag) {
      const clamped = Math.max(-max, Math.min(max, currentX));
      el.style.transform = `translateX(${clamped}px)`;
      if (onDrag) onDrag(clamped);
    }
  }

  // Browser took over the gesture (e.g. a vertical scroll started) or the pointer
  // was interrupted: undo the drag visuals and fire NOTHING — no tap, no swipe.
  function cancelDrag() {
    if (!dragging) return;
    dragging = false;
    clearLongPressTimer();
    el.classList.remove("swipe-dragging");
    if (enableDrag) {
      el.style.transform = "";
      if (onDrag) onDrag(0);
    }
    currentX = 0;
  }

  function endDrag() {
    if (!dragging) return;
    dragging = false;
    clearLongPressTimer();
    el.classList.remove("swipe-dragging");
    const clamped = Math.max(-max, Math.min(max, currentX));
    if (enableDrag) {
      el.style.transform = "";
      if (onDrag) onDrag(0);
    }
    if (longPressFired) { currentX = 0; return; } // already handled — don't also fire tap/swipe
    if (enableDrag && clamped > threshold) { if (onSwipeRight) onSwipeRight(); }
    else if (enableDrag && clamped < -threshold) { if (onSwipeLeft) onSwipeLeft(); }
    else if (!moved) { if (onTap) onTap(); }
    currentX = 0;
  }

  el.addEventListener("pointerdown", onPointerDown);
  el.addEventListener("pointermove", onPointerMove);
  el.addEventListener("pointerup", endDrag);
  el.addEventListener("pointercancel", cancelDrag);
  el.addEventListener("pointerleave", (e) => {
    if (dragging && e.buttons === 0) cancelDrag();
  });
}
