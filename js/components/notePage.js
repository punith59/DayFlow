// The note page: a full-screen editor (header + rich body) in the style of a phone notes app.
// Back arrow, undo/redo, a ⋮ menu and Done on top; a small tool row above the keyboard; an "Aa" format panel
// with paragraph styles, bold/italic/…, lists, checklist, indent, alignment, text size and colours.
// Saving is automatic as you type, so nothing is lost if you leave.
import { store } from "../store.js";
import { escapeHtml, dateKey, keyToDate } from "../utils.js";
import { allNotebooks, noteNotebookId, DEFAULT_NOTEBOOK_ID } from "../notebooks.js";
import { sanitizeHtml, htmlFromPlain, plainFromHtml } from "../richtext.js";
import { openSheet, closeSheet, wireSheetClose, notifyChanged } from "./sheet.js";
import { showUndoToast, showToast } from "./toast.js";

const TEXT_COLOURS = ["#EDEDE7", "#E2645A", "#E3854F", "#E6C24A", "#34C77B", "#4FB8D6", "#7C8CF0", "#C77DDB"];
const HILITE = "#5b5320";
const SIZES = [10, 12, 14, 16, 18, 20, 24, 28, 32, 40, 48]; // text sizes A− / A+ step through
const MAX_INDENT = 5; // indent levels (28px each: at most about a third of the page)

let openPage = null; // { close() } while a page is showing

const ic = {
  back: `<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  undo: `<svg viewBox="0 0 24 24"><path d="M9 7L5 11l4 4M5 11h9a5 5 0 010 10h-3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" transform="translate(0 -3)"/></svg>`,
  redo: `<svg viewBox="0 0 24 24"><path d="M15 7l4 4-4 4M19 11h-9a5 5 0 000 10h3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" transform="translate(0 -3)"/></svg>`,
  more: `<svg viewBox="0 0 24 24"><circle cx="12" cy="5" r="1.8" fill="currentColor"/><circle cx="12" cy="12" r="1.8" fill="currentColor"/><circle cx="12" cy="19" r="1.8" fill="currentColor"/></svg>`,
  check: `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M8 12.5l3 3 5-6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  ul: `<svg viewBox="0 0 24 24"><g fill="currentColor"><circle cx="5" cy="7" r="1.6"/><circle cx="5" cy="12" r="1.6"/><circle cx="5" cy="17" r="1.6"/></g><path d="M10 7h10M10 12h10M10 17h10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
  ol: `<svg viewBox="0 0 24 24"><text x="2" y="9" font-size="7" fill="currentColor">1</text><text x="2" y="14.5" font-size="7" fill="currentColor">2</text><text x="2" y="20" font-size="7" fill="currentColor">3</text><path d="M10 7h10M10 12h10M10 17h10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
  indent: `<svg viewBox="0 0 24 24"><path d="M4 6h16M12 10h8M12 14h8M4 18h16M4 9l3.5 3L4 15z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  outdent: `<svg viewBox="0 0 24 24"><path d="M4 6h16M12 10h8M12 14h8M4 18h16M7.5 9L4 12l3.5 3z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  left: `<svg viewBox="0 0 24 24"><path d="M4 6h16M4 10h10M4 14h16M4 18h10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
  center: `<svg viewBox="0 0 24 24"><path d="M4 6h16M7 10h10M4 14h16M7 18h10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
  right: `<svg viewBox="0 0 24 24"><path d="M4 6h16M10 10h10M4 14h16M10 18h10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
};

function fmtStamp(note, createdAt) {
  const day = note && note.date ? keyToDate(note.date) : new Date();
  const t = new Date(createdAt || Date.now());
  const d = day.toLocaleDateString(undefined, { day: "2-digit", month: "2-digit", year: "numeric" });
  const hm = t.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false });
  return `${d}, ${hm}`;
}

/**
 * Open the note page. existing = null starts a new note in presetNotebookId.
 * A new note is only saved once something is written; onClose runs when the page is closed.
 */
