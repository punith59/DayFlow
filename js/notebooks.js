// Diary notebooks: read-only helpers. A built-in default notebook always exists; custom ones are added by you.
// Notes belong to one notebook; a note with no (or an unknown) notebook sits in the default one.
import { store } from "./store.js";
import { goalById, goalList } from "./goals.js";

export const DEFAULT_NOTEBOOK_ID = "default";
export const DEFAULT_NOTEBOOK = { id: DEFAULT_NOTEBOOK_ID, name: "Default notebook", color: "#5CBED6", builtIn: true };

// Built-in notebook for goals: its notes each belong to one goal (`goalId`), and the notebook lists the goals.
export const GOALS_NOTEBOOK_ID = "goals";
export const GOALS_NOTEBOOK = { id: GOALS_NOTEBOOK_ID, name: "Goals", color: "#7FD6C2", builtIn: true, goals: true };

export function allNotebooks() {
  return [DEFAULT_NOTEBOOK, GOALS_NOTEBOOK, ...store.getNotebooks().map((b) => ({ ...b, name: b.name || "Untitled notebook", color: b.color || "#5CBED6" }))];
}

export function notebookById(id) {
  return allNotebooks().find((b) => b.id === id) || null;
}

// The notebook a note really lives in (unknown ids fall back to the default).
export function noteNotebookId(note, ids) {
  const known = ids || new Set(allNotebooks().map((b) => b.id));
  // A goal note whose goal no longer exists is kept, in the default notebook.
  if (note.notebookId === GOALS_NOTEBOOK_ID) return goalById(note.goalId) ? GOALS_NOTEBOOK_ID : DEFAULT_NOTEBOOK_ID;
  return note.notebookId && known.has(note.notebookId) ? note.notebookId : DEFAULT_NOTEBOOK_ID;
}

export function notesIn(notebookId) {
  const ids = new Set(allNotebooks().map((b) => b.id));
  return store.getNotes().filter((n) => noteNotebookId(n, ids) === notebookId);
}

export function notesForGoal(goalId) {
  return store.getNotes().filter((n) => n.notebookId === GOALS_NOTEBOOK_ID && n.goalId === goalId);
}

export function groupByDay(list) {
  const days = new Map();
  list.forEach((n) => {
    const d = n.date || "";
    if (!days.has(d)) days.set(d, []);
    days.get(d).push(n);
  });
  return [...days.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, notes]) => ({ date, notes: notes.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)) }));
}

// Notes grouped by day, newest day first; within a day, newest first.
export function notesByDay(notebookId) {
  const days = new Map();
  notesIn(notebookId).forEach((n) => {
    const d = n.date || "";
    if (!days.has(d)) days.set(d, []);
    days.get(d).push(n);
  });
  return [...days.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, notes]) => ({ date, notes: notes.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)) }));
}

export function noteTitle(n) {
  return (n.title || "").trim() || "Untitled";
}
