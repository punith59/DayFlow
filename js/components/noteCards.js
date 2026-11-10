// Note cards and day groups, shared by the Diary and a goal's own page.
import { prettyDate, escapeHtml } from "../utils.js";
import { notebookById, noteTitle, noteNotebookId, GOALS_NOTEBOOK_ID } from "../notebooks.js";
import { goalById } from "../goals.js";

// One line of the body is enough for the overview.
export function previewOf(n) {
  const line = (n.text || "").split("\n").map((l) => l.trim()).find(Boolean) || "";
  return line.length > 120 ? `${line.slice(0, 120)}…` : line;
}

export function noteCardHtml(n, showBook) {
  const body = previewOf(n);
  let book = showBook ? notebookById(noteNotebookId(n)) : null;
  if (book && book.id === GOALS_NOTEBOOK_ID) { const g = goalById(n.goalId); if (g) book = { ...book, name: `${g.emoji ? g.emoji + " " : ""}${g.name}`, color: g.color }; }
  return `
    <button class="nt-card" data-note="${n.id}">
      <span class="nt-head">${escapeHtml(noteTitle(n))}</span>
      ${body ? `<span class="nt-body">${escapeHtml(body)}</span>` : ""}
      ${book ? `<span class="nt-book"><i style="background:${book.color}"></i>${escapeHtml(book.name)}</span>` : ""}
    </button>`;
}

// Notes grouped by day (newest first), each day with its date heading.
export function noteDaysHtml(days, showBook) {
  return days.map((g) => `
    <div class="nt-day">
      <div class="cal-sec-title">${g.date ? prettyDate(g.date) : "Undated"} <span class="cal-sec-count">${g.notes.length}</span></div>
      ${g.notes.map((n) => noteCardHtml(n, showBook)).join("")}
    </div>`).join("");
}
