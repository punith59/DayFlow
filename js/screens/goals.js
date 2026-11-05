// Goals: things you're working toward. A goal is a container you link tasks, events and deadlines to,
// optionally with targets (milestones, time to log, a date — any mix). It only reads what you've entered — it never
// schedules, suggests or nags, and a target is never flagged as missed.
import { store } from "../store.js";
import { escapeHtml, dateKey, formatDurationMins, TYPE_EMOJI } from "../utils.js";
import {
  goalList, goalById, goalStats, goalReadout, goalRows, goalRowIsAhead,
  goalNextUp, goalWeekRows, goalDateLine, goalWhen,
} from "../goals.js";
import { openGoalComposer, openGoalLogSheet, openMilestoneSheet, openResumeSheet } from "../components/goalSheet.js";
import { openCreateMenu } from "../forms.js";
import { notifyChanged } from "../components/sheet.js";
import { showUndoToast } from "../components/toast.js";
import { navigate } from "../router.js";
import { setTodaySelectedDate } from "./today.js";

let glView = null;          // id of the goal being viewed, or null for the list
let glShowAllEarlier = false;
const GL_EARLIER_LIMIT = 6;

const GL_STATUS_TITLE = { active: "Active", paused: "Paused", achieved: "Achieved" };

// List cards: one slim bar per measurable target.
function glBarHtml(st, big) {
  return st.bars.map((x) => `<span class="goal-bar ${big ? "big" : ""}"><i style="width:${x.pct}%"></i></span>`).join("");
}

function glAchievedLabel(g) {
  if (!g.achievedAt) return "Achieved";
  const d = new Date(g.achievedAt);
  return isNaN(d) ? "Achieved" : `Achieved ${d.toLocaleDateString(undefined, { day: "numeric", month: "short" })}`;
}

function glChipHtml(st) {
  const g = st.goal;
  if (g.status === "paused") return `<span class="goal-chip">Paused</span>`;
  if (g.status === "achieved") return `<span class="goal-chip goal-chip-done">✓ ${glAchievedLabel(g)}</span>`;
  if (st.reached) return `<span class="goal-chip goal-chip-done">Target reached</span>`;
  return "";
}

// ---------------- List ----------------

function glCardHtml(g) {
  const st = goalStats(g);
  const next = g.status === "active" ? goalNextUp(g.id) : null;
  const dateLine = g.status === "achieved" ? "" : goalDateLine(g);
  return `
    <button class="goal-card ${g.status}" data-goal="${g.id}" style="--c:${g.color}">
      <span class="goal-card-top">
        <span class="goal-card-name">${g.emoji ? `${g.emoji} ` : ""}${escapeHtml(g.name)}</span>
        ${glChipHtml(st)}
        <span class="more-chev">›</span>
      </span>
      <span class="goal-readout">${goalReadout(st)}</span>
      ${glBarHtml(st, false)}
      ${next ? `<span class="goal-next">Next: ${TYPE_EMOJI[next.kind]} ${escapeHtml(next.item.title)} · ${goalWhen(next)}</span>` : ""}
      ${dateLine ? `<span class="goal-next">${dateLine}</span>` : ""}
    </button>`;
}

function glRenderList(container) {
  const goals = goalList();
  const by = (s) => goals.filter((g) => g.status === s);
  const active = by("active");
  const summary = !goals.length ? "" : [
    active.length ? `${active.length} active` : "",
    by("paused").length ? `${by("paused").length} paused` : "",
    by("achieved").length ? `${by("achieved").length} achieved` : "",
  ].filter(Boolean).join(" · ");

  const section = (status) => {
    const list = by(status);
    if (!list.length) return "";
    return `
      <div class="goal-group">
        <div class="cal-sec-title">${GL_STATUS_TITLE[status]} <span class="cal-sec-count">${list.length}</span></div>
        ${list.map(glCardHtml).join("")}
      </div>`;
  };

  container.innerHTML = `
    <h1 class="page-date">Goals</h1>
    <p class="page-summary">${summary || "Things you're working toward."}</p>
    ${goals.length ? `${section("active")}${section("paused")}${section("achieved")}` : `
      <div class="placeholder-panel">
        <div class="placeholder-icon">◎</div>
        <div class="placeholder-title">No goals yet</div>
        <p class="placeholder-text">Tap + to add one. Link tasks, events and deadlines to it,<br>and set a target if you want one.</p>
      </div>`}
  `;

  container.querySelectorAll("[data-goal]").forEach((b) => b.addEventListener("click", () => {
    glView = b.getAttribute("data-goal");
    glShowAllEarlier = false;
    renderGoals(container);
    window.scrollTo(0, 0);
  }));
}

