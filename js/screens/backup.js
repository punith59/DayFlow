// More → Backup & restore: save all data to a JSON file, and restore from one.
// Restoring always asks first, shows what will change, and can be undone.
import { store } from "../store.js";
import { dateKey, escapeHtml } from "../utils.js";
import { openSheet, closeSheet, wireSheetClose, notifyChanged } from "../components/sheet.js";
import { showToast, showUndoToast } from "../components/toast.js";
import { isValidClientId, loadGis, getToken, forgetToken, findBackup, uploadBackup, downloadBackup } from "../drive.js";

const LABELS = {
  tasks: "Tasks", events: "Events", deadlines: "Deadlines", notes: "Diary notes", notebooks: "Notebooks", goals: "Goals",
  timeBlocks: "Time blocks", blockExceptions: "Days off", palette: "Saved colours", colorHistory: "Colour history",
  college: "Old college schedule", settings: "Settings",
};
const COUNT_ORDER = ["tasks", "events", "deadlines", "notes", "notebooks", "timeBlocks", "blockExceptions", "goals", "palette", "colorHistory"];

// Session-only: the state just before the most recent restore, so it can still be undone after the toast is gone.
let lastRestore = null;

function countOf(value) {
  if (Array.isArray(value)) return value.length;
  if (value && typeof value === "object") return Object.values(value).some((v) => (Array.isArray(v) ? v.length : v != null)) ? 1 : 0;
  return 0;
}

function fmtWhen(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return null;
  return d.toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
}

function currentCounts() {
  const all = store.exportAll();
  return COUNT_ORDER.map((k) => ({ key: k, label: LABELS[k], n: countOf(all[k]) }));
}

function download(json, filename) {
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function makeBackupFile() {
  const json = JSON.stringify(store.exportAll(), null, 2);
  return { json, filename: `dayflow-backup-${dateKey()}.json` };
}

function markExported() {
  store.saveMeta({ ...store.getMeta(), lastExportAt: new Date().toISOString() });
}

function canShareFiles() {
  try {
    if (!navigator.canShare || !navigator.share) return false;
    return navigator.canShare({ files: [new File(["{}"], "x.json", { type: "application/json" })] });
  } catch (e) { return false; }
}

function openRestorePreview(fileName, data, clean, onDone) {
  const now = store.exportAll();
  const rows = COUNT_ORDER.filter((k) => k in clean).map((k) => `
    <div class="bk-row"><span>${LABELS[k]}</span><span class="bk-nums">${countOf(clean[k])}<small> in file · ${countOf(now[k])} now</small></span></div>`).join("");
  const extra = ["settings", "college"].filter((k) => k in clean).map((k) => LABELS[k]);
  const when = data.exportedAt ? fmtWhen(data.exportedAt) : null;
  const ver = data.appVersion ? ` · DayFlow ${escapeHtml(data.appVersion)}` : "";

  openSheet(`
    <button class="icon-btn sheet-close" data-action="close" aria-label="Close">✕</button>
    <h2 class="sheet-title">Restore this backup?</h2>
    <p class="bk-file">${escapeHtml(fileName)}${when ? `<br><small>Saved ${escapeHtml(when)}${ver}</small>` : ""}</p>
    <div class="bk-rows">${rows}</div>
    ${extra.length ? `<p class="bk-note">Also included: ${extra.join(", ").toLowerCase()}.</p>` : ""}
    <p class="bk-note">This replaces the matching data in DayFlow with what's in the file. Anything the file doesn't contain stays as it is. You can undo it right after.</p>
    <div class="btn-row">
      <button class="btn" id="bk-cancel">Cancel</button>
      <button class="btn btn-danger" id="bk-confirm">Replace my data</button>
    </div>
  `);
  wireSheetClose();
  document.getElementById("bk-cancel").addEventListener("click", closeSheet);
  document.getElementById("bk-confirm").addEventListener("click", () => {
    let before;
    try {
      before = store.importAll(data);
    } catch (e) {
      closeSheet();
      showToast(e.message || "Couldn't restore this backup", 4000);
      return;
    }
    closeSheet();
    lastRestore = before;
    const undo = () => { store.restoreRawSnapshot(before); lastRestore = null; applyAccent(); notifyChanged(); onDone(); };
    applyAccent();
    notifyChanged();
    onDone();
    showUndoToast("Backup restored", undo, 9000);
  });
}

function applyAccent() {
  const accent = store.getSettings().accent;
  if (accent) document.documentElement.style.setProperty("--accent", accent);
}

function handleText(name, text, onDone) {
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    showToast("That file couldn't be read as a DayFlow backup", 3500);
    return;
  }
  try {
    const clean = store.prepareBackup(data);
    openRestorePreview(name, data, clean, onDone);
  } catch (e) {
    showToast(e.message, 4200);
  }
}

