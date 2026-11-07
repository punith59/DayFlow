import { store } from "../store.js";
import { renderTimeBlocksManager } from "./timeBlocks.js";
import { renderPalette } from "./palette.js";
import { renderBackup } from "./backup.js";
import { APP_VERSION } from "../version.js";
import { openSheet, closeSheet, wireSheetClose } from "../components/sheet.js";
import { showToast } from "../components/toast.js";

let moreView = "home"; // "home" | "blocks" | "palette" | "backup"

function isInstalledApp() {
  return (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) || window.navigator.standalone === true;
}

// Uses the browser's own install prompt when it has offered one; otherwise says how to install by hand.
async function installApp() {
  const ev = window.__dayflowInstallPrompt;
  if (ev) {
    window.__dayflowInstallPrompt = null;
    try {
      ev.prompt();
      const choice = await ev.userChoice;
      showToast(choice && choice.outcome === "accepted" ? "Installing DayFlow…" : "Install cancelled");
    } catch (e) {
      showToast("Couldn't start the install. Try the browser menu instead.", 4000);
    }
    return;
  }
  openSheet(`
    <button class="icon-btn sheet-close" data-action="close" aria-label="Close">✕</button>
    <h2 class="sheet-title">Install DayFlow</h2>
    <p class="bk-note" style="margin-top:0">Your browser hasn't offered the install yet, so do it from its menu:</p>
    <ol class="bk-steps">
      <li>Open this page in <b>Chrome</b> (not inside another app).</li>
      <li>Tap the <b>⋮ menu</b> and choose <b>Install app</b>. If you only see "Add to Home screen", tap that and then choose <b>Install</b> on the next screen.</li>
      <li>Delete any older DayFlow shortcut from your home screen first, so you open the installed one.</li>
    </ol>
    <p class="bk-note">Your data stays as it is; installing doesn't change it.</p>
    <div class="btn-row"><button class="btn btn-primary" id="inst-ok">Got it</button></div>
  `);
  wireSheetClose();
  document.getElementById("inst-ok").addEventListener("click", closeSheet);
}

export function renderMore(container) {
  const back = () => { moreView = "home"; renderMore(container); };
  if (moreView === "blocks") { renderTimeBlocksManager(container, back); return; }
  if (moreView === "palette") { renderPalette(container, back); return; }
  if (moreView === "backup") { renderBackup(container, back); return; }

  const n = store.getTimeBlocks().length;
  const offs = store.getBlockExceptions().length;
  const saved = store.getPalette().length;
  const hist = store.getColorHistory().length;
  const lastIso = store.getMeta().lastExportAt;
  const lastD = lastIso ? new Date(lastIso) : null;
  const lastBackup = lastD && !isNaN(lastD) ? lastD.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "";
  container.innerHTML = `
    <h1 class="page-date">More</h1>
    <button class="more-card" data-more="blocks">
      <span class="more-ico">▦</span>
      <span class="more-main">
        <span class="more-title">Time blocks</span>
        <span class="more-sub">${n ? `${n} block${n === 1 ? "" : "s"}${offs ? ` · ${offs} day${offs === 1 ? "" : "s"} off set` : ""}` : "Class periods, gym, sleep — the shape of your week"}</span>
      </span>
      <span class="more-chev">›</span>
    </button>
    <button class="more-card" data-more="palette">
      <span class="more-ico">◍</span>
      <span class="more-main">
        <span class="more-title">Colour palette</span>
        <span class="more-sub">${saved} saved${hist ? ` · ${hist} in history` : ""}</span>
      </span>
      <span class="more-chev">›</span>
    </button>
    <button class="more-card" data-more="backup">
      <span class="more-ico">⇩</span>
      <span class="more-main">
        <span class="more-title">Backup &amp; restore</span>
        <span class="more-sub">${lastBackup ? `Last backup file: ${lastBackup}` : "Save a copy of your data to a file"}</span>
      </span>
      <span class="more-chev">›</span>
    </button>
    ${isInstalledApp() ? "" : `<button class="more-card" data-install="1">
      <span class="more-ico">⤓</span>
      <span class="more-main">
        <span class="more-title">Install DayFlow</span>
        <span class="more-sub">Open it like a normal app, without the browser around it</span>
      </span>
      <span class="more-chev">›</span>
    </button>`}
    <p class="more-later">DayFlow ${APP_VERSION}</p>
  `;
  const inst = container.querySelector("[data-install]");
  if (inst) inst.addEventListener("click", installApp);
  container.querySelectorAll("[data-more]").forEach((b) => b.addEventListener("click", () => {
    moreView = b.getAttribute("data-more");
    renderMore(container);
    window.scrollTo(0, 0);
  }));
}
