import { store } from "./store.js";
import { onRouteChange, initRouter, currentRoute, navigate } from "./router.js";
import { openAddMenu } from "./modal.js";
import { openCreateMenu, openTaskComposer, openEventComposer, openDeadlineComposer } from "./forms.js";
import { openGoalComposer } from "./components/goalSheet.js";
import { openNotePage, notePageState } from "./components/notePage.js";
import { registerViewState, registerNoteState, restoreUiEarly, startSession, takeDraft, applyDraft } from "./session.js";
import { renderToday, getTodaySelectedDate, setTodaySelectedDate, getTodayCreatePresetDate } from "./screens/today.js";
import { getCalendarCreatePresetDate, getCalendarState, setCalendarState } from "./screens/calendar.js";
import { renderCalendar } from "./screens/calendar.js";
import { renderDiary, diaryFabAction, getDiaryState, setDiaryState } from "./screens/diary.js";
import { renderGoals, goalsFabAction, getGoalsState, setGoalsState } from "./screens/goals.js";
import { renderMore } from "./screens/more.js";
import { startTextFieldGuard } from "./textfield.js";

const SCREENS = [
  { id: "today", label: "Today", icon: "○", render: renderToday },
  { id: "calendar", label: "Calendar", icon: "▦", render: renderCalendar },
  { id: "diary", label: "Diary", icon: "▤", render: renderDiary },
  { id: "goals", label: "Goals", icon: "◎", render: renderGoals },
  { id: "more", label: "More", icon: "⋯", render: renderMore },
];

const view = document.getElementById("view");
const navBar = document.getElementById("nav-bar");
const fab = document.getElementById("fab");

function navItemHtml(screen, active) {
  return `<button class="nav-item ${active ? "active" : ""}" data-nav="${screen.id}">
    <span class="nav-icon">${screen.icon}</span>
    <span>${screen.label}</span>
  </button>`;
}

function renderNav(activeId) {
  navBar.innerHTML = SCREENS.map((s) => navItemHtml(s, s.id === activeId)).join("");
  navBar.querySelectorAll("[data-nav]").forEach((el) => {
    el.addEventListener("click", () => navigate(el.getAttribute("data-nav")));
  });
}

let viewEnterTimer = null;

// animate: a gentle fade-in when you move to another tab (never when a screen just refreshes in place).
function renderScreen(route, animate = true) {
  const screen = SCREENS.find((s) => s.id === route.screen) || SCREENS[0];
  renderNav(screen.id);
  if (animate) {
    view.classList.remove("view-enter");
    void view.offsetWidth; // restart the animation if you switch tabs quickly
    view.classList.add("view-enter");
    const appEl = document.getElementById("app");
    appEl.classList.remove("view-entering");
    void appEl.offsetWidth;
    appEl.classList.add("view-entering");
    clearTimeout(viewEnterTimer);
    viewEnterTimer = setTimeout(() => {
      view.classList.remove("view-enter");
      appEl.classList.remove("view-entering");
    }, 900);
  }
  try {
    screen.render(view);
  } catch (err) {
    console.error("DayFlow render error:", err);
    view.innerHTML = `<p class="empty-note">Something went wrong loading this screen. Try switching tabs and back.</p>`;
  }
  // The + button doesn't belong on More (its pages have their own Add buttons).
  fab.style.display = route.screen === "more" ? "none" : "";
  window.scrollTo(0, 0);
}

// Re-render in place (something changed underneath) without jumping back to the top.
function renderCurrentScreen() {
  const y = window.scrollY;
  renderScreen(currentRoute(), false);
  window.scrollTo(0, y);
}

// Apply saved accent color
const settings = store.getSettings();
// (The old default green is ignored, so older saved settings and backups take the current theme colour.)
if (settings.accent && settings.accent.toLowerCase() !== "#34c77b") {
  document.documentElement.style.setProperty("--accent", settings.accent);
}

