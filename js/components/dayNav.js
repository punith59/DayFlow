import { dateKey, keyToDate, addDays, WEEKDAY_NAMES, MONTH_NAMES } from "../utils.js";
import { openDatePicker } from "../modal.js";

export function dayNavArrowsHtml(selectedDate) {
  const today = dateKey();
  const d = keyToDate(selectedDate);
  const weekdayLabel = capitalize(WEEKDAY_NAMES[d.getDay()]);
  const monthDayLabel = `${MONTH_NAMES[d.getMonth()]} ${d.getDate()}${d.getFullYear() !== keyToDate(today).getFullYear() ? `, ${d.getFullYear()}` : ""}`;

  return `
    <div class="day-nav">
      <button class="day-nav-arrow" data-daynav="prev" aria-label="Previous day">‹</button>
      <button class="day-nav-label" data-daynav="pick" aria-label="Choose a date">
        <span class="day-nav-weekday">${weekdayLabel}</span>
        <span class="day-nav-date">${monthDayLabel}</span>
      </button>
      <button class="day-nav-arrow" data-daynav="next" aria-label="Next day">›</button>
    </div>
  `;
}

export function dayNavTodayButtonHtml(selectedDate) {
  const isToday = selectedDate === dateKey();
  return `<button class="btn day-today-btn" data-daynav="today" ${isToday ? "disabled" : ""}>Today</button>`;
}

export function dayNavHtml(selectedDate) {
  return `
    ${dayNavArrowsHtml(selectedDate)}
    <div class="day-today-row">${dayNavTodayButtonHtml(selectedDate)}</div>
  `;
}

/**
 * Wires up a day-nav block rendered via dayNavHtml() inside `scope`.
 * Calls onChange(newDateKey, direction) where direction is "next", "prev", or null (no-op distance).
 */
export function wireDayNav(scope, selectedDate, onChange) {
  scope.querySelector('[data-daynav="prev"]').addEventListener("click", () => {
    onChange(addDays(selectedDate, -1), "prev");
  });
  scope.querySelector('[data-daynav="next"]').addEventListener("click", () => {
    onChange(addDays(selectedDate, 1), "next");
  });
  scope.querySelector('[data-daynav="pick"]').addEventListener("click", () => {
    openDatePicker(selectedDate, (pickedKey) => {
      const direction = pickedKey === selectedDate ? null : pickedKey > selectedDate ? "next" : "prev";
      onChange(pickedKey, direction);
    });
  });
  const todayBtn = scope.querySelector('[data-daynav="today"]');
  if (todayBtn && !todayBtn.disabled) {
    todayBtn.addEventListener("click", () => {
      const today = dateKey();
      const direction = today === selectedDate ? null : today > selectedDate ? "next" : "prev";
      onChange(today, direction);
    });
  }
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
