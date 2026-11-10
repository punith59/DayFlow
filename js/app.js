import { store } from "./store.js";
import { onRouteChange, initRouter, currentRoute, navigate } from "./router.js";
import { openAddMenu } from "./modal.js";
import { openCreateMenu } from "./forms.js";
import { renderToday, getTodaySelectedDate, getTodayCreatePresetDate } from "./screens/today.js";
import { getCalendarCreatePresetDate } from "./screens/calendar.js";
import { renderCalendar } from "./screens/calendar.js";
import { renderDiary, diaryFabAction } from "./screens/diary.js";
import { renderGoals, goalsFabAction } from "./screens/goals.js";
import { renderMore } from "./screens/more.js";

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

onRouteChange(renderScreen);
initRouter();

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
