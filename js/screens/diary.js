// Diary: notebooks. A "Notes" list with a row of notebook chips on top (All notes, the built-in Default notebook,
// then your own). A small button at the left of the chips opens the notebooks overview, where every notebook
// can be edited. Notes are grouped by day (newest first); tap one to open the note page.
import { prettyDate, escapeHtml } from "../utils.js";
import { allNotebooks, notebookById, notesByDay, noteTitle, noteNotebookId, DEFAULT_NOTEBOOK_ID, GOALS_NOTEBOOK_ID, notesForGoal, groupByDay } from "../notebooks.js";
import { goalList, goalById } from "../goals.js";
import { openSheet, closeSheet, wireSheetClose } from "../components/sheet.js";
import { store } from "../store.js";
import { openNotebooksSheet } from "../components/noteSheet.js";
import { openNotePage } from "../components/notePage.js";
import { noteDaysHtml } from "../components/noteCards.js";

let dvFilter = "all"; // "all" or a notebook id
let dvGoal = null; // inside the Goals notebook: the goal being viewed

export function getDiaryState() { return { filter: dvFilter, goal: dvGoal }; }
export function setDiaryState(s) { if (s) { dvFilter = s.filter || "all"; dvGoal = s.goal || null; } }

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
  if (dvFilter === GOALS_NOTEBOOK_ID) return dvGoal ? groupByDay(notesForGoal(dvGoal)) : [];
  return notesByDay(dvFilter);
}

const GOAL_ORDER = { active: 0, paused: 1, achieved: 2 };

function goalsListHtml() {
  const goals = goalList().sort((a, b) => GOAL_ORDER[a.status] - GOAL_ORDER[b.status]);
  if (!goals.length) return `
    <div class="placeholder-panel" style="margin-top:18px;">
      <div class="placeholder-icon">◎</div>
      <div class="placeholder-title">No goals yet</div>
      <p class="placeholder-text">Add a goal in the Goals tab, then write its notes here.</p>
    </div>`;
  return `<div class="gn-list">${goals.map((g) => {
    const n = notesForGoal(g.id).length;
    return `<button class="gn-row" data-goal-open="${g.id}" style="--c:${g.color}">
      <span class="gn-emoji">${g.emoji ? escapeHtml(g.emoji) : "◎"}</span>
      <span class="gn-main"><span class="gn-name">${escapeHtml(g.name)}</span><span class="gn-meta">${g.status === "active" ? "" : g.status + " · "}${countLabel(n)}</span></span>
      <span class="gn-go">›</span></button>`;
  }).join("")}</div>`;
}

export function renderDiary(container) {
  const books = allNotebooks();
  if (dvFilter !== "all" && !books.some((b) => b.id === dvFilter)) dvFilter = "all"; // notebook gone (deleted / restore)
  const total = store.getNotes().length;
  const days = visibleNotes();
  const shown = days.reduce((n, d) => n + d.notes.length, 0);
  const current = dvFilter === "all" ? null : notebookById(dvFilter);
  if (dvGoal && !goalById(dvGoal)) dvGoal = null;
  const inGoals = dvFilter === GOALS_NOTEBOOK_ID;
  const goal = inGoals && dvGoal ? goalById(dvGoal) : null;
  const goalsTotal = inGoals && !goal ? goalList().length : 0;

  container.innerHTML = `
    <h1 class="page-date">Diary</h1>
    <p class="page-summary">${dvFilter === "all" ? countLabel(total) : goal ? `${goal.emoji ? escapeHtml(goal.emoji) + " " : ""}${escapeHtml(goal.name)} · ${countLabel(shown)}` : inGoals ? `Goals · ${goalsTotal} goal${goalsTotal === 1 ? "" : "s"}` : `${escapeHtml(current.name)} · ${countLabel(shown)}`}</p>

    <div class="nb-chips">
      <button class="nb-chip nb-manage" id="nb-manage" aria-label="All notebooks">
        <svg viewBox="0 0 24 24" width="20" height="20"><rect x="4" y="4" width="16" height="16" rx="3" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M10 4v16" stroke="currentColor" stroke-width="1.8"/></svg>
      </button>
      <div class="nb-chips-scroll" id="nb-chips">
        <button class="nb-chip ${dvFilter === "all" ? "active" : ""}" data-f="all">All notes</button>
        ${books.map((b) => `<button class="nb-chip ${dvFilter === b.id ? "active" : ""}" data-f="${b.id}"><i style="background:${b.color}"></i>${escapeHtml(b.name)}</button>`).join("")}
      </div>
    </div>

    ${goal ? `<button class="gn-back" id="gn-back">‹ All goals</button>` : ""}
    ${inGoals && !goal ? goalsListHtml() : days.length ? noteDaysHtml(days, dvFilter === "all") : `
      <div class="placeholder-panel" style="margin-top:18px;">
        <div class="placeholder-icon">▤</div>
        <div class="placeholder-title">${dvFilter === "all" ? "No notes yet" : "A blank notebook"}</div>
        <p class="placeholder-text">${goal ? `Tap + to write a note for this goal.` : "Tap + to write the first note."}</p>
      </div>`}
    <div style="height:84px"></div>
  `;

  const setFilter = (f) => { dvFilter = f; dvGoal = null; renderDiary(container); };
  container.querySelectorAll("[data-goal-open]").forEach((b) => b.addEventListener("click", () => { dvGoal = b.getAttribute("data-goal-open"); renderDiary(container); window.scrollTo(0, 0); }));
  const back = container.querySelector("#gn-back");
  if (back) back.addEventListener("click", () => { dvGoal = null; renderDiary(container); });
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
  if (dvFilter === GOALS_NOTEBOOK_ID) {
    if (dvGoal && goalById(dvGoal)) { openNotePage(null, GOALS_NOTEBOOK_ID, undefined, dvGoal); return; }
    const goals = goalList().filter((g) => g.status !== "achieved");
    if (!goals.length) { openSheet(`<button class="icon-btn sheet-close" data-action="close" aria-label="Close">✕</button><h2 class="sheet-title">No goals yet</h2><p class="field-hint">Add a goal in the Goals tab, then write its notes here.</p>`); wireSheetClose(); return; }
    openSheet(`
      <button class="icon-btn sheet-close" data-action="close" aria-label="Close">✕</button>
      <h2 class="sheet-title">Note for which goal?</h2>
      <div class="nb-add-menu">${goals.map((g) => `<button class="btn" data-g="${g.id}">${g.emoji ? escapeHtml(g.emoji) + " " : ""}${escapeHtml(g.name)}</button>`).join("")}</div>`);
    wireSheetClose();
    document.getElementById("sheet").querySelectorAll("[data-g]").forEach((b) => b.addEventListener("click", () => {
      const id = b.getAttribute("data-g"); closeSheet(); dvGoal = id; openNotePage(null, GOALS_NOTEBOOK_ID, undefined, id);
    }));
    return;
  }
  openNotePage(null, dvFilter === "all" ? DEFAULT_NOTEBOOK_ID : dvFilter);
}
