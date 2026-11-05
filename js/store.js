import { uid, WEEKDAY_NAMES, PALETTE, normalizeHex } from "./utils.js";
import { APP_VERSION } from "./version.js";

const KEYS = {
  tasks: "dayflow:tasks",
  events: "dayflow:events",
  deadlines: "dayflow:deadlines",
  goals: "dayflow:goals",
  notes: "dayflow:notes",
  notebooks: "dayflow:notebooks",
  college: "dayflow:college",
  timeBlocks: "dayflow:timeBlocks",
  palette: "dayflow:palette",
  colorHistory: "dayflow:colorHistory",
  blockExceptions: "dayflow:blockExceptions",
  settings: "dayflow:settings",
  meta: "dayflow:meta", // device-only bookkeeping (e.g. last backup time); never part of a backup
};

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return fallback;
    return JSON.parse(raw);
  } catch (e) {
    console.warn("DayFlow: failed to read", key, e);
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    console.warn("DayFlow: failed to save", key, e);
    return false;
  }
}

function emptyCollege() {
  const c = {};
  WEEKDAY_NAMES.forEach((d) => (c[d] = []));
  return c;
}

export const store = {
  // ---- Tasks ----
  getTasks() { return read(KEYS.tasks, []); },
  saveTasks(list) { return write(KEYS.tasks, list); },
  addTask(task) {
    const list = store.getTasks();
    list.push({ done: false, recurrence: "none", ...task, id: task.id || uid() });
    store.saveTasks(list);
  },
  updateTask(id, patch) {
    const list = store.getTasks().map((t) => (t.id === id ? { ...t, ...patch } : t));
    store.saveTasks(list);
  },
  deleteTask(id) {
    store.saveTasks(store.getTasks().filter((t) => t.id !== id));
  },

  // ---- Events ----
  getEvents() { return read(KEYS.events, []); },
  saveEvents(list) { return write(KEYS.events, list); },
  addEvent(evt) {
    const list = store.getEvents();
    list.push({ recurrence: "none", ...evt, id: evt.id || uid() });
    store.saveEvents(list);
  },
  updateEvent(id, patch) {
    const list = store.getEvents().map((e) => (e.id === id ? { ...e, ...patch } : e));
    store.saveEvents(list);
  },
  deleteEvent(id) {
    store.saveEvents(store.getEvents().filter((e) => e.id !== id));
    // unlink any tasks that pointed at this event
    const tasks = store.getTasks().map((t) => (t.linkedType === "event" && t.linkedId === id ? { ...t, linkedType: null, linkedId: null } : t));
    store.saveTasks(tasks);
  },

  // ---- Deadlines ----
  getDeadlines() { return read(KEYS.deadlines, []); },
  saveDeadlines(list) { return write(KEYS.deadlines, list); },
  addDeadline(dl) {
    const list = store.getDeadlines();
    list.push({ recurrence: "none", ...dl, id: dl.id || uid() });
    store.saveDeadlines(list);
  },
  updateDeadline(id, patch) {
    const list = store.getDeadlines().map((d) => (d.id === id ? { ...d, ...patch } : d));
    store.saveDeadlines(list);
  },
  deleteDeadline(id) {
    store.saveDeadlines(store.getDeadlines().filter((d) => d.id !== id));
    const tasks = store.getTasks().map((t) => (t.linkedType === "deadline" && t.linkedId === id ? { ...t, linkedType: null, linkedId: null } : t));
    store.saveTasks(tasks);
  },

  // ---- Linking helpers ----
  // Tasks currently linked to a given event or deadline (derived, not stored redundantly).
  tasksLinkedTo(type, id) {
    return store.getTasks().filter((t) => t.linkedType === type && t.linkedId === id);
  },
  // Point a set of tasks at this event/deadline, and unlink any previously-linked
  // tasks that are no longer in the set — keeps the link single-source-of-truth.
  setLinkedTasks(type, id, taskIds) {
    const tasks = store.getTasks().map((t) => {
      if (taskIds.includes(t.id)) return { ...t, linkedType: type, linkedId: id };
      if (t.linkedType === type && t.linkedId === id) return { ...t, linkedType: null, linkedId: null };
      return t;
    });
    store.saveTasks(tasks);
  },

  // ---- Goals ----
  // A goal: { id, name, emoji, color, why, status: "active"|"paused"|"achieved",
  //   targetTypes: any of "milestones"|"time"|"date", milestones:[{id,title,doneAt}], targetMins, targetDate,
  //   manual: [{ id, at, kind: "count"|"time", amount }], createdAt, achievedAt }
  // Tasks, events and deadlines point at a goal with `goalId`.
  getGoals() { return read(KEYS.goals, []); },
  saveGoals(list) { return write(KEYS.goals, list); },
  addGoal(goal) {
    const id = goal.id || uid();
    const list = store.getGoals();
    list.push({ status: "active", targetTypes: [], milestones: [], manual: [], createdAt: Date.now(), ...goal, id });
    store.saveGoals(list);
    return id;
  },
  updateGoal(id, patch) {
    const list = store.getGoals().map((g) => (g.id === id ? { ...g, ...patch } : g));
    store.saveGoals(list);
  },
  // Time added by hand toward a time target.
  addGoalProgress(goalId, entry) {
    const g = store.getGoals().find((x) => x.id === goalId);
    if (!g) return null;
    const e = { id: uid(), at: Date.now(), ...entry };
    store.updateGoal(goalId, { manual: [...(g.manual || []), e] });
    return e.id;
  },
  removeGoalProgress(goalId, entryId) {
    const g = store.getGoals().find((x) => x.id === goalId);
    if (!g) return;
    store.updateGoal(goalId, { manual: (g.manual || []).filter((m) => m.id !== entryId) });
  },
  // Removes the goal and detaches whatever pointed at it (nothing linked is deleted).
  // Returns what is needed to put it all back exactly (see restoreGoal).
  deleteGoal(id) {
    const goal = store.getGoals().find((g) => g.id === id);
    if (!goal) return null;
    const index = store.getGoals().findIndex((g) => g.id === id);
    const linked = { tasks: [], events: [], deadlines: [] };
    const detach = (list, bucket) => list.map((x) => {
      if (x.goalId !== id) return x;
      linked[bucket].push(x.id);
      return { ...x, goalId: null };
    });
    store.saveGoals(store.getGoals().filter((g) => g.id !== id));
    store.saveTasks(detach(store.getTasks(), "tasks"));
    store.saveEvents(detach(store.getEvents(), "events"));
    store.saveDeadlines(detach(store.getDeadlines(), "deadlines"));
    return { goal, index, linked };
  },
  restoreGoal(removed) {
    if (!removed) return;
    const { goal, index, linked } = removed;
    const list = store.getGoals().filter((g) => g.id !== goal.id);
    list.splice(Math.min(index, list.length), 0, goal);
    store.saveGoals(list);
    const attach = (items, ids) => items.map((x) => (ids.includes(x.id) ? { ...x, goalId: goal.id } : x));
    store.saveTasks(attach(store.getTasks(), linked.tasks));
    store.saveEvents(attach(store.getEvents(), linked.events));
    store.saveDeadlines(attach(store.getDeadlines(), linked.deadlines));
  },

  // ---- Diary notes (multiple free-form notes per day, keyed by date field) ----
  getNotes() { return read(KEYS.notes, []); },
  saveNotes(list) { return write(KEYS.notes, list); },
  addNote(note) {
    const list = store.getNotes();
    const id = uid();
    list.unshift({ createdAt: Date.now(), ...note, id });
    store.saveNotes(list);
    return id;
  },
  updateNote(id, patch) {
    store.saveNotes(store.getNotes().map((n) => (n.id === id ? { ...n, ...patch, updatedAt: Date.now() } : n)));
  },
  deleteNote(id) {
    store.saveNotes(store.getNotes().filter((n) => n.id !== id));
  },

  // ---- Notebooks (v21) ----
  // Custom notebooks only: { id, name, color, createdAt }. The default notebook ("default") is built in and
  // never stored. A note belongs to one via `notebookId`; notes with none (or an unknown one) sit in the default.
  getNotebooks() { return read(KEYS.notebooks, []); },
  saveNotebooks(list) { return write(KEYS.notebooks, list); },
  addNotebook(nb) {
    const id = uid();
    store.saveNotebooks([...store.getNotebooks(), { createdAt: Date.now(), ...nb, id }]);
    return id;
  },
  updateNotebook(id, patch) {
    store.saveNotebooks(store.getNotebooks().map((b) => (b.id === id ? { ...b, ...patch } : b)));
  },
  // Removes the notebook and its notes; returns what restoreNotebook needs to put it all back.
  deleteNotebook(id) {
    const list = store.getNotebooks();
    const index = list.findIndex((b) => b.id === id);
    if (index < 0) return null;
    const notebook = list[index];
    const allNotes = store.getNotes();
    const notes = allNotes.filter((n) => n.notebookId === id);
    store.saveNotebooks(list.filter((b) => b.id !== id));
    store.saveNotes(allNotes.filter((n) => n.notebookId !== id));
    return { notebook, index, notes };
  },
  restoreNotebook(removed) {
    if (!removed) return;
    const list = store.getNotebooks().filter((b) => b.id !== removed.notebook.id);
    list.splice(Math.min(removed.index, list.length), 0, removed.notebook);
    store.saveNotebooks(list);
    const have = new Set(store.getNotes().map((n) => n.id));
    store.saveNotes([...store.getNotes(), ...removed.notes.filter((n) => !have.has(n.id))]);
  },

  // ---- College schedule ----
  getCollege() {
    const c = read(KEYS.college, null);
    return c || emptyCollege();
  },
  saveCollege(obj) { return write(KEYS.college, obj); },

  // ---- Time blocks (recurring parts of the user's existing schedule) ----
  getTimeBlocks() { return read(KEYS.timeBlocks, []); },
  saveTimeBlocks(list) { return write(KEYS.timeBlocks, list); },
  addTimeBlock(block) {
    const list = store.getTimeBlocks();
    list.push({ days: [], ...block, id: block.id || uid() });
    store.saveTimeBlocks(list);
  },
  updateTimeBlock(id, patch) {
    store.saveTimeBlocks(store.getTimeBlocks().map((b) => (b.id === id ? { ...b, ...patch } : b)));
  },
  deleteTimeBlock(id) {
    store.saveTimeBlocks(store.getTimeBlocks().filter((b) => b.id !== id));
  },

  // Days off / exceptions: { id, scope: "all" | "group" | "block", target, from, to, reason }
  getBlockExceptions() { return read(KEYS.blockExceptions, []); },
  saveBlockExceptions(list) { return write(KEYS.blockExceptions, list); },
  addBlockException(ex) {
    const list = store.getBlockExceptions();
    list.push({ ...ex, id: ex.id || uid() });
    store.saveBlockExceptions(list);
  },
  deleteBlockException(id) {
    store.saveBlockExceptions(store.getBlockExceptions().filter((x) => x.id !== id));
  },

  // ---- Colour palette (saved colours) and colour history (colours picked on the spot) ----
  getPalette() {
    const p = read(KEYS.palette, null);
    return Array.isArray(p) ? p : [...PALETTE]; // untouched palette = the built-in colours
  },
  savePalette(list) { return write(KEYS.palette, list); },
  addPaletteColor(hex) {
    const h = normalizeHex(hex);
    if (!h) return false;
    const list = store.getPalette();
    if (list.includes(h)) return false;
    store.savePalette([...list, h]);
    return true;
  },
  removePaletteColor(hex) {
    const h = normalizeHex(hex);
    store.savePalette(store.getPalette().filter((c) => c !== h));
  },
  getColorHistory() { return read(KEYS.colorHistory, []); },
  saveColorHistory(list) { return write(KEYS.colorHistory, list); },
  // History keeps colours that were picked in a form but NOT saved to the palette (newest first).
  addColorHistory(hex) {
    const h = normalizeHex(hex);
    if (!h || store.getPalette().includes(h)) return;
    store.saveColorHistory([h, ...store.getColorHistory().filter((c) => c !== h)].slice(0, 24));
  },
  removeColorHistory(hex) {
    const h = normalizeHex(hex);
    store.saveColorHistory(store.getColorHistory().filter((c) => c !== h));
  },

  // ---- Settings ----
  getSettings() { return read(KEYS.settings, { accent: "#34C77B" }); },
  saveSettings(obj) { return write(KEYS.settings, obj); },

  // ---- Device-only bookkeeping (not exported) ----
  getMeta() { return read(KEYS.meta, {}); },
  saveMeta(obj) { return write(KEYS.meta, obj); },

  // ---- Export / Import (backup) ----
  exportAll() {
    return {
      app: "dayflow",
      version: BACKUP_FORMAT,
      appVersion: APP_VERSION,
      exportedAt: new Date().toISOString(),
      tasks: store.getTasks(),
      events: store.getEvents(),
      deadlines: store.getDeadlines(),
      goals: store.getGoals(),
      notes: store.getNotes(),
      notebooks: store.getNotebooks(),
      college: store.getCollege(),
      timeBlocks: store.getTimeBlocks(),
      palette: store.getPalette(),
      colorHistory: store.getColorHistory(),
      blockExceptions: store.getBlockExceptions(),
      settings: store.getSettings(),
    };
  },

  // Checks a parsed backup and returns only its recognised, cleaned sections.
  // Throws an Error with a plain-language message if the file can't be trusted.
  prepareBackup(data) {
    if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("This file isn't a DayFlow backup.");
    if (data.app != null && data.app !== "dayflow") throw new Error("This file is from a different app.");
    if (typeof data.version === "number" && data.version > BACKUP_FORMAT) {
      throw new Error("This backup was made by a newer version of DayFlow. Update the app first.");
    }
    const clean = {};
    for (const key of BACKUP_SECTIONS) {
      if (data[key] === undefined || data[key] === null) continue;
      const v = data[key];
      if (OBJECT_SECTIONS.includes(key)) {
        if (typeof v !== "object" || Array.isArray(v)) throw new Error(`The "${key}" part of this backup is unreadable.`);
        clean[key] = v;
      } else if (key === "palette" || key === "colorHistory") {
        if (!Array.isArray(v)) throw new Error(`The "${key}" part of this backup is unreadable.`);
        const hexes = v.map(normalizeHex).filter(Boolean);
        clean[key] = hexes.filter((h, i) => hexes.indexOf(h) === i);
      } else {
        if (!Array.isArray(v) || v.some((x) => !x || typeof x !== "object" || Array.isArray(x))) {
          throw new Error(`The "${key}" part of this backup is unreadable.`);
        }
        clean[key] = v;
      }
    }
    if (!Object.keys(clean).length) throw new Error("This file doesn't contain any DayFlow data.");
    return clean;
  },

  // Exact copy of everything stored, so a restore can be rolled back or undone.
  rawSnapshot() {
    const snap = {};
    Object.values(KEYS).forEach((k) => { snap[k] = localStorage.getItem(k); });
    return snap;
  },
  restoreRawSnapshot(snap) {
    Object.entries(snap).forEach(([k, v]) => {
      try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* best effort */ }
    });
  },

  // Replaces the sections present in the backup. If anything fails to save
  // (e.g. storage full) everything is put back exactly as it was and an error is thrown.
  // Returns the pre-import snapshot so the caller can offer Undo.
  importAll(data) {
    const clean = store.prepareBackup(data);
    const before = store.rawSnapshot();
    const ok = Object.entries(clean).every(([key, value]) => SAVERS[key](value));
    if (!ok) {
      store.restoreRawSnapshot(before);
      throw new Error("There wasn't enough storage space to restore this backup. Nothing was changed.");
    }
    return before;
  },
};

// ---- Backup format helpers ----
const BACKUP_FORMAT = 2;
const BACKUP_SECTIONS = ["tasks", "events", "deadlines", "goals", "notes", "notebooks", "college", "timeBlocks", "palette", "colorHistory", "blockExceptions", "settings"];
const OBJECT_SECTIONS = ["college", "settings"];
const SAVERS = {
  tasks: (v) => store.saveTasks(v),
  events: (v) => store.saveEvents(v),
  deadlines: (v) => store.saveDeadlines(v),
  goals: (v) => store.saveGoals(v),
  notes: (v) => store.saveNotes(v),
  notebooks: (v) => store.saveNotebooks(v),
  college: (v) => store.saveCollege(v),
  timeBlocks: (v) => store.saveTimeBlocks(v),
  palette: (v) => store.savePalette(v),
  colorHistory: (v) => store.saveColorHistory(v),
  blockExceptions: (v) => store.saveBlockExceptions(v),
  settings: (v) => store.saveSettings(v),
};