// Ask the browser not to clear this app's data automatically (it may ignore the request).
if (navigator.storage && navigator.storage.persist) {
  navigator.storage.persist().catch(() => {});
}

// Remember where you were (tab, day, notebook, goal) so being closed in the background doesn't send you back to Today.
registerViewState("today", getTodaySelectedDate, setTodaySelectedDate);
registerViewState("calendar", getCalendarState, setCalendarState);
registerViewState("diary", getDiaryState, setDiaryState);
registerViewState("goals", getGoalsState, setGoalsState);
registerNoteState(notePageState);
// Home-screen shortcut (long-press the app icon): index.html?add=task|event|deadline|note opens that form straight away.
const quickAdd = (() => {
  try {
    const k = new URLSearchParams(window.location.search).get("add");
    if (!k) return null;
    history.replaceState(history.state, "", window.location.pathname + window.location.hash);
    return ["task", "event", "deadline", "note"].includes(k) ? k : null;
  } catch (e) { return null; }
})();
const savedNote = restoreUiEarly();
startSession();

startTextFieldGuard();
onRouteChange(renderScreen);
initRouter();

// Put back what was open: a note, or a half-filled form.
setTimeout(() => {
  try {
    if (quickAdd) {
      if (quickAdd === "task") openTaskComposer();
      else if (quickAdd === "event") openEventComposer();
      else if (quickAdd === "deadline") openDeadlineComposer();
      else openNotePage();
      return;
    }
    if (savedNote && savedNote.id) {
      const note = store.getNotes().find((n) => n.id === savedNote.id);
      if (note) { openNotePage(note); return; }
    }
    const draft = takeDraft();
    if (!draft) return;
    const a = draft.args || {};
    const find = (list) => (a.id ? list.find((x) => x.id === a.id) || null : null);
    if (a.id && !find(draft.kind === "task" ? store.getTasks() : draft.kind === "event" ? store.getEvents() : draft.kind === "deadline" ? store.getDeadlines() : store.getGoals())) return;
    if (draft.kind === "task") openTaskComposer(find(store.getTasks()), a.presetDate, a.presetLink, undefined, a.presetBlockId, a.presetGoalId);
    else if (draft.kind === "event") openEventComposer(find(store.getEvents()), a.presetDate, undefined, a.presetBlockId, a.presetGoalId);
    else if (draft.kind === "deadline") openDeadlineComposer(find(store.getDeadlines()), a.presetDate, undefined, a.presetBlockId, a.presetGoalId);
    else if (draft.kind === "goal") openGoalComposer(find(store.getGoals()));
    else return;
    applyDraft(draft);
  } catch (e) { console.error("DayFlow restore error:", e); }
}, 350);

// First screen is drawn: let the loading screen fade away.
{
  const splash = document.getElementById("splash");
  if (splash) {
    requestAnimationFrame(() => {
      splash.classList.add("splash-done");
      setTimeout(() => splash.remove(), 450);
    });
  }
}

fab.addEventListener("click", () => {
  const route = currentRoute();
  if (route.screen === "today") {
    openCreateMenu(getTodayCreatePresetDate());
  } else if (route.screen === "calendar") {
    // In a day view new items default to that day (never a past one); otherwise today.
    openCreateMenu(getCalendarCreatePresetDate());
  } else if (route.screen === "goals") {
    goalsFabAction();
  } else if (route.screen === "diary") {
    diaryFabAction();
  } else {
    openAddMenu();
  }
});

document.addEventListener("dayflow:refresh", renderCurrentScreen);

// ---- PWA install prompt ----
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  window.__dayflowInstallPrompt = e;
});
window.addEventListener("appinstalled", () => {
  window.__dayflowInstallPrompt = null;
});

// ---- Service worker ----
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    const swUrl = new URL("./sw.js", document.baseURI).toString();
    navigator.serviceWorker.register(swUrl).catch((err) => {
      console.warn("DayFlow: service worker registration failed", err);
    });
  });
}