export function openNotePage(existing = null, presetNotebookId = DEFAULT_NOTEBOOK_ID, onClose) {
  if (openPage) return;
  const nbs = allNotebooks();
  let noteId = existing ? existing.id : null;
  let notebookId = existing ? noteNotebookId(existing) : (nbs.some((b) => b.id === presetNotebookId) ? presetNotebookId : DEFAULT_NOTEBOOK_ID);
  let day = existing && existing.date ? existing.date : dateKey();
  let createdAt = existing ? existing.createdAt : Date.now();
  const startHtml = existing ? sanitizeHtml(existing.html != null ? existing.html : htmlFromPlain(existing.text)) : "";
  const bookName = () => (allNotebooks().find((b) => b.id === notebookId) || { name: "Default notebook" }).name;

  const root = document.createElement("div");
  root.className = "np";
  root.innerHTML = `
    <div class="np-top">
      <button type="button" class="np-btn" data-np="back" aria-label="Back">${ic.back}</button>
      <span class="np-spacer"></span>
      <button type="button" class="np-btn" data-np="undo" aria-label="Undo">${ic.undo}</button>
      <button type="button" class="np-btn" data-np="redo" aria-label="Redo">${ic.redo}</button>
      <span class="np-spacer"></span>
      <button type="button" class="np-btn" data-np="menu" aria-label="More">${ic.more}</button>
      <button type="button" class="np-done" data-np="done">Done</button>
    </div>
    <div class="np-scroll" id="np-scroll">
      <div class="np-meta"><span id="np-stamp"></span> <i>|</i> <button type="button" class="np-book" data-np="book" id="np-book"></button></div>
      <div class="np-title" id="np-title" contenteditable="plaintext-only" role="textbox" aria-label="Title" data-placeholder="Title" enterkeyhint="next" autocapitalize="sentences" spellcheck="true"></div>
      <div class="np-body is-empty" id="np-body" contenteditable="true" role="textbox" aria-multiline="true" aria-label="Note" spellcheck="true"></div>
    </div>
    <div class="np-panel hidden" id="np-panel">
      <div class="np-panel-head"><span>Format</span><button type="button" class="np-btn np-x" data-np="panel-close" aria-label="Close format">✕</button></div>
      <div class="np-styles" id="np-styles">
        <button type="button" data-style="h1" class="st-title">Title</button>
        <button type="button" data-style="h2" class="st-sub">Subtitle</button>
        <button type="button" data-style="h3" class="st-head">Heading</button>
        <button type="button" data-style="div" class="st-body">Body</button>
        <button type="button" data-style="blockquote" class="st-note">Note</button>
      </div>
      <div class="np-grid">
        <button type="button" data-cmd="bold" aria-label="Bold"><b>B</b></button>
        <button type="button" data-cmd="italic" aria-label="Italic"><i>I</i></button>
        <button type="button" data-cmd="strikeThrough" aria-label="Strikethrough"><s>S</s></button>
        <button type="button" data-cmd="underline" aria-label="Underline"><u>U</u></button>
        <button type="button" data-act="hilite" aria-label="Highlight"><span class="np-hl">A</span></button>
        <button type="button" data-act="checklist" aria-label="Checklist">${ic.check}</button>
      </div>
      <div class="np-grid">
        <button type="button" data-cmd="insertUnorderedList" aria-label="Bullet list">${ic.ul}</button>
        <button type="button" data-cmd="insertOrderedList" aria-label="Numbered list">${ic.ol}</button>
        <button type="button" data-cmd="indent" aria-label="Indent">${ic.indent}</button>
        <button type="button" data-cmd="outdent" aria-label="Outdent">${ic.outdent}</button>
        <button type="button" data-cmd="justifyLeft" aria-label="Align left">${ic.left}</button>
        <button type="button" data-cmd="justifyCenter" aria-label="Align centre">${ic.center}</button>
        <button type="button" data-cmd="justifyRight" aria-label="Align right">${ic.right}</button>
      </div>
      <div class="np-size">
        <button type="button" data-act="size-down" aria-label="Smaller text">A−</button>
        <span id="np-size-val">16</span>
        <button type="button" data-act="size-up" aria-label="Larger text">A+</button>
        <div class="np-colours" id="np-colours">${TEXT_COLOURS.map((c) => `<button type="button" data-colour="${c}" style="background:${c}" aria-label="Text colour ${c}"></button>`).join("")}</div>
      </div>
    </div>
    <div class="np-slash hidden" id="np-slash" role="listbox" aria-label="Insert"></div>
    <div class="np-tools" id="np-tools">
      <button type="button" data-act="checklist" aria-label="Checklist">${ic.check}</button>
      <button type="button" data-cmd="insertUnorderedList" aria-label="Bullet list">${ic.ul}</button>
      <button type="button" data-cmd="insertOrderedList" aria-label="Numbered list">${ic.ol}</button>
      <button type="button" data-act="format" aria-label="Format" class="np-aa">Aa</button>
    </div>
  `;
  document.getElementById("app").appendChild(root);
  document.body.classList.add("np-open");

  const $ = (id) => root.querySelector(id);
  const titleEl = $("#np-title");
  // The title is a plain-text editable line rather than an <input>, so the browser's password/autofill helper never attaches to it.
  Object.defineProperty(titleEl, "value", {
    get() { return titleEl.textContent; },
    set(v) { titleEl.textContent = v; },
  });
  titleEl.addEventListener("input", () => {
    const t = titleEl.textContent;
    if (!t && titleEl.firstChild) titleEl.innerHTML = "";
    const clean = t.replace(/[\r\n]+/g, " ").slice(0, 100);
    if (clean !== t) {
      titleEl.textContent = clean;
      const r = document.createRange(); r.selectNodeContents(titleEl); r.collapse(false);
      const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r);
    }
  });
  const bodyEl = $("#np-body");
  const panel = $("#np-panel");
  bodyEl.innerHTML = startHtml;
  titleEl.value = existing ? (existing.title || "") : "";
  $("#np-stamp").textContent = fmtStamp(existing, createdAt);
  $("#np-book").textContent = bookName();

  const syncEmpty = () => bodyEl.classList.toggle("is-empty", !bodyEl.textContent.trim() && !bodyEl.querySelector("li"));
  syncEmpty();

  // ---- keep the page above the on-screen keyboard ----
  const vv = window.visualViewport;
  // Only touches the layout when the visible area really changed, so tapping a misspelled word
  // (which makes the browser's suggestion bar flicker the viewport) can't resize the page and drop the keyboard.
  let lastH = -1, lastTop = -1, fitFrame = 0;
  const fit = () => {
    if (!vv || fitFrame) return;
    fitFrame = requestAnimationFrame(() => {
      fitFrame = 0;
      const h = Math.round(vv.height), top = Math.round(vv.offsetTop);
      if (h !== lastH) { root.style.height = `${h}px`; lastH = h; }
      if (top !== lastTop) { root.style.transform = `translateY(${top}px)`; lastTop = top; }
    });
  };
  if (vv) { vv.addEventListener("resize", fit); vv.addEventListener("scroll", fit); fit(); }

  // ---- saving ----
  let saveTimer = null;
  const currentHtml = () => sanitizeHtml(bodyEl.innerHTML);
  function save(finalising) {
    clearTimeout(saveTimer);
    let title = titleEl.value.trim();
    const html = currentHtml();
    const text = plainFromHtml(html);
    if (!title && !text) {
      // nothing written: a brand-new note isn't kept; an existing one stays as it was
      return !!noteId;
    }
    // Every note keeps a header: if you wrote a body but no title, the first line of it becomes the header.
    if (!title && finalising) {
      title = text.split("\n")[0].replace(/^[•☐☑]\s*|^\d+\.\s*/, "").slice(0, 60) || "Untitled";
      titleEl.value = title;
    }
    const fields = { title, text, html, notebookId, date: day };
    if (noteId) store.updateNote(noteId, fields);
    else {
      noteId = store.addNote({ ...fields, createdAt });
    }
    return true;
  }
  const queueSave = () => { clearTimeout(saveTimer); saveTimer = setTimeout(() => save(false), 450); };
  titleEl.addEventListener("input", queueSave);
  bodyEl.addEventListener("input", () => { syncEmpty(); queueSave(); checkSlash(); });
  titleEl.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); bodyEl.focus(); } });

  // ---- editing commands (buttons never steal focus, so the selection stays put) ----
  const keep = (e) => e.preventDefault();
  root.querySelectorAll(".np-tools button, .np-panel button, .np-top button").forEach((b) => b.addEventListener("mousedown", keep));
  const INLINE = new Set(["bold", "italic", "strikeThrough", "underline", "foreColor"]);
  const cmd = (name, val) => {
    bodyEl.focus();
    if (INLINE.has(name)) { ensureBlock(); withLine(() => document.execCommand(name, false, val)); }
    else document.execCommand(name, false, val);
    syncEmpty(); queueSave(); refreshState();
  };
  const anchorEl = () => { const s = getSelection(); const n = s && s.anchorNode; return n ? (n.nodeType === 1 ? n : n.parentElement) : null; };
  const inBody = () => { const a = anchorEl(); return !!a && bodyEl.contains(a); };

  function toggleChecklist() {
    bodyEl.focus();
    const a = anchorEl();
    const ul = a && bodyEl.contains(a) ? a.closest("ul") : null;
    if (ul && ul.classList.contains("cl")) { document.execCommand("insertUnorderedList"); }
    else if (ul) { ul.classList.add("cl"); }
    else {
      document.execCommand("insertUnorderedList");
      const a2 = anchorEl(); const u2 = a2 && a2.closest("ul"); if (u2) u2.classList.add("cl");
    }
    syncEmpty(); queueSave(); refreshState();
  }
  function toggleBullets() {
    bodyEl.focus();
    const a = anchorEl(); const ul = a && bodyEl.contains(a) ? a.closest("ul") : null;
    if (ul && ul.classList.contains("cl")) { ul.classList.remove("cl"); ul.querySelectorAll("li").forEach((li) => li.removeAttribute("data-done")); }
    else document.execCommand("insertUnorderedList");
    syncEmpty(); queueSave(); refreshState();
  }
  const txtOf = (b) => b.textContent.replace(/​/g, "");
  function ensureBlock() { const sel = getSelection(); if (sel && sel.rangeCount && !blockOf(sel.anchorNode)) document.execCommand("formatBlock", false, "div"); }

  // A formatting change with just a caret applies to the whole current line, and the caret stays put so what
  // you type next carries on in that format. With text selected it applies to the selection only.
  function withLine(fn) {
    const sel = getSelection();
    if (!sel || !sel.rangeCount || !sel.isCollapsed) { fn(); return; }
    const b = blockOf(sel.anchorNode);
    if (!b || !txtOf(b)) { fn(); return; } // an empty line: applies to what you type next
    const rg = sel.getRangeAt(0);
    const off = offsetOf(rg.startContainer, rg.startOffset);
    const all = document.createRange(); all.selectNodeContents(b);
    sel.removeAllRanges(); sel.addRange(all);
    fn();
    const p = posOf(off, false);
    const back = document.createRange(); back.setStart(p[0], p[1]); back.collapse(true);
    sel.removeAllRanges(); sel.addRange(back);
  }

  // ---- text size: steps through real pixel sizes (the style sizes are Title 24 / Subtitle 20 / Heading 18 / Note 14 / Body 16) ----
  function currentPx() { const a = anchorEl(); return a ? Math.round(parseFloat(getComputedStyle(a).fontSize)) || 16 : 16; }
  function stepSize(dir) {
    bodyEl.focus();
    if (!inBody()) return;
    const cur = currentPx();
    const next = dir > 0 ? SIZES.find((x) => x > cur) : [...SIZES].reverse().find((x) => x < cur);
    if (!next) return;
    ensureBlock();
    const sel = getSelection();
    const b = blockOf(sel.anchorNode);
    if (sel.isCollapsed && b && !txtOf(b)) {
      // empty line: start a run of the new size at the caret
      const span = document.createElement("span"); span.style.fontSize = `${next}px`;
      const zw = document.createTextNode("​"); span.appendChild(zw);
      sel.getRangeAt(0).insertNode(span);
      const r = document.createRange(); r.setStart(zw, 1); r.collapse(true); sel.removeAllRanges(); sel.addRange(r);
    } else {
      withLine(() => {
        const rg = getSelection().getRangeAt(0);
        const a0 = offsetOf(rg.startContainer, rg.startOffset), z0 = offsetOf(rg.endContainer, rg.endOffset);
        document.execCommand("fontSize", false, "7");
        bodyEl.querySelectorAll('font[size="7"]').forEach((f) => {
          const sp = document.createElement("span"); sp.style.fontSize = `${next}px`;
          while (f.firstChild) sp.appendChild(f.firstChild);
          sp.querySelectorAll("[style*='font-size']").forEach((x) => x.style.removeProperty("font-size"));
          f.replaceWith(sp);
        });
        const pa = posOf(a0, true), pz = posOf(z0, false);
        const r = document.createRange(); r.setStart(pa[0], pa[1]); r.setEnd(pz[0], pz[1]);
        const sl = getSelection(); sl.removeAllRanges(); sl.addRange(r);
      });
    }
    syncEmpty(); queueSave(); refreshState();
  }

  // ---- highlight: only on selected text (it never carries on into what you type next) ----
  const isHl = (el) => { const bg = el.style && el.style.backgroundColor; return !!bg && bg !== "transparent" && !/^rgba\(0,\s*0,\s*0,\s*0\)$/.test(bg); };
  function hiliteActive() {
    const sel = getSelection();
    if (!inBody() || !sel || !sel.rangeCount || sel.isCollapsed) return false;
    const range = sel.getRangeAt(0);
    const walker = document.createTreeWalker(bodyEl, NodeFilter.SHOW_TEXT);
    let any = false;
    for (let t = walker.nextNode(); t; t = walker.nextNode()) {
      if (!range.intersectsNode(t) || !t.nodeValue.replace(/​/g, "").trim()) continue;
      any = true;
      let el = t.parentElement, hit = false;
      while (el && el !== bodyEl) { if (el.tagName === "SPAN" && isHl(el)) { hit = true; break; } el = el.parentElement; }
      if (!hit) return false;
    }
    return any;
  }
  function toggleHilite() {
    bodyEl.focus();
    const sel = getSelection();
    if (!sel || !sel.rangeCount || sel.isCollapsed) { showToast("Select some text to highlight it"); return; }
    document.execCommand("hiliteColor", false, hiliteActive() ? "transparent" : HILITE);
    queueSave(); refreshState();
  }
  // Typing at the end of a highlighted run moves the new text out of it, so highlight doesn't spread.
  function escapeHilite(len) {
    const sel = getSelection();
    if (!len || !sel || !sel.rangeCount || !sel.isCollapsed) return;
    const n = sel.anchorNode;
    if (!n || n.nodeType !== 3 || !bodyEl.contains(n) || sel.anchorOffset !== n.nodeValue.length || n.nodeValue.length < len) return;
    let hl = null, el = n.parentElement;
    while (el && el !== bodyEl) { if (el.tagName === "SPAN" && isHl(el)) { hl = el; break; } el = el.parentElement; }
    if (!hl || offsetOf(hl, hl.childNodes.length) !== offsetOf(n, n.nodeValue.length)) return;
    const typed = n.nodeValue.slice(-len);
    n.nodeValue = n.nodeValue.slice(0, -len);
    const tn = document.createTextNode(typed);
    hl.after(tn);
    if (!txtOf(hl)) hl.remove();
    const r = document.createRange(); r.setStart(tn, typed.length); r.collapse(true);
    sel.removeAllRanges(); sel.addRange(r);
  }

  // ---- paragraph styles (Title / Subtitle / Heading / Body / Note) ----
  // A style is a label on the line itself (data-s), so a line keeps its place in a list when its style changes:
  // a numbered item that becomes a heading is still item 3, and goes back to being a plain item the same way.
  const BLOCK_SEL = "div,p,li,h1,h2,h3,blockquote";
  const LEGACY = { H1: "h1", H2: "h2", H3: "h3", BLOCKQUOTE: "blockquote" };
  const KEY_OF = { h1: "h1", h2: "h2", h3: "h3", note: "blockquote" };
  function blockOf(node) {
    let n = node && (node.nodeType === 1 ? node : node.parentElement);
    while (n && n !== bodyEl) { if (n.matches && n.matches(BLOCK_SEL)) return n; n = n.parentElement; }
    return null;
  }
  function leafBlocks() {
    const sel = getSelection();
    if (!sel || !sel.rangeCount) return [];
    if (sel.isCollapsed) { const b = blockOf(sel.anchorNode); return b ? [b] : []; }
    const range = sel.getRangeAt(0);
    return [...bodyEl.querySelectorAll(BLOCK_SEL)].filter((b) => range.intersectsNode(b) && !b.querySelector(BLOCK_SEL));
  }
  function currentStyleKey() {
    const b = blockOf(getSelection().anchorNode);
    if (!b) return "div";
    return KEY_OF[b.getAttribute("data-s")] || LEGACY[b.tagName] || "div";
  }
  const offsetOf = (node, off) => { const r = document.createRange(); r.selectNodeContents(bodyEl); r.setEnd(node, off); return r.toString().length; };
  function posOf(off, preferLater) {
    const w = document.createTreeWalker(bodyEl, NodeFilter.SHOW_TEXT);
    let n, acc = 0, last = null;
    while ((n = w.nextNode())) {
      last = n; const len = n.nodeValue.length;
      if (preferLater ? off < acc + len : off <= acc + len) return [n, off - acc];
      acc += len;
    }
    return last ? [last, last.nodeValue.length] : [bodyEl, 0];
  }
  function applyStyle(style) {
    bodyEl.focus();
    if (!inBody()) return;
    const sel0 = getSelection();
    if (!blockOf(sel0.anchorNode)) document.execCommand("formatBlock", false, "div"); // bare text -> a line
    const sel = getSelection();
    const range = sel.getRangeAt(0);
    const startOff = offsetOf(range.startContainer, range.startOffset), endOff = offsetOf(range.endContainer, range.endOffset);
    let moved = false, emptyLine = null;
    leafBlocks().forEach((b) => {
      let el = b;
      if (LEGACY[b.tagName]) { // notes from earlier versions: turn the old heading tag into a plain line
        el = document.createElement("div");
        if (b.getAttribute("style")) el.setAttribute("style", b.getAttribute("style"));
        while (b.firstChild) el.appendChild(b.firstChild);
        b.replaceWith(el); moved = true;
      }
      // sizes set with A− / A+ would fight the style, so they are cleared when a style is chosen
      el.querySelectorAll("font[size]").forEach((f) => {
        f.removeAttribute("size");
        if (!f.attributes.length) { while (f.firstChild) f.before(f.firstChild); f.remove(); moved = true; }
      });
      el.querySelectorAll("[style*='font-size']").forEach((x) => x.style.removeProperty("font-size"));
      if (style === "body") el.removeAttribute("data-s"); else el.setAttribute("data-s", style);
      if (sel.isCollapsed && !el.textContent.replace(/​/g, "")) emptyLine = el;
    });
    if (moved) {
      const r = document.createRange();
      if (emptyLine) { r.setStart(emptyLine, 0); r.collapse(true); }
      else { const a = posOf(startOff, true), z = posOf(endOff, false); r.setStart(a[0], a[1]); r.setEnd(z[0], z[1]); }
      sel.removeAllRanges(); sel.addRange(r);
    }
    syncEmpty(); queueSave(); refreshState();
  }
  // Pressing Enter at the end of a Title/Subtitle/Heading line starts a normal line, like a notes app.
  // After Enter: Title / Subtitle / Heading go back to Body on the new line. A Note line carries on for one Enter
  // and goes back to Body on a second Enter (the empty Note line becomes a Body line).
  function afterEnter() {
    const sel = getSelection();
    if (!sel || !sel.rangeCount) return;
    const b = blockOf(sel.anchorNode);
    if (!b || b.tagName === "LI" || txtOf(b)) return;
    const st = b.getAttribute("data-s") || "";
    if (/^h[123]$/.test(st)) b.removeAttribute("data-s");
    else if (st === "note") {
      const prev = b.previousElementSibling;
      if (prev && prev.getAttribute("data-s") === "note" && !txtOf(prev)) { prev.remove(); b.removeAttribute("data-s"); }
    }
    refreshState();
  }
  bodyEl.addEventListener("keydown", (e) => { if (e.key === "Enter" && !slash) setTimeout(afterEnter, 0); });

  // Typing "1. " (or "2)" …) at the start of a line starts a numbered list.
  function autoList() {
    const sel = getSelection();
    if (!sel || !sel.rangeCount || !sel.isCollapsed) return;
    const n = sel.anchorNode;
    if (!n || n.nodeType !== 3 || !bodyEl.contains(n)) return;
    const b = blockOf(n);
    if (b && b.tagName === "LI") return;
    let t = n.nodeValue.slice(0, sel.anchorOffset), startNode = n;
    if (b) { const rr = document.createRange(); rr.setStart(b, 0); rr.setEnd(n, sel.anchorOffset); t = rr.toString(); startNode = b; }
    else if (n.previousSibling && !/^(BR|DIV|P|UL|OL|HR)$/.test(n.previousSibling.nodeName)) return;
    const m = /^(\d{1,3})[.)][  ]$/.exec(t);
    if (!m) return;
    if ((b ? txtOf(b).length : n.nodeValue.length) !== t.length) return; // something else is already on the line
    const rr = document.createRange(); rr.setStart(startNode, 0); rr.setEnd(n, sel.anchorOffset);
    sel.removeAllRanges(); sel.addRange(rr);
    document.execCommand("delete");
    document.execCommand("insertOrderedList");
    const a = anchorEl(); const ol = a && a.closest ? a.closest("ol") : null;
    if (ol && +m[1] !== 1 && ol.children.length === 1) ol.setAttribute("start", m[1]); // (a list that joined the one above just keeps counting)
    syncEmpty(); queueSave(); refreshState();
  }
  bodyEl.addEventListener("input", (e) => {
    if (e.inputType === "insertParagraph") afterEnter();
    if (e.inputType === "insertText" && e.data) escapeHilite(e.data.length);
    if (e.inputType === "insertText" || e.inputType === "insertCompositionText") autoList();
  });
  bodyEl.addEventListener("compositionend", (e) => { escapeHilite((e.data || "").length); autoList(); });

  // ---- indent: limited. Plain lines step in by 28px up to 5 times and back to where they started (never left of it);
  // list items nest at most 5 deep and a top-level list item stays in its list. ----
  function indentBy(dir) {
    bodyEl.focus();
    if (!inBody()) return;
    ensureBlock();
    const blocks = leafBlocks();
    if (!blocks.length) return;
    const lis = blocks.filter((x) => x.tagName === "LI");
    if (lis.length) {
      const depth = (li) => { let d = 0, n = li.parentElement; while (n && n !== bodyEl) { if (n.tagName === "UL" || n.tagName === "OL") d++; n = n.parentElement; } return d; };
      if (dir > 0) { if (lis.some((li) => depth(li) > MAX_INDENT)) return; document.execCommand("indent"); }
      else { if (lis.some((li) => depth(li) <= 1)) return; document.execCommand("outdent"); }
    } else {
      blocks.forEach((x) => {
        const lv = Math.max(0, Math.min(MAX_INDENT, (+x.getAttribute("data-i") || 0) + dir));
        if (lv) x.setAttribute("data-i", String(lv)); else x.removeAttribute("data-i");
      });
    }
    syncEmpty(); queueSave(); refreshState();
  }

  // ---- divider: a line, then the caret on a fresh line below it ----
  function insertDivider() {
    bodyEl.focus();
    if (!inBody()) return;
    ensureBlock();
    const sel = getSelection();
    let top = blockOf(sel.anchorNode);
    if (!top) return;
    while (top.parentElement && top.parentElement !== bodyEl) top = top.parentElement;
    const hr = document.createElement("hr");
    const line = document.createElement("div"); line.appendChild(document.createElement("br"));
    if (/^(DIV|P)$/.test(top.tagName) && !txtOf(top) && !top.querySelector("hr,ul,ol")) top.replaceWith(hr); else top.after(hr);
    hr.after(line);
    const r = document.createRange(); r.setStart(line, 0); r.collapse(true);
    sel.removeAllRanges(); sel.addRange(r);
    syncEmpty(); queueSave(); refreshState();
  }

  // ---- "/" menu: type / at the start of a line (or after a space) to pick a style, list, indent, alignment ----
  const slashEl = root.querySelector("#np-slash");
  const SI = (glyph) => `<span class="sl-g">${glyph}</span>`;
  const SLASH = [
    { sec: 0, k: "Title", kw: "h1", g: SI("H<sub>1</sub>"), run: () => applyStyle("h1") },
    { sec: 0, k: "Subtitle", kw: "h2", g: SI("H<sub>2</sub>"), run: () => applyStyle("h2") },
    { sec: 0, k: "Heading", kw: "h3", g: SI("H<sub>3</sub>"), run: () => applyStyle("h3") },
    { sec: 0, k: "Body", kw: "text paragraph normal", g: SI("Aa"), run: () => applyStyle("body") },
    { sec: 0, k: "Note", kw: "quote small", g: SI("“"), run: () => applyStyle("note") },
    { sec: 1, k: "Bulleted list", kw: "bullets ul dots", g: SI(ic.ul), run: () => toggleBullets() },
    { sec: 1, k: "Numbered list", kw: "numbers ol 1 2 3", g: SI(ic.ol), run: () => cmd("insertOrderedList") },
    { sec: 1, k: "To-dos", kw: "todo todos checklist checkbox tasks", g: SI(ic.check), run: () => toggleChecklist() },
    { sec: 2, k: "Increase indent", kw: "indent in tab", g: SI(ic.indent), run: () => indentBy(1) },
    { sec: 2, k: "Decrease indent", kw: "outdent out", g: SI(ic.outdent), run: () => indentBy(-1) },
    { sec: 3, k: "Align text left", kw: "left", g: SI(ic.left), run: () => cmd("justifyLeft") },
    { sec: 3, k: "Align text centre", kw: "center middle", g: SI(ic.center), run: () => cmd("justifyCenter") },
    { sec: 3, k: "Align text right", kw: "right", g: SI(ic.right), run: () => cmd("justifyRight") },
    { sec: 4, k: "Divider", kw: "line rule separator", g: SI(`<svg viewBox="0 0 24 24"><path d="M4 9h16M4 15h16" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`), run: () => insertDivider() },
  ];
  let slash = null; // { node, at, items, active } while the menu is showing
  function closeSlash() { if (slash) { slash = null; slashEl.classList.add("hidden"); slashEl.innerHTML = ""; } }
  function renderSlash() {
    slashEl.innerHTML = slash.items.map((it, i) => `${i && slash.items[i - 1].sec !== it.sec ? '<div class="sl-sep"></div>' : ""}<button type="button" class="sl-item ${i === slash.active ? "on" : ""}" data-sl="${i}">${it.g}<span>${it.k}</span></button>`).join("");
    slashEl.classList.remove("hidden");
    // sit just under the line being typed, or above it when there's no room (keyboard)
    const sel = getSelection();
    let rect = null;
    if (sel && sel.rangeCount) { const rr = sel.getRangeAt(0).getClientRects(); rect = rr[0] || null; }
    if (!rect) { const bl = blockOf(sel && sel.anchorNode); rect = (bl || bodyEl).getBoundingClientRect(); }
    const rb = root.getBoundingClientRect();
    const tools = root.querySelector("#np-tools").getBoundingClientRect();
    const floor = (tools.height ? tools.top : rb.bottom) - 6;
    const roomBelow = floor - (rect.bottom + 6), roomAbove = rect.top - rb.top - 60;
    const below = roomBelow >= 190 || roomBelow >= roomAbove;
    const maxH = Math.max(140, Math.min(320, below ? roomBelow : roomAbove));
    slashEl.style.maxHeight = `${maxH}px`;
    slashEl.style.left = "16px";
    if (below) { slashEl.style.top = `${rect.bottom + 6 - rb.top}px`; slashEl.style.bottom = "auto"; }
    else { slashEl.style.bottom = `${rb.bottom - rect.top + 6}px`; slashEl.style.top = "auto"; }
    const act = slashEl.querySelector(".on"); if (act && act.scrollIntoView) act.scrollIntoView({ block: "nearest" });
  }
  function checkSlash() {
    const sel = getSelection();
    if (!sel || !sel.rangeCount || !sel.isCollapsed || !inBody() || sel.anchorNode.nodeType !== 3) return closeSlash();
    const node = sel.anchorNode;
    const before = node.nodeValue.slice(0, sel.anchorOffset);
    const m = /(^|\s)\/([^\s/]*)$/.exec(before);
    if (!m) return closeSlash();
    const q = m[2].toLowerCase();
    const items = SLASH.filter((it) => !q || it.k.toLowerCase().replace(/[^a-z0-9 ]/g, "").includes(q) || it.kw.includes(q));
    if (!items.length) return closeSlash();
    slash = { node, at: before.length - q.length - 1, items, active: 0 };
    renderSlash();
  }
  function pickSlash(i, fresh) {
    if (!slash) return;
    if (fresh) { const keep = slash.active; checkSlash(); if (!slash) return; slash.active = Math.min(keep, slash.items.length - 1); i = slash.active; }
    const it = slash.items[i];
    const sel = getSelection();
    const n = sel && sel.anchorNode;
    if (!n || n.nodeType !== 3) { closeSlash(); return; }
    const before = n.nodeValue.slice(0, sel.anchorOffset);
    const m = /(^|\s)\/([^\s/]*)$/.exec(before);
    if (!m) { closeSlash(); return; }
    const r = document.createRange();
    r.setStart(n, before.length - m[2].length - 1); r.setEnd(n, sel.anchorOffset);
    sel.removeAllRanges(); sel.addRange(r);
    document.execCommand("delete"); // removes the "/…" that was typed
    closeSlash();
    bodyEl.focus();
    it.run();
  }
  slashEl.addEventListener("mousedown", (e) => e.preventDefault());
  slashEl.addEventListener("click", (e) => { e.stopPropagation(); const b = e.target.closest("[data-sl]"); if (b) pickSlash(+b.getAttribute("data-sl")); });
  bodyEl.addEventListener("keydown", (e) => {
    if (!slash) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); slash.active = (slash.active + (e.key === "ArrowDown" ? 1 : slash.items.length - 1)) % slash.items.length; renderSlash(); }
    else if (e.key === "Enter" || e.keyCode === 13) { e.preventDefault(); pickSlash(slash.active, true); }
    else if (e.key === "Escape") { e.preventDefault(); closeSlash(); }
  });
  // phone keyboards often send Enter as an input event rather than a key press: while the menu is open it picks the item
  bodyEl.addEventListener("beforeinput", (e) => {
    if (slash && (e.inputType === "insertParagraph" || e.inputType === "insertLineBreak")) { e.preventDefault(); pickSlash(slash.active, true); }
  });
  bodyEl.addEventListener("blur", () => setTimeout(() => { if (document.activeElement !== bodyEl) closeSlash(); }, 150));
  bodyEl.addEventListener("scroll", closeSlash);
  document.addEventListener("selectionchange", () => {
    if (!slash) return;
    const sel = getSelection();
    if (!sel || !sel.rangeCount || sel.anchorNode !== slash.node || !sel.isCollapsed || sel.anchorOffset <= slash.at) closeSlash();
  });

  root.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b || !root.contains(b)) return;
    const c = b.getAttribute("data-cmd");
    const act = b.getAttribute("data-act");
    const st = b.getAttribute("data-style");
    const colour = b.getAttribute("data-colour");
    const np = b.getAttribute("data-np");
    if (c === "indent") return indentBy(1);
    if (c === "outdent") return indentBy(-1);
    if (c === "insertUnorderedList") return toggleBullets();
    if (c) return cmd(c);
    if (st) return applyStyle({ h1: "h1", h2: "h2", h3: "h3", div: "body", blockquote: "note" }[st] || "body");
    if (colour) return cmd("foreColor", colour);
    if (act === "checklist") return toggleChecklist();
    if (act === "size-up") return stepSize(1);
    if (act === "size-down") return stepSize(-1);
    if (act === "hilite") return toggleHilite();
    if (act === "format") return openPanel(true);
    if (np === "panel-close") return openPanel(false);
    if (np === "undo") { (document.activeElement === titleEl ? titleEl : bodyEl).focus(); document.execCommand("undo"); syncEmpty(); queueSave(); return; }
    if (np === "redo") { (document.activeElement === titleEl ? titleEl : bodyEl).focus(); document.execCommand("redo"); syncEmpty(); queueSave(); return; }
    if (np === "back" || np === "done") return finish();
    if (np === "menu") return openMenu();
    if (np === "book") return pickNotebook();
  });

  // Checklist boxes: tapping the box at the left edge of a line ticks it.
  bodyEl.addEventListener("click", (e) => {
    const li = e.target.closest && e.target.closest("ul.cl > li");
    if (!li || !bodyEl.contains(li)) return;
    if (e.clientX - li.getBoundingClientRect().left > 30) return;
    e.preventDefault();
    if (li.getAttribute("data-done") === "1") li.removeAttribute("data-done"); else li.setAttribute("data-done", "1");
    queueSave();
  });
  // A new checklist line starts unticked.
  bodyEl.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    setTimeout(() => {
      const a = anchorEl(); const li = a && a.closest ? a.closest("ul.cl > li") : null;
      if (li && li.getAttribute("data-done") === "1" && !li.textContent.trim()) li.removeAttribute("data-done");
    }, 0);
  });

  // ---- format panel ----
  function openPanel(show) {
    panel.classList.toggle("hidden", !show);
    root.querySelector("#np-tools").classList.toggle("hidden", show);
    // While the panel is open the on-screen keyboard is hidden (the text stays selected); closing brings it back.
    bodyEl.setAttribute("inputmode", show ? "none" : "text");
    if (show) { bodyEl.blur(); bodyEl.focus(); refreshState(); }
    else { bodyEl.blur(); bodyEl.focus(); }
  }
  function refreshState() {
    if (panel.classList.contains("hidden") || !inBody()) return;
    const on = (n) => { try { return document.queryCommandState(n); } catch (e) { return false; } };
    root.querySelectorAll("[data-cmd]").forEach((b) => {
      const n = b.getAttribute("data-cmd");
      let active = ["bold", "italic", "strikeThrough", "underline", "insertOrderedList", "justifyCenter", "justifyRight"].includes(n) ? on(n) : false;
      if (n === "insertUnorderedList") { const a = anchorEl(); const ul = a && a.closest("ul"); active = !!ul && !ul.classList.contains("cl"); }
      if (n === "justifyLeft") active = !on("justifyCenter") && !on("justifyRight") && !on("justifyFull");
      b.classList.toggle("on", active);
    });
    const a = anchorEl(); const cl = !!(a && a.closest("ul.cl"));
    root.querySelectorAll('[data-act="checklist"]').forEach((b) => b.classList.toggle("on", cl));
    root.querySelector('[data-act="hilite"]').classList.toggle("on", hiliteActive());
    const blk = currentStyleKey();
    root.querySelectorAll("[data-style]").forEach((b) => b.classList.toggle("on", b.getAttribute("data-style") === blk));
    $("#np-size-val").textContent = String(currentPx());
  }
  document.addEventListener("selectionchange", refreshState);

  // ---- ⋮ menu, notebook and day pickers (small sheets over the page) ----
  function openMenu() {
    openSheet(`
      <button class="icon-btn sheet-close" data-action="close" aria-label="Close">✕</button>
      <h2 class="sheet-title">Note</h2>
      <div class="nb-add-menu">
        <button class="btn" id="nm-book">Move to another notebook</button>
        <button class="btn" id="nm-day">Change the day</button>
        <button class="btn btn-danger" id="nm-del">Delete note</button>
      </div>
    `);
    wireSheetClose();
    document.getElementById("nm-book").addEventListener("click", () => { closeSheet(); pickNotebook(); });
    document.getElementById("nm-day").addEventListener("click", () => { closeSheet(); pickDay(); });
    document.getElementById("nm-del").addEventListener("click", () => {
      closeSheet();
      clearTimeout(saveTimer);
      const removed = noteId ? store.getNotes().find((n) => n.id === noteId) : null;
      if (removed) store.deleteNote(removed.id);
      noteId = null;
      titleEl.value = ""; bodyEl.innerHTML = "";
      close();
      notifyChanged();
      if (removed) showUndoToast("Note deleted", () => { store.saveNotes([removed, ...store.getNotes().filter((n) => n.id !== removed.id)]); notifyChanged(); }, 6000);
    });
  }
  function pickNotebook() {
    const books = allNotebooks();
    openSheet(`
      <button class="icon-btn sheet-close" data-action="close" aria-label="Close">✕</button>
      <h2 class="sheet-title">Notebook</h2>
      <div class="nb-add-menu">
        ${books.map((b) => `<button class="btn ${b.id === notebookId ? "btn-primary" : ""}" data-pick="${b.id}">${escapeHtml(b.name)}</button>`).join("")}
      </div>
    `);
    wireSheetClose();
    document.getElementById("sheet").querySelectorAll("[data-pick]").forEach((b) => b.addEventListener("click", () => {
      notebookId = b.getAttribute("data-pick");
      $("#np-book").textContent = bookName();
      closeSheet(); save(false);
    }));
  }
  function pickDay() {
    openSheet(`
      <button class="icon-btn sheet-close" data-action="close" aria-label="Close">✕</button>
      <h2 class="sheet-title">Day</h2>
      <div class="field"><input type="date" id="nd-date" value="${day}" max="${dateKey()}" /></div>
      <div class="btn-row"><button class="btn btn-primary" id="nd-save">Save</button></div>
    `);
    wireSheetClose();
    document.getElementById("nd-save").addEventListener("click", () => {
      const v = document.getElementById("nd-date").value;
      if (v && v <= dateKey()) { day = v; $("#np-stamp").textContent = fmtStamp({ date: day }, createdAt); closeSheet(); save(false); }
    });
  }

  // ---- closing ----
  let closed = false;
  function close() {
    if (closed) return;
    closed = true;
    clearTimeout(saveTimer);
    document.removeEventListener("selectionchange", refreshState);
    if (vv) { vv.removeEventListener("resize", fit); vv.removeEventListener("scroll", fit); }
    window.removeEventListener("popstate", onPop);
    root.remove();
    document.body.classList.remove("np-open");
    openPage = null;
    notifyChanged();
    if (onClose) onClose();
  }
  function finish() {
    save(true);
    // Remove the history entry we added so the phone's back button isn't left one step behind.
    if (history.state && history.state.notePage) { window.removeEventListener("popstate", onPop); history.back(); }
    close();
  }
  // The phone's own back gesture saves and closes the page instead of leaving the app.
  function onPop() { save(true); window.removeEventListener("popstate", onPop); close(); }
  try { history.pushState({ notePage: 1 }, "", location.href); window.addEventListener("popstate", onPop); } catch (e) { /* no history API */ }

  openPage = { close: finish };
  if (!existing) titleEl.focus();
}

export function notePageIsOpen() { return !!openPage; }