async function handleFile(file, onDone) {
  if (!file) return;
  handleText(file.name, await file.text(), onDone);
}

const DRIVE_STEPS = `
  <ol class="bk-steps">
    <li>Open <b>console.cloud.google.com</b> and create a project (any name).</li>
    <li><b>APIs &amp; Services → Library</b>: search for <b>Google Drive API</b> and click Enable.</li>
    <li><b>OAuth consent screen</b> (Google Auth Platform): choose External, fill in the app name and your email, and under Test users add your own Google account.</li>
    <li><b>Credentials → Create credentials → OAuth client ID</b>, type <b>Web application</b>. Under <b>Authorized JavaScript origins</b> add <b>${escapeHtml(location.origin)}</b> (no path, no trailing slash).</li>
    <li>Copy the Client ID (it ends in <b>.apps.googleusercontent.com</b>) and paste it above.</li>
  </ol>
  <p class="bk-note">DayFlow asks only for access to files it creates itself, so it can't see the rest of your Drive. The backup is one file called "DayFlow backup.json"; Drive keeps earlier versions of it.</p>`;

function driveSectionHtml(meta) {
  if (!meta.driveClientId) {
    return `
    <div class="cal-box-section" id="bk-drive">
      <div class="cal-sec-title">Google Drive</div>
      <p class="bk-note" style="margin-top:0">Optional. Two buttons, nothing automatic: back up to your Drive, or restore from it. You set it up once with your own Google client ID.</p>
      <div class="field"><input id="bk-cid" type="text" inputmode="url" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Paste your Client ID" /></div>
      <div class="tb-actions bk-actions"><button class="btn btn-primary" data-bk="cid-save">Save client ID</button></div>
      <details class="bk-help"><summary>How to get a client ID</summary>${DRIVE_STEPS}</details>
    </div>`;
  }
  const last = meta.lastDriveAt ? fmtWhen(meta.lastDriveAt) : null;
  return `
    <div class="cal-box-section" id="bk-drive">
      <div class="cal-sec-title">Google Drive</div>
      <div class="tb-actions bk-actions">
        <button class="btn btn-primary" data-bk="drive-up">Back up to Drive</button>
        <button class="btn" data-bk="drive-down">Restore from Drive…</button>
      </div>
      <p class="bk-meta" id="bk-drive-status">${last ? `Last Drive backup from this device: ${escapeHtml(last)}` : "No Drive backup made from this device yet."}</p>
      <div class="tb-actions bk-actions"><button class="btn btn-ghost" data-bk="cid-clear">Change client ID / sign out</button></div>
    </div>`;
}

function wireDrive(container, refresh) {
  const $ = (k) => container.querySelector(`[data-bk="${k}"]`);
  const meta = store.getMeta();
  const saveBtn = $("cid-save");
  if (saveBtn) {
    saveBtn.addEventListener("click", () => {
      const v = container.querySelector("#bk-cid").value.trim();
      if (!isValidClientId(v)) { showToast("That doesn't look like a client ID. It ends in .apps.googleusercontent.com", 4200); return; }
      store.saveMeta({ ...store.getMeta(), driveClientId: v });
      showToast("Client ID saved");
      refresh();
    });
    return;
  }
  loadGis().catch(() => {}); // preload so the sign-in popup opens straight from the tap

  const status = container.querySelector("#bk-drive-status");
  const buttons = [$("drive-up"), $("drive-down"), $("cid-clear")];
  let busy = false;
  const run = (label, fn) => async () => {
    if (busy) return;
    busy = true;
    buttons.forEach((b) => { b.disabled = true; });
    const prev = status.textContent;
    status.textContent = label;
    try {
      await fn();
    } catch (e) {
      status.textContent = prev;
      showToast(e.message || "Something went wrong with Google Drive", 4800);
    } finally {
      busy = false;
      buttons.forEach((b) => { if (b.isConnected) b.disabled = false; });
    }
  };
  const tokenNow = async () => {
    await loadGis();
    return getToken(store.getMeta().driveClientId);
  };

  $("drive-up").addEventListener("click", run("Backing up…", async () => {
    const t = await tokenNow();
    await uploadBackup(t, JSON.stringify(store.exportAll(), null, 2));
    store.saveMeta({ ...store.getMeta(), lastDriveAt: new Date().toISOString() });
    showToast("Backed up to Google Drive");
    refresh();
  }));

  $("drive-down").addEventListener("click", run("Looking in Drive…", async () => {
    const t = await tokenNow();
    const f = await findBackup(t);
    if (!f) { status.textContent = "No DayFlow backup found in this Google account's Drive."; showToast("No DayFlow backup found in Drive", 3500); return; }
    const text = await downloadBackup(t, f.id);
    status.textContent = meta.lastDriveAt ? `Last Drive backup from this device: ${fmtWhen(meta.lastDriveAt)}` : "No Drive backup made from this device yet.";
    handleText(f.name, text, refresh);
  }));

  $("cid-clear").addEventListener("click", () => {
    if (busy) return;
    forgetToken();
    const m = { ...store.getMeta() };
    delete m.driveClientId;
    delete m.lastDriveAt;
    store.saveMeta(m);
    showToast("Signed out of Google Drive");
    refresh();
  });
}

