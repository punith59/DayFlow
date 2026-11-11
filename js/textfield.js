// Text boxes without the browser's password / autofill helper.
// Phones show a password-manager key above the keyboard for any real text box (<input type="text">, <textarea>).
// A plain-text editable <div> is not a form field, so the helper never attaches to it. This swaps every text box
// for one, keeping the same id, classes, data-attributes, `.value`, `input` events, maxlength and placeholder,
// so the code that reads and writes them doesn't change.

const SKIP_ATTRS = new Set(["type", "value", "placeholder", "maxlength", "rows", "autocomplete", "name", "required", "readonly", "list"]);

function convert(el) {
  const multi = el.tagName === "TEXTAREA";
  const div = document.createElement("div");
  for (const a of el.attributes) if (!SKIP_ATTRS.has(a.name)) div.setAttribute(a.name, a.value);
  div.classList.add("tx", multi ? "tx-multi" : "tx-single");
  div.setAttribute("contenteditable", "plaintext-only");
  div.setAttribute("role", "textbox");
  if (multi) div.setAttribute("aria-multiline", "true");
  div.setAttribute("data-placeholder", el.getAttribute("placeholder") || "");
  const max = Number(el.getAttribute("maxlength")) || 0;
  if (multi) div.style.minHeight = `calc(${Number(el.getAttribute("rows")) || 2} * 1.45em + 20px)`;
  div.textContent = multi ? el.value : (el.getAttribute("value") || "");

  Object.defineProperty(div, "value", {
    get() { return div.textContent; },
    set(v) { div.textContent = v == null ? "" : String(v); },
  });
  div.select = () => {
    const r = document.createRange(); r.selectNodeContents(div);
    const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
  };

  const caretToEnd = () => {
    const r = document.createRange(); r.selectNodeContents(div); r.collapse(false);
    const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
  };
  div.addEventListener("input", () => {
    const t = div.textContent;
    let clean = multi ? t : t.replace(/[\r\n]+/g, " ");
    if (max && clean.length > max) clean = clean.slice(0, max);
    if (clean !== t) { div.textContent = clean; caretToEnd(); }
    if (!clean && div.firstChild) div.innerHTML = ""; // keeps the placeholder showing
  });
  if (!multi) div.addEventListener("keydown", (e) => { if (e.key === "Enter") e.preventDefault(); });
  el.replaceWith(div);
  return div;
}

/** Converts every text box inside `root` that hasn't been converted yet. Call right after setting innerHTML. */
export function hardenTextFields(root = document) {
  if (!root || !root.querySelectorAll) return;
  root.querySelectorAll('input[type="text"]:not([data-native]), textarea:not([data-native])').forEach(convert);
}

// Safety net for anything added later by code that reads its fields lazily (e.g. the Drive client-ID box).
// Code that wires a field straight after creating it calls hardenTextFields() itself first.
let started = false;
export function startTextFieldGuard() {
  if (started || typeof MutationObserver === "undefined") return;
  started = true;
  new MutationObserver((records) => {
    for (const r of records) for (const n of r.addedNodes) {
      if (n.nodeType !== 1) continue;
      if (n.matches && n.matches('input[type="text"], textarea')) { if (!n.hasAttribute("data-native")) convert(n); }
      else hardenTextFields(n);
    }
  }).observe(document.body, { childList: true, subtree: true });
}
