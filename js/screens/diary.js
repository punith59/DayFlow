// Diary: notebooks. A "Notes" list with a row of notebook chips on top (All notes, the built-in Default notebook,
// then your own). A small button at the left of the chips opens the notebooks overview, where every notebook
// can be edited. Notes are grouped by day (newest first); tap one to open the note page.
import { prettyDate, escapeHtml } from "../utils.js";
import { allNotebooks, notebookById, notesByDay, noteTitle, noteNotebookId, DEFAULT_NOTEBOOK_ID } from "../notebooks.js";
import { store } from "../store.js";
import { openNotebooksSheet } from "../components/noteSheet.js";
import { openNotePage } from "../components/notePage.js";

let dvFilter = "all"; // "all" or a notebook id

const countLabel = (n) => `${n} note${n === 1 ? "" : "s"}`;

function visibleNotes() {
  if (dvFilter === "all") {
    const ids = new Set(allNotebooks().map((b) => b.id));
    const by = new Map();
    store.getNotes().forEach((n) => {
      const d = n.date || "";
      if (!by.has(d)) by.set(d, []);
      by.get(d).push(n);
    });
    return [...by.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([date, notes]) => ({ date, notes: notes.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)) }));
  }
  return notesByDay(dvFilter);
}

// One line of the body is enough for the overview.
function previewOf(n) {
  const line = (n.text || "").split("\n").map((l) => l.trim()).find(Boolean) || "";
  return line.length > 120 ? `${line.slice(0, 120)}…` : line;
}

function noteCardHtml(n, showBook) {
  const body = previewOf(n);
  const book = showBook ? notebookById(noteNotebookId(n)) : null;
  return `
    <button class="nt-card" data-note="${n.id}">
      <span class="nt-head">${escapeHtml(noteTitle(n))}</span>
      ${body ? `<span class="nt-body">${escapeHtml(body)}</span>` : ""}
      ${book ? `<span class="nt-book"><i style="background:${book.color}"></i>${escapeHtml(book.name)}</span>` : ""}
    </button>`;
}

export function renderDiary(container) {
  const books = allNotebooks();
  if (dvFilter !== "all" && !books.some((b) => b.id === dvFilter)) dvFilter = "all"; // notebook gone (deleted / restore)
  const total = store.getNotes().length;
  const days = visibleNotes();
  const shown = days.reduce((n, d) => n + d.notes.length, 0);
  const current = dvFilter === "all" ? null : notebookById(dvFilter);

  container.innerHTML = `
    <h1 class="page-date">Diary</h1>
    <p class="page-summary">${dvFilter === "all" ? countLabel(total) : `${escapeHtml(current.name)} · ${countLabel(shown)}`}</p>

    <div class="nb-chips">
      <button class="nb-chip nb-manage" id="nb-manage" aria-label="All notebooks">
        <svg viewBox="0 0 24 24" width="20" height="20"><rect x="4" y="4" width="16" height="16" rx="3" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M10 4v16" stroke="currentColor" stroke-width="1.8"/></svg>
      </button>
      <div class="nb-chips-scroll" id="nb-chips">
        <button class="nb-chip ${dvFilter === "all" ? "active" : ""}" data-f="all">All notes</button>
        ${books.map((b) => `<button class="nb-chip ${dvFilter === b.id ? "active" : ""}" data-f="${b.id}"><i style="background:${b.color}"></i>${escapeHtml(b.name)}</button>`).join("")}
      </div>
    </div>

    ${days.length ? days.map((g) => `
      <div class="nt-day">
        <div class="cal-sec-title">${g.date ? prettyDate(g.date) : "Undated"} <span class="cal-sec-count">${g.notes.length}</span></div>
        ${g.notes.map((n) => noteCardHtml(n, dvFilter === "all")).join("")}
      </div>`).join("") : `
      <div class="placeholder-panel" style="margin-top:18px;">
        <div class="placeholder-icon">▤</div>
        <div class="placeholder-title">${dvFilter === "all" ? "No notes yet" : "A blank notebook"}</div>
        <p class="placeholder-text">Tap + to write the first note.</p>
      </div>`}
    <div style="height:84px"></div>
  `;

  const setFilter = (f) => { dvFilter = f; renderDiary(container); };
  container.querySelectorAll("[data-f]").forEach((b) => b.addEventListener("click", () => setFilter(b.getAttribute("data-f"))));
  container.querySelector("#nb-manage").addEventListener("click", () => openNotebooksSheet((id) => setFilter(id)));
  container.querySelectorAll("[data-note]").forEach((b) => b.addEventListener("click", () => {
    const note = store.getNotes().find((n) => n.id === b.getAttribute("data-note"));
    if (note) openNotePage(note);
  }));
  // keep the selected chip in view
  const active = container.querySelector(".nb-chips-scroll .active");
  if (active && active.scrollIntoView) active.scrollIntoView({ inline: "center", block: "nearest" });
}

// What the + button does: a new note in the notebook being viewed (the default one when viewing All notes).
export function diaryFabAction() {
  openNotePage(null, dvFilter === "all" ? DEFAULT_NOTEBOOK_ID : dvFilter);
}