export function renderBackup(container, onBack) {
  const meta = store.getMeta();
  const last = meta.lastExportAt ? fmtWhen(meta.lastExportAt) : null;
  const counts = currentCounts();
  const canShare = canShareFiles();

  container.innerHTML = `
    <button class="tb-back" data-bk="back">‹ More</button>
    <h1 class="page-date">Backup &amp; restore</h1>
    <p class="page-summary">Your data lives only in this browser on this device. A backup file is a copy you can keep anywhere — and restore from if the app or browser data is ever cleared.</p>

    <div class="cal-box-section">
      <div class="cal-sec-title">In DayFlow now</div>
      <div class="bk-stats">${counts.map((c) => `<div class="bk-stat"><b>${c.n}</b><span>${c.label}</span></div>`).join("")}</div>
      <p class="bk-meta">${last ? `Last backup file saved: ${escapeHtml(last)}` : "No backup file saved from this device yet."}</p>
    </div>

    <div class="tb-actions bk-actions">
      <button class="btn btn-primary" data-bk="save">Save backup file</button>
      ${canShare ? `<button class="btn" data-bk="share">Share…</button>` : ""}
    </div>
    <div class="tb-actions bk-actions">
      <button class="btn" data-bk="import">Restore from file…</button>
      ${lastRestore ? `<button class="btn btn-ghost" data-bk="undo">Undo last restore</button>` : ""}
    </div>
    <input type="file" id="bk-file" accept=".json,application/json" hidden />
    ${driveSectionHtml(meta)}
    <p class="bk-meta" id="bk-storage"></p>
  `;

  // Only redraw if this page is still the one on screen (an Undo can outlive it).
  const refresh = () => { if (container.querySelector('[data-bk="back"]') && container.querySelector("#bk-file")) renderBackup(container, onBack); };
  const $ = (k) => container.querySelector(`[data-bk="${k}"]`);

  $("back").addEventListener("click", onBack);

  $("save").addEventListener("click", () => {
    const { json, filename } = makeBackupFile();
    download(json, filename);
    markExported();
    showToast("Backup file saved — check your Downloads");
    refresh();
  });

  if (canShare) {
    $("share").addEventListener("click", async () => {
      const { json, filename } = makeBackupFile();
      try {
        await navigator.share({ files: [new File([json], filename, { type: "application/json" })], title: "DayFlow backup" });
        markExported();
        refresh();
      } catch (e) {
        if (e && e.name !== "AbortError") showToast("Couldn't open the share sheet — try Save backup file", 3500);
      }
    });
  }

  const input = container.querySelector("#bk-file");
  $("import").addEventListener("click", () => { input.value = ""; input.click(); });
  input.addEventListener("change", () => handleFile(input.files[0], refresh));

  const undoBtn = $("undo");
  if (undoBtn) undoBtn.addEventListener("click", () => {
    store.restoreRawSnapshot(lastRestore);
    lastRestore = null;
    applyAccent();
    notifyChanged();
    showToast("Restore undone");
    refresh();
  });

  wireDrive(container, refresh);

  // Plain status line about whether the browser promises to keep this data.
  const line = container.querySelector("#bk-storage");
  if (navigator.storage && navigator.storage.persisted) {
    navigator.storage.persisted().then((p) => {
      line.textContent = p
        ? "Browser storage: protected from automatic clearing."
        : "Browser storage: the browser may clear it if the device runs low on space. A backup file is the safe copy.";
    }).catch(() => {});
  }
}
