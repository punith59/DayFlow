import { store } from "../store.js";
import { renderTimeBlocksManager } from "./timeBlocks.js";
import { renderPalette } from "./palette.js";
import { renderBackup } from "./backup.js";
import { APP_VERSION } from "../version.js";

let moreView = "home"; // "home" | "blocks" | "palette" | "backup"

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
    <p class="more-later">DayFlow ${APP_VERSION}</p>
  `;
  container.querySelectorAll("[data-more]").forEach((b) => b.addEventListener("click", () => {
    moreView = b.getAttribute("data-more");
    renderMore(container);
    window.scrollTo(0, 0);
  }));
}
