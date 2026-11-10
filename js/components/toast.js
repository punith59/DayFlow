let toastTimer = null;
let toastEl = null;

function ensureToastEl() {
  if (toastEl) return toastEl;
  toastEl = document.createElement("div");
  toastEl.className = "app-toast";
  document.body.appendChild(toastEl);
  return toastEl;
}

function renderToast(message, onUndo, duration) {
  const el = ensureToastEl();
  clearTimeout(toastTimer);
  el.innerHTML = `<span>${message}</span>${onUndo ? '<button type="button" class="toast-undo">Undo</button>' : ""}`;
  // force reflow so re-triggering the transition works even if a toast is already showing
  el.classList.remove("show");
  void el.offsetWidth;
  el.classList.add("show");
  if (onUndo) {
    el.querySelector(".toast-undo").addEventListener("click", () => {
      onUndo();
      dismissToast();
    });
  }
  toastTimer = setTimeout(dismissToast, duration);
}

function dismissToast() {
  if (!toastEl) return;
  toastEl.classList.remove("show");
}

export function showToast(message, duration = 2200) {
  renderToast(message, null, duration);
}

export function showUndoToast(message, onUndo, duration = 5000) {
  renderToast(message, onUndo, duration);
}