// ---------------- Detail ----------------

function glMark(r) {
  if (r.kind === "task") return { completed: "✓", skipped: "⤫", in_progress: "▶", paused: "⏸" }[r.state] || "";
  if (r.kind === "deadline") return r.state === "met" ? "✓" : r.state === "missed" ? "missed" : "";
  return "";
}

function glRowHtml(r) {
  const meta = [glMark(r), goalWhen(r)].filter(Boolean).join(" ");
  const dim = r.state === "completed" || r.state === "met";
  return `
    <button class="gd-row ${dim ? "dim" : ""}" data-day="${r.day}">
      <span class="cd-dot" style="background:${r.item.color || "#34C77B"}"></span>
      <span class="gd-title ${r.state === "skipped" ? "struck" : ""}">${TYPE_EMOJI[r.kind]} ${escapeHtml(r.item.title)}</span>
      <span class="cd-meta">${meta}</span>
    </button>`;
}

function glRenderDetail(container, g) {
  const st = goalStats(g);
  const rows = goalRows(g.id);
  const ahead = rows.filter(goalRowIsAhead);
  const earlierAll = rows.filter((r) => !goalRowIsAhead(r)).reverse();
  const earlier = glShowAllEarlier ? earlierAll : earlierAll.slice(0, GL_EARLIER_LIMIT);
  const manual = g.useTime ? g.manual.filter((m) => m.kind === "time").slice().reverse() : [];
  const weeks = st.timeMin > 0 ? goalWeekRows(g) : [];
  const dateLine = goalDateLine(g);
  const fmtManual = (m) => `+${formatDurationMins(Number(m.amount) || 0)}`;
  const bar = (k) => st.bars.find((x) => x.kind === k);
  const msBar = bar("milestones"), timeBar = bar("time");
  const msRow = (m) => `
    <div class="gd-row gd-ms ${m.doneAt ? "dim" : ""}">
      <button class="gd-check ${m.doneAt ? "on" : ""}" data-ms-toggle="${m.id}" aria-label="${m.doneAt ? "Mark not done" : "Mark done"}">${m.doneAt ? "✓" : ""}</button>
      <span class="gd-title ${m.doneAt ? "struck" : ""}">${escapeHtml(m.title)}</span>
      <button class="icon-btn gd-rm" data-ms-edit="${m.id}" aria-label="Edit milestone">✎</button>
    </div>`;
  const dayLabel = (ms) => new Date(ms).toLocaleDateString(undefined, { day: "numeric", month: "short" });

  const tile = (n, label) => `<div class="cd-count"><b>${n}</b><span>${label}</span></div>`;

  container.innerHTML = `
    <button class="tb-back" data-gl="back" aria-label="Back to goals">‹ Goals</button>

    <div class="gd-head" style="--c:${g.color}">
      <h1 class="gd-name">${g.emoji ? `<span>${g.emoji}</span> ` : ""}${escapeHtml(g.name)}</h1>
      ${glChipHtml(st)}
    </div>
    ${g.why ? `<p class="gd-why">${escapeHtml(g.why)}</p>` : ""}
    ${dateLine && g.status !== "achieved" ? `<p class="gd-dateline">${dateLine}</p>` : ""}

    ${g.useMilestones ? `
      <div class="cal-box-section gd-progress" style="--c:${g.color}">
        <div class="gd-big">${msBar ? msBar.label : "Milestones"}</div>
        ${msBar ? `<span class="goal-bar big"><i style="width:${msBar.pct}%"></i></span>` : ""}
        <div class="gd-ms-list">${g.milestones.map(msRow).join("")}</div>
        <div class="gd-prog-foot"><span>${msBar ? `${msBar.pct}%${msBar.reached ? " · all done" : ""}` : ""}</span><button class="btn" data-gl="ms-add">+ Milestone</button></div>
      </div>` : ""}

    ${g.useTime ? `
      <div class="cal-box-section gd-progress" style="--c:${g.color}">
        <div class="gd-big">${timeBar ? timeBar.label : "Time"}</div>
        ${timeBar ? `<span class="goal-bar big"><i style="width:${timeBar.pct}%"></i></span>` : ""}
        <div class="gd-prog-foot"><span>${timeBar ? `${timeBar.pct}%${timeBar.reached ? " · target reached" : ""}` : ""}</span><button class="btn" data-gl="log">+ Log time</button></div>
      </div>` : ""}

    <div class="cd-counts">
      ${tile(`${st.tasksDone}/${st.tasksTotal}`, "Tasks done")}
      ${tile(`${st.deadlinesMet}/${st.deadlinesTotal}`, "Deadlines met")}
      ${tile(st.timeMin > 0 ? formatDurationMins(st.timeMin) : "0m", "Time logged")}
    </div>

    ${rows.length ? "" : `<p class="cd-summary">Nothing is linked to this goal yet. Tap + to add a task for it, or choose this goal when you edit one.</p>`}
    ${st.linked.repeating ? `<p class="cd-summary gd-small">${st.linked.repeating} repeating item${st.linked.repeating === 1 ? " is" : "s are"} linked to this goal but not counted or listed yet.</p>` : ""}

    ${ahead.length ? `
      <div class="cal-box-section gd-list">
        <div class="cal-sec-title">Coming up <span class="cal-sec-count">${ahead.length}</span></div>
        ${ahead.map(glRowHtml).join("")}
      </div>` : ""}

    ${earlierAll.length ? `
      <div class="cal-box-section gd-list">
        <div class="cal-sec-title">Earlier &amp; finished <span class="cal-sec-count">${earlierAll.length}</span></div>
        ${earlier.map(glRowHtml).join("")}
        ${earlierAll.length > earlier.length ? `<button class="btn btn-ghost gd-more" data-gl="more">Show ${earlierAll.length - earlier.length} more</button>` : ""}
      </div>` : ""}

    ${manual.length ? `
      <div class="cal-box-section gd-list">
        <div class="cal-sec-title">Added by hand <span class="cal-sec-count">${manual.length}</span></div>
        ${manual.map((m) => `
          <div class="gd-row gd-manual">
            <span class="gd-title">${fmtManual(m)}</span>
            <span class="cd-meta">${dayLabel(m.at)}</span>
            <button class="icon-btn gd-rm" data-rm="${m.id}" aria-label="Remove this entry">✕</button>
          </div>`).join("")}
      </div>` : ""}

    ${weeks.length ? `
      <div class="cal-box-section gd-list">
        <div class="cal-sec-title">Time logged by week</div>
        ${weeks.map((w) => `<div class="gd-row"><span class="gd-title">${w.label}</span><span class="cd-meta">${w.mins > 0 ? formatDurationMins(w.mins) : "—"}</span></div>`).join("")}
      </div>` : ""}

    <div class="gd-actions">
      <button class="btn" data-gl="edit">Edit</button>
      ${g.status === "achieved" ? `<button class="btn" data-gl="reopen">Reopen</button>` : `
        <button class="btn" data-gl="${g.status === "paused" ? "resume" : "pause"}">${g.status === "paused" ? "Resume" : "Pause"}</button>
        <button class="btn btn-primary" data-gl="achieve">Mark achieved</button>`}
      <button class="btn btn-danger" data-gl="delete">Delete</button>
    </div>
  `;

  const on = (k, fn) => { const el = container.querySelector(`[data-gl="${k}"]`); if (el) el.addEventListener("click", fn); };
  const setStatus = (patch, undoPatch, msg) => {
    store.updateGoal(g.id, patch);
    notifyChanged();
    showUndoToast(msg, () => { store.updateGoal(g.id, undoPatch); notifyChanged(); });
  };

  on("back", () => { glView = null; renderGoals(container); window.scrollTo(0, 0); });
  on("edit", () => openGoalComposer(g));
  on("log", () => openGoalLogSheet(g));
  on("ms-add", () => openMilestoneSheet(g.id, null));
  container.querySelectorAll("[data-ms-toggle]").forEach((b) => b.addEventListener("click", () => {
    const id = b.getAttribute("data-ms-toggle");
    const before = store.getGoals().find((x) => x.id === g.id).milestones || [];
    const m = before.find((x) => x.id === id);
    store.updateGoal(g.id, { milestones: before.map((x) => (x.id === id ? { ...x, doneAt: x.doneAt ? null : Date.now() } : x)) });
    notifyChanged();
    showUndoToast(m && m.doneAt ? "Marked not done" : "Milestone done", () => { store.updateGoal(g.id, { milestones: before }); notifyChanged(); });
  }));
  container.querySelectorAll("[data-ms-edit]").forEach((b) => b.addEventListener("click", () => {
    const m = g.milestones.find((x) => x.id === b.getAttribute("data-ms-edit"));
    if (m) openMilestoneSheet(g.id, m);
  }));
  on("more", () => { glShowAllEarlier = true; renderGoals(container); });
  on("pause", () => setStatus({ status: "paused" }, { status: g.status }, "Goal paused"));
  on("resume", () => openResumeSheet(g, (patch) => {
    const raw = store.getGoals().find((x) => x.id === g.id) || {};
    const undo = { status: "paused" };
    Object.keys(patch).forEach((k) => { undo[k] = raw[k] === undefined ? null : raw[k]; });
    setStatus({ status: "active", ...patch }, undo, "Goal resumed");
  }));
  on("achieve", () => setStatus({ status: "achieved", achievedAt: Date.now() }, { status: g.status, achievedAt: g.achievedAt || null }, "Goal marked achieved"));
  on("reopen", () => setStatus({ status: "active", achievedAt: null }, { status: "achieved", achievedAt: g.achievedAt || null }, "Goal reopened"));
  on("delete", () => {
    const removed = store.deleteGoal(g.id);
    glView = null;
    notifyChanged();
    showUndoToast("Goal deleted", () => { store.restoreGoal(removed); notifyChanged(); }, 6000);
  });

  container.querySelectorAll("[data-rm]").forEach((b) => b.addEventListener("click", () => {
    const before = g.manual;
    store.removeGoalProgress(g.id, b.getAttribute("data-rm"));
    notifyChanged();
    showUndoToast("Entry removed", () => { store.updateGoal(g.id, { manual: before }); notifyChanged(); });
  }));

  // Tapping a linked item opens its day in Today, where it can be acted on.
  container.querySelectorAll("[data-day]").forEach((b) => b.addEventListener("click", () => {
    setTodaySelectedDate(b.getAttribute("data-day"));
    navigate("today");
  }));
}

// ---------------- Entry points ----------------

export function renderGoals(container) {
  const g = glView ? goalById(glView) : null;
  if (glView && !g) glView = null; // the goal is gone (deleted, or replaced by a restore)
  if (g) glRenderDetail(container, g);
  else glRenderList(container);
}

// What the + button does here: add to the goal being viewed, or start a new goal.
export function goalsFabAction() {
  const g = glView ? goalById(glView) : null;
  if (g) openCreateMenu(dateKey(), g.id);
  else openGoalComposer(null);
}
