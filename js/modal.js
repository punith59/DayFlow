import { store } from "./store.js";
import { dateKey, keyToDate, escapeHtml, MONTH_NAMES, WEEKDAY_SHORT } from "./utils.js";
import { openSheet, closeSheet, wireSheetClose, sheet } from "./components/sheet.js";

export function openAddMenu() {
  openSheet(`
    <button class="icon-btn sheet-close" data-action="close" aria-label="Close">✕</button>
    <h2 class="sheet-title">Add</h2>
    <p class="placeholder-text">Tasks, events, and deadlines are ready from Today and Calendar,
    and diary entries from Diary. This section's own quick-add is still on the way.</p>
  `);
  wireSheetClose();
}

// ---------------- Date picker (month calendar) ----------------
export function openDatePicker(selectedDateKey, onPick) {
  const startDate = keyToDate(selectedDateKey);
  let viewYear = startDate.getFullYear();
  let viewMonthIndex = startDate.getMonth();

  function render() {
    const todayKeyStr = dateKey();
    const daysInMonth = new Date(viewYear, viewMonthIndex + 1, 0).getDate();
    const firstWeekday = new Date(viewYear, viewMonthIndex, 1).getDay();
    const monthLabel = `${MONTH_NAMES[viewMonthIndex]} ${viewYear}`;

    let cells = "";
    for (let i = 0; i < firstWeekday; i++) cells += `<div class="dp-cell dp-empty"></div>`;
    for (let day = 1; day <= daysInMonth; day++) {
      const key = dateKey(new Date(viewYear, viewMonthIndex, day));
      const isSelected = key === selectedDateKey;
      const isToday = key === todayKeyStr;
      cells += `<button type="button" class="dp-cell ${isSelected ? "selected" : ""} ${isToday ? "is-today" : ""}" data-date="${key}">${day}</button>`;
    }

    openSheet(`
      <button class="icon-btn sheet-close" data-action="close" aria-label="Close">✕</button>
      <h2 class="sheet-title">Jump to a day</h2>
      <div class="dp-header">
        <button class="icon-btn" id="dp-prev" aria-label="Previous month">‹</button>
        <span class="dp-month-label">${monthLabel}</span>
        <button class="icon-btn" id="dp-next" aria-label="Next month">›</button>
      </div>
      <div class="dp-weekdays">${WEEKDAY_SHORT.map((w) => `<span>${w}</span>`).join("")}</div>
      <div class="dp-grid">${cells}</div>
      <div class="btn-row" style="justify-content:center;">
        <button class="btn" id="dp-jump-today">Jump to today</button>
      </div>
    `);

    wireSheetClose();
    document.getElementById("dp-prev").addEventListener("click", () => {
      viewMonthIndex--;
      if (viewMonthIndex < 0) { viewMonthIndex = 11; viewYear--; }
      render();
    });
    document.getElementById("dp-next").addEventListener("click", () => {
      viewMonthIndex++;
      if (viewMonthIndex > 11) { viewMonthIndex = 0; viewYear++; }
      render();
    });
    document.getElementById("dp-jump-today").addEventListener("click", () => {
      closeSheet();
      onPick(todayKeyStr);
    });
    sheet.querySelectorAll("[data-date]").forEach((el) => {
      el.addEventListener("click", () => {
        const key = el.getAttribute("data-date");
        closeSheet();
        onPick(key);
      });
    });
  }

  render();
}
