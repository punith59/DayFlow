// A clean in-app colour picker (replaces the browser's native one, which looks toy-like on phones):
// saturation/brightness field + hue slider + hex input, shown as a small panel above everything else.
import { normalizeHex } from "../utils.js";
import { hardenTextFields } from "../textfield.js";

let cpLayer = null;

function cpClamp(n, lo = 0, hi = 1) { return Math.min(hi, Math.max(lo, n)); }

function cpHsvToHex(h, s, v) {
  const f = (n) => {
    const k = (n + h / 60) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  const to = (x) => Math.round(x * 255).toString(16).padStart(2, "0");
  return `#${to(f(5))}${to(f(3))}${to(f(1))}`.toUpperCase();
}

function cpHexToHsv(hex) {
  const n = normalizeHex(hex) || "#5CBED6";
  const r = parseInt(n.slice(1, 3), 16) / 255;
  const g = parseInt(n.slice(3, 5), 16) / 255;
  const b = parseInt(n.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max ? d / max : 0, v: max };
}

function cpEnsure() {
  if (cpLayer) return cpLayer;
  const backdrop = document.createElement("div");
  backdrop.className = "cp-backdrop hidden";
  const panel = document.createElement("div");
  panel.className = "cp-panel hidden";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "Colour picker");
  document.body.append(backdrop, panel);
  backdrop.addEventListener("click", closeColorPicker);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !panel.classList.contains("hidden")) closeColorPicker();
  });
  cpLayer = { backdrop, panel };
  return cpLayer;
}

export function closeColorPicker() {
  if (!cpLayer) return;
  cpLayer.panel.classList.add("hidden");
  cpLayer.backdrop.classList.add("hidden");
  cpLayer.panel.innerHTML = "";
}

/**
 * opts: { color, title, confirmLabel, onConfirm(hex), onRemove() (optional), removeLabel }
 */
export function openColorPicker(opts) {
  const { backdrop, panel } = cpEnsure();
  const { title = "Pick a colour", confirmLabel = "Use colour", onConfirm, onRemove = null, removeLabel = "Remove" } = opts;
  let hex = normalizeHex(opts.color) || "#5CBED6";
  let { h, s, v } = cpHexToHsv(hex);

  panel.innerHTML = `
    <div class="cp-head"><h3 class="cp-title">${title}</h3><button class="icon-btn" data-cp="cancel" aria-label="Close">✕</button></div>
    <div class="cp-sv" data-cp-sv><div class="cp-handle"></div></div>
    <div class="cp-hue" data-cp-hue><div class="cp-handle"></div></div>
    <div class="cp-row">
      <span class="cp-preview" data-cp-preview></span>
      <input class="cp-hex" type="text" maxlength="7" spellcheck="false" autocapitalize="characters" autocomplete="off" aria-label="Hex colour" />
    </div>
    <div class="cp-btns">
      ${onRemove ? `<button class="btn btn-danger" data-cp="remove">${removeLabel}</button>` : ""}
      <button class="btn" data-cp="cancel">Cancel</button>
      <button class="btn btn-primary" data-cp="confirm">${confirmLabel}</button>
    </div>`;

  hardenTextFields(panel);
  const sv = panel.querySelector("[data-cp-sv]");
  const hue = panel.querySelector("[data-cp-hue]");
  const input = panel.querySelector(".cp-hex");
  const preview = panel.querySelector("[data-cp-preview]");

  const paint = (skipInput) => {
    sv.style.backgroundColor = `hsl(${h} 100% 50%)`;
    sv.firstElementChild.style.left = `${s * 100}%`;
    sv.firstElementChild.style.top = `${(1 - v) * 100}%`;
    hue.firstElementChild.style.left = `${(h / 360) * 100}%`;
    preview.style.background = hex;
    sv.firstElementChild.style.background = hex;
    hue.firstElementChild.style.background = `hsl(${h} 100% 50%)`;
    if (!skipInput) input.value = hex;
  };
  const fromHsv = () => { hex = cpHsvToHex(h, s, v); paint(false); };

  const drag = (el, fn) => {
    el.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      el.setPointerCapture(e.pointerId);
      fn(e);
      const move = (ev) => fn(ev);
      const up = () => {
        el.removeEventListener("pointermove", move);
        el.removeEventListener("pointerup", up);
        el.removeEventListener("pointercancel", up);
      };
      el.addEventListener("pointermove", move);
      el.addEventListener("pointerup", up);
      el.addEventListener("pointercancel", up);
    });
  };
  drag(sv, (e) => {
    const r = sv.getBoundingClientRect();
    s = cpClamp((e.clientX - r.left) / r.width);
    v = 1 - cpClamp((e.clientY - r.top) / r.height);
    fromHsv();
  });
  drag(hue, (e) => {
    const r = hue.getBoundingClientRect();
    h = cpClamp((e.clientX - r.left) / r.width) * 359.99;
    fromHsv();
  });
  input.addEventListener("input", () => {
    const n = normalizeHex(input.value);
    if (!n) return;
    hex = n;
    ({ h, s, v } = cpHexToHsv(n));
    paint(true);
  });
  input.addEventListener("blur", () => { input.value = hex; });

  panel.querySelectorAll('[data-cp="cancel"]').forEach((b) => b.addEventListener("click", closeColorPicker));
  panel.querySelector('[data-cp="confirm"]').addEventListener("click", () => {
    const out = hex;
    closeColorPicker();
    if (onConfirm) onConfirm(out);
  });
  const rm = panel.querySelector('[data-cp="remove"]');
  if (rm) rm.addEventListener("click", () => { closeColorPicker(); onRemove(); });

  paint(false);
  panel.classList.remove("hidden");
  backdrop.classList.remove("hidden");
  // Ghost-click guard for the tap that opened the picker.
  panel.style.pointerEvents = "none";
  backdrop.style.pointerEvents = "none";
  requestAnimationFrame(() => requestAnimationFrame(() => {
    panel.style.pointerEvents = "";
    backdrop.style.pointerEvents = "";
  }));
}
