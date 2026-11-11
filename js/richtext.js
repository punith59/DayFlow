// Rich text for notes. Notes keep their body as a small, whitelisted subset of HTML; everything read from
// storage (or from a restored backup file) goes through sanitizeHtml before it touches the page.
const TAGS = new Set(["DIV", "P", "BR", "B", "STRONG", "I", "EM", "U", "S", "STRIKE", "DEL", "MARK", "SPAN", "UL", "OL", "LI", "H1", "H2", "H3", "BLOCKQUOTE", "FONT", "HR"]);
const DROP = new Set(["SCRIPT", "STYLE", "IFRAME", "OBJECT", "EMBED", "TEMPLATE", "NOSCRIPT", "SVG", "MATH", "LINK", "META"]);

const colorOk = (v) => /^(#[0-9a-f]{3,8}|rgba?\(\s*[\d.\s,%]+\)|[a-z]{3,20}|transparent)$/i.test(v);
const STYLE_OK = {
  "color": colorOk,
  "background-color": colorOk,
  "font-size": (v) => /^\d{1,2}(\.\d+)?px$/.test(v) && parseFloat(v) >= 8 && parseFloat(v) <= 72,
  "text-align": (v) => /^(left|center|right)$/.test(v),
  "font-weight": (v) => /^(bold|normal|[1-9]00)$/.test(v),
  "font-style": (v) => /^(italic|normal)$/.test(v),
  "text-decoration": (v) => /^(underline|line-through|none|underline line-through|line-through underline)$/.test(v),
  "text-decoration-line": (v) => /^(underline|line-through|none|underline line-through|line-through underline)$/.test(v),
};

function cleanStyle(el) {
  const out = [];
  for (let i = 0; i < el.style.length; i++) {
    const prop = el.style[i];
    const val = el.style.getPropertyValue(prop).trim();
    if (STYLE_OK[prop] && STYLE_OK[prop](val)) out.push(`${prop}: ${val}`);
  }
  return out.join("; ");
}

function walk(src, dest, doc) {
  src.childNodes.forEach((n) => {
    if (n.nodeType === 3) { dest.appendChild(doc.createTextNode(n.nodeValue.replace(/\u200B/g, ""))); return; }
    if (n.nodeType !== 1) return;
    const tag = n.tagName.toUpperCase();
    if (DROP.has(tag)) return;
    if (!TAGS.has(tag)) { walk(n, dest, doc); return; } // unknown tag: keep its text, drop the tag
    const el = doc.createElement(tag.toLowerCase());
    const st = cleanStyle(n);
    if (st) el.setAttribute("style", st);
    if ((tag === "DIV" || tag === "P" || tag === "LI") && /^(h1|h2|h3|note)$/.test(n.getAttribute("data-s") || "")) el.setAttribute("data-s", n.getAttribute("data-s"));
    if ((tag === "DIV" || tag === "P") && /^[1-5]$/.test(n.getAttribute("data-i") || "")) el.setAttribute("data-i", n.getAttribute("data-i"));
    if (tag === "OL" && /^\d{1,3}$/.test(n.getAttribute("start") || "")) el.setAttribute("start", n.getAttribute("start"));
    if (tag === "UL" && (n.classList.contains("cl") || n.classList.contains("nt-checklist"))) el.setAttribute("class", "cl");
    if (tag === "FONT") {
      const c = n.getAttribute("color"); const sz = n.getAttribute("size");
      if (c && colorOk(c.trim())) el.setAttribute("color", c.trim());
      if (sz && /^[1-7]$/.test(sz.trim())) el.setAttribute("size", sz.trim());
    }
    if (tag === "LI" && n.getAttribute("data-done") === "1") el.setAttribute("data-done", "1");
    walk(n, el, doc);
    dest.appendChild(el);
  });
}

export function sanitizeHtml(html) {
  if (!html) return "";
  const doc = new DOMParser().parseFromString(`<body>${html}`, "text/html");
  const root = doc.createElement("div");
  walk(doc.body, root, doc);
  return root.innerHTML;
}

const escapeText = (t) => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Plain text (older notes) -> HTML, one line per block.
export function textToHtml(text) {
  return String(text || "").split("\n").map((l) => (l ? `<div>${escapeText(l)}</div>` : "<div><br></div>")).join("");
}

// Names used by the note page.
export const htmlFromPlain = (text) => textToHtml(text);

// The note body as HTML, whichever way it was saved.
export function noteBodyHtml(n) {
  return n.html ? sanitizeHtml(n.html) : textToHtml(n.text || "");
}

const BLOCKS = new Set(["DIV", "P", "LI", "H1", "H2", "H3", "BLOCKQUOTE", "UL", "OL"]);
export function plainFromHtml(html) { return htmlToText(html); }
export function htmlToText(html) {
  const doc = new DOMParser().parseFromString(`<body>${sanitizeHtml(html)}`, "text/html");
  let out = "";
  const go = (node) => {
    node.childNodes.forEach((n) => {
      if (n.nodeType === 3) out += n.nodeValue.replace(/\u200B/g, "");
      else if (n.nodeType === 1) {
        if (n.tagName === "BR") { out += "\n"; return; }
        const block = BLOCKS.has(n.tagName);
        if (block && out && !out.endsWith("\n")) out += "\n";
        if (n.tagName === "LI") {
          const par = n.parentElement;
          if (par && par.tagName === "OL") out += `${Array.prototype.indexOf.call(par.children, n) + 1}. `;
          else if (par && par.classList.contains("cl")) out += n.getAttribute("data-done") === "1" ? "☑ " : "☐ ";
          else out += "• ";
        }
        go(n);
        if (block && out && !out.endsWith("\n")) out += "\n";
      }
    });
  };
  go(doc.body);
  return out.replace(/\n{3,}/g, "\n\n").trim();
}

export function notePlainText(n) {
  return n.html ? htmlToText(n.html) : String(n.text || "").trim();
}
