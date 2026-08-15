/* WorkPay direct calendar editing
   Lets every visible calendar date open the Add/Edit Day sheet, including
   dates that belong to completed pay cycles. A prominent editor button toggles
   an ordinary day from the weekly template with overtime disabled.
*/
(function () {
    "use strict";

    const STORE = {
        SETTINGS: "paycalc_settings_v2",
        ENTRIES: "paycalc_entries_v2",
        HISTORY: "paycalc_history_v1"
    };
    const DEDUCT_BREAK_KEY = "workpay_deduct_break_v1";
    const NORMAL_DAY_STATE_KEY = "workpay_normal_days_v1";

    const calendar = document.getElementById("cycleCalendar");
    const editSheet = document.getElementById("editSheet");
    const editForm = document.getElementById("editForm");
    const editTitle = document.getElementById("editSheetTitle");
    const closeEditBtn = document.getElementById("closeEditBtn");
    const cancelEditBtn = document.getElementById("ed_cancel");

    if (!calendar || !editSheet || !editForm || !editTitle) return;

    const fields = {
        id: document.getElementById("ed_id"),
        date: document.getElementById("ed_date"),
        holiday: document.getElementById("ed_holiday"),
        holidayChoice: document.getElementById("ed_holidayChoice"),
        holidayWorked: document.getElementById("ed_holidayWorked"),
        holidayHint: document.getElementById("ed_holidayHint"),
        normalDay: document.getElementById("ed_normalDay"),
        start: document.getElementById("ed_start"),
        end: document.getElementById("ed_end"),
        breakMin: document.getElementById("ed_break"),
        paidOffControl: document.getElementById("ed_paidOffControl"),
        paidOff: document.getElementById("ed_paidOff"),
        applyOt: document.getElementById("ed_applyOt"),
        useGlobal: document.getElementById("ed_useGlobal"),
        overrides: document.getElementById("ed_overrides"),
        hourly: document.getElementById("ed_hourly"),
        otThreshold: document.getElementById("ed_otTh"),
        otMultiplier: document.getElementById("ed_otMul"),
        sundayMultiplier: document.getElementById("ed_sunMul"),
        holidayMultiplier: document.getElementById("ed_holMul")
    };

    if (Object.values(fields).some(field => !field)) return;

    let pendingHistoricalEdit = null;
    let normalDaySaveTimer = null;
    let pendingNormalDaySave = null;

    function readJson(key, fallback) {
        try {
            const value = JSON.parse(localStorage.getItem(key));
            return value === null ? fallback : value;
        } catch {
            return fallback;
        }
    }

    function writeHistoricalMove(active, history) {
        const previousEntries = localStorage.getItem(STORE.ENTRIES);
        const previousHistory = localStorage.getItem(STORE.HISTORY);
        try {
            localStorage.setItem(STORE.ENTRIES, JSON.stringify(active));
            localStorage.setItem(STORE.HISTORY, JSON.stringify(history));
            return true;
        } catch {
            try {
                if (previousEntries === null) localStorage.removeItem(STORE.ENTRIES);
                else localStorage.setItem(STORE.ENTRIES, previousEntries);
                if (previousHistory === null) localStorage.removeItem(STORE.HISTORY);
                else localStorage.setItem(STORE.HISTORY, previousHistory);
            } catch {}
            window.alert("WorkPay could not save this day. Please check browser storage and try again.");
            return false;
        }
    }

    function readNormalDayState() {
        const state = readJson(NORMAL_DAY_STATE_KEY, {});
        return state && typeof state === "object" && !Array.isArray(state) ? state : {};
    }

    function writeNormalDayState(state, showAlert = true) {
        try {
            if (Object.keys(state).length) {
                localStorage.setItem(NORMAL_DAY_STATE_KEY, JSON.stringify(state));
            } else {
                localStorage.removeItem(NORMAL_DAY_STATE_KEY);
            }
            return true;
        } catch {
            if (showAlert) {
                window.alert("WorkPay could not remember this Normal Day. Please check browser storage and try again.");
            }
            return false;
        }
    }

    function restoreStoredValue(key, value) {
        try {
            if (value === null) localStorage.removeItem(key);
            else localStorage.setItem(key, value);
        } catch {}
    }

    function writeNormalDayCancellation(active, history, state) {
        const previousEntries = localStorage.getItem(STORE.ENTRIES);
        const previousHistory = localStorage.getItem(STORE.HISTORY);
        const previousNormalDays = localStorage.getItem(NORMAL_DAY_STATE_KEY);
        try {
            localStorage.setItem(STORE.ENTRIES, JSON.stringify(active));
            localStorage.setItem(STORE.HISTORY, JSON.stringify(history));
            if (Object.keys(state).length) {
                localStorage.setItem(NORMAL_DAY_STATE_KEY, JSON.stringify(state));
            } else {
                localStorage.removeItem(NORMAL_DAY_STATE_KEY);
            }
            return true;
        } catch {
            restoreStoredValue(STORE.ENTRIES, previousEntries);
            restoreStoredValue(STORE.HISTORY, previousHistory);
            restoreStoredValue(NORMAL_DAY_STATE_KEY, previousNormalDays);
            window.alert("WorkPay could not cancel this Normal Day. Your saved data was left unchanged.");
            return false;
        }
    }

    function clamp(value, min, max) {
        const number = Number(value);
        if (!Number.isFinite(number)) return min;
        return Math.max(min, Math.min(max, number));
    }

    function parseInputDate(dateStr) {
        if (typeof dateStr !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
        const [year, month, day] = dateStr.split("-").map(Number);
        const date = new Date(year, month - 1, day);
        if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
        return date;
    }

    function localDateKey(value) {
        const date = value instanceof Date ? value : new Date(value);
        if (Number.isNaN(date.getTime())) return "";
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const day = String(date.getDate()).padStart(2, "0");
        return `${year}-${month}-${day}`;
    }

    function inputDateToIso(dateStr) {
        const date = parseInputDate(dateStr) || new Date();
        return new Date(date.getFullYear(), date.getMonth(), date.getDate()).toISOString();
    }

    function addDays(value, days) {
        const date = value instanceof Date ? new Date(value) : new Date(value);
        date.setDate(date.getDate() + days);
        return date;
    }

    function easterSunday(year) {
        const a = year % 19;
        const b = Math.floor(year / 100);
        const c = year % 100;
        const d = Math.floor(b / 4);
        const e = b % 4;
        const f = Math.floor((b + 8) / 25);
        const g = Math.floor((b - f + 1) / 3);
        const h = (19 * a + b - d - g + 15) % 30;
        const i = Math.floor(c / 4);
        const k = c % 4;
        const l = (32 + 2 * e + 2 * i - h - k) % 7;
        const m = Math.floor((a + 11 * h + 22 * l) / 451);
        const month = Math.floor((h + l - 7 * m + 114) / 31) - 1;
        const day = ((h + l - 7 * m + 114) % 31) + 1;
        return new Date(year, month, day);
    }

    function isAutoHoliday(dateStr) {
        const date = parseInputDate(dateStr);
        if (!date) return false;

        const holidays = new Set();
        const register = holiday => {
            holidays.add(localDateKey(holiday));
            if (holiday.getDay() === 0) holidays.add(localDateKey(addDays(holiday, 1)));
        };

        [
            [0, 1], [2, 21], [3, 27], [4, 1], [5, 16],
            [7, 9], [8, 24], [11, 16], [11, 25], [11, 26]
        ].forEach(([month, day]) => register(new Date(date.getFullYear(), month, day)));

        const easter = easterSunday(date.getFullYear());
        register(addDays(easter, -2));
        register(addDays(easter, 1));
        return holidays.has(dateStr);
    }

    function findSavedRow(dateStr) {
        const active = readJson(STORE.ENTRIES, []);
        const activeRow = (Array.isArray(active) ? active : []).find(row => localDateKey(row.dateISO) === dateStr);
        if (activeRow) return { row: activeRow, historical: false };

        const history = readJson(STORE.HISTORY, []);
        for (const [cycleIndex, cycle] of (Array.isArray(history) ? history : []).entries()) {
            const row = (Array.isArray(cycle.entries) ? cycle.entries : []).find(item => localDateKey(item.dateISO) === dateStr);
            if (row) {
                return {
                    row,
                    historical: true,
                    cycleKey: cycle.key || null,
                    cycleIndex
                };
            }
        }
        return null;
    }

    function readBool(key, fallback) {
        try {
            const value = localStorage.getItem(key);
            if (value === null) return fallback;
            return value === "true";
        } catch {
            return fallback;
        }
    }

    function renderNormalDayButton(selected, dateStr = fields.date.value) {
        fields.normalDay.dataset.date = dateStr || "";
        fields.normalDay.classList.toggle("is-confirmed", selected);
        fields.normalDay.setAttribute("aria-pressed", selected ? "true" : "false");
        const label = fields.normalDay.querySelector("strong");
        if (label) label.textContent = selected ? "Normal Day Selected" : "Save Normal Day";
    }

    function resetNormalDayButton() {
        if (normalDaySaveTimer !== null) {
            window.clearTimeout(normalDaySaveTimer);
            normalDaySaveTimer = null;
        }
        pendingNormalDaySave = null;
        fields.normalDay.dataset.saving = "false";
        renderNormalDayButton(false, "");
    }

    function hasNormalDayShape(row) {
        return !!row
            && !row.isHoliday
            && !row.paidOff
            && row.applyOvertime === false
            && (!row.overrides || row.overrides.useGlobal !== false);
    }

    function matchesConfiguredNormalDay(row, dateStr, settings) {
        const date = parseInputDate(dateStr);
        if (!date || !hasNormalDayShape(row)) return false;
        const template = Array.isArray(settings.weekTemplate)
            ? (settings.weekTemplate[date.getDay()] || {})
            : {};
        const expectedBreak = readBool(DEDUCT_BREAK_KEY, true)
            ? clamp(settings.defaultBreak ?? 60, 0, 1440)
            : 0;
        return !!template.start
            && !!template.end
            && row.start === template.start
            && row.end === template.end
            && Number(row.breakMin) === expectedBreak;
    }

    function markerForSavedRow(saved) {
        if (!saved) return null;
        return {
            historical: !!saved.historical,
            cycleKey: saved.cycleKey || null,
            cycleIndex: Number.isInteger(saved.cycleIndex) ? saved.cycleIndex : null,
            row: saved.row
        };
    }

    function syncNormalDayButton(dateStr = fields.date.value) {
        if (!parseInputDate(dateStr)) {
            renderNormalDayButton(false, dateStr);
            return;
        }

        const saved = findSavedRow(dateStr);
        const settings = readJson(STORE.SETTINGS, {});
        const state = readNormalDayState();
        let marker = state[dateStr] || null;

        if (marker && (!saved || !hasNormalDayShape(saved.row))) {
            delete state[dateStr];
            writeNormalDayState(state, false);
            marker = null;
        }

        if (!marker && saved && matchesConfiguredNormalDay(saved.row, dateStr, settings)) {
            marker = {
                entryId: saved.row.id || null,
                previous: null
            };
            state[dateStr] = marker;
            writeNormalDayState(state, false);
        } else if (marker && saved && marker.entryId !== (saved.row.id || null)) {
            marker.entryId = saved.row.id || null;
            state[dateStr] = marker;
            writeNormalDayState(state, false);
        }

        renderNormalDayButton(!!marker && !!saved, dateStr);
    }

    function removeOneSavedRow(active, history, dateStr, entryId) {
        let removed = false;
        const matches = row => {
            if (removed) return false;
            const same = entryId
                ? row.id === entryId
                : localDateKey(row.dateISO) === dateStr;
            if (same) removed = true;
            return same;
        };

        const cleanActive = (Array.isArray(active) ? active : []).filter(row => !matches(row));
        const cleanHistory = (Array.isArray(history) ? history : []).map(cycle => ({
            ...cycle,
            entries: (Array.isArray(cycle.entries) ? cycle.entries : []).filter(row => !matches(row))
        }));
        return { active: cleanActive, history: cleanHistory };
    }

    function restorePreviousRow(active, history, previous) {
        if (!previous?.row) return { active, history };

        if (!previous.historical) {
            return { active: [...active, previous.row], history };
        }

        let restored = false;
        const restoredHistory = history.map((cycle, index) => {
            const sameCycle = previous.cycleKey
                ? cycle.key === previous.cycleKey
                : index === previous.cycleIndex;
            if (!sameCycle) return cycle;
            restored = true;
            return {
                ...cycle,
                entries: [...(Array.isArray(cycle.entries) ? cycle.entries : []), previous.row]
            };
        });

        return restored
            ? { active, history: restoredHistory }
            : { active: [...active, previous.row], history: restoredHistory };
    }

    function cancelNormalDayFromEditor(dateStr) {
        const state = readNormalDayState();
        const marker = state[dateStr];
        const saved = findSavedRow(dateStr);

        if (!marker || !saved) {
            delete state[dateStr];
            writeNormalDayState(state, false);
            renderNormalDayButton(false, dateStr);
            return;
        }

        const active = readJson(STORE.ENTRIES, []);
        const history = readJson(STORE.HISTORY, []);
        const removed = removeOneSavedRow(
            Array.isArray(active) ? active : [],
            Array.isArray(history) ? history : [],
            dateStr,
            marker.entryId || saved.row.id || null
        );
        const restored = restorePreviousRow(removed.active, removed.history, marker.previous);
        delete state[dateStr];

        if (!writeNormalDayCancellation(restored.active, restored.history, state)) return;

        fields.normalDay.dataset.saving = "true";
        renderNormalDayButton(false, dateStr);
        editSheet.setAttribute("aria-hidden", "true");
        document.dispatchEvent(new CustomEvent("workpay:data-changed"));
    }

    function saveNormalDayFromEditor() {
        if (fields.normalDay.dataset.saving === "true") return;
        const dateStr = fields.date.value;
        if (fields.normalDay.getAttribute("aria-pressed") === "true") {
            cancelNormalDayFromEditor(dateStr);
            return;
        }
        const date = parseInputDate(dateStr);
        if (!date) {
            window.alert("Please choose a valid date.");
            return;
        }
        if (date.getDay() === 0 || isAutoHoliday(dateStr)) {
            window.alert("This is a Sunday or public holiday. Use the detailed fields so WorkPay can apply the correct special-day pay.");
            return;
        }

        const settings = readJson(STORE.SETTINGS, {});
        const template = Array.isArray(settings.weekTemplate)
            ? (settings.weekTemplate[date.getDay()] || {})
            : {};
        const start = template.start || fields.start.value;
        const end = template.end || fields.end.value;
        if (!start || !end) {
            window.alert("Set the normal start and end time for this weekday in Settings first.");
            return;
        }

        fields.start.value = start;
        fields.end.value = end;
        fields.breakMin.value = readBool(DEDUCT_BREAK_KEY, true)
            ? clamp(settings.defaultBreak ?? 60, 0, 1440)
            : 0;
        fields.holiday.checked = false;
        fields.holidayWorked.checked = false;
        fields.paidOff.checked = false;
        fields.applyOt.checked = false;
        fields.useGlobal.checked = true;
        fields.overrides.hidden = true;
        syncSpecialDayControls();

        const saved = findSavedRow(dateStr);
        const state = readNormalDayState();
        const previousNormalDays = localStorage.getItem(NORMAL_DAY_STATE_KEY);
        const marker = {
            entryId: saved?.row?.id || null,
            previous: markerForSavedRow(saved)
        };

        fields.normalDay.dataset.saving = "true";
        renderNormalDayButton(true, dateStr);

        normalDaySaveTimer = window.setTimeout(() => {
            normalDaySaveTimer = null;
            state[dateStr] = marker;
            if (!writeNormalDayState(state)) {
                fields.normalDay.dataset.saving = "false";
                renderNormalDayButton(false, dateStr);
                return;
            }

            pendingNormalDaySave = {
                dateStr,
                previousNormalDays,
                failed: false
            };
            if (typeof editForm.requestSubmit === "function") {
                editForm.requestSubmit();
            } else {
                editForm.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
            }

            const stored = findSavedRow(dateStr);
            if (!stored || !hasNormalDayShape(stored.row)) {
                restoreStoredValue(NORMAL_DAY_STATE_KEY, previousNormalDays);
                fields.normalDay.dataset.saving = "false";
                renderNormalDayButton(false, dateStr);
                if (!pendingNormalDaySave.failed) {
                    window.alert("WorkPay could not save this Normal Day. Your existing data was left unchanged.");
                }
            } else {
                const currentState = readNormalDayState();
                if (currentState[dateStr]) {
                    currentState[dateStr].entryId = stored.row.id || null;
                    writeNormalDayState(currentState, false);
                }
            }
            pendingNormalDaySave = null;
        }, 400);
    }

    function syncSpecialDayControls(prefillWorkedTimes = false) {
        const holiday = !!fields.holiday.checked || isAutoHoliday(fields.date.value);
        const holidayWorked = holiday && !!fields.holidayWorked.checked;
        const settings = readJson(STORE.SETTINGS, {});
        const date = parseInputDate(fields.date.value);
        const template = date && Array.isArray(settings.weekTemplate)
            ? (settings.weekTemplate[date.getDay()] || {})
            : {};
        const ordinarilyWorks = /^\d{2}:\d{2}$/.test(template.start || "")
            && /^\d{2}:\d{2}$/.test(template.end || "");

        fields.holidayChoice.hidden = !holiday;
        fields.paidOffControl.hidden = holiday;
        if (holiday) fields.paidOff.checked = false;
        else fields.holidayWorked.checked = false;

        if (holiday) {
            if (holidayWorked) {
                fields.holidayHint.textContent = ordinarilyWorks
                    ? "Normally scheduled day: WorkPay applies at least double the ordinary daily wage, or the daily wage plus time worked when greater."
                    : "Not normally scheduled: WorkPay applies an ordinary daily wage plus payment for the time worked.";
                if (prefillWorkedTimes) {
                    if (!fields.start.value) fields.start.value = template.start || "";
                    if (!fields.end.value) fields.end.value = template.end || "";
                    if (!fields.breakMin.value) fields.breakMin.value = String(settings.defaultBreak || 0);
                }
            } else {
                fields.holidayHint.textContent = ordinarilyWorks
                    ? "Not worked: this is normally a workday, so one ordinary day of pay is kept."
                    : "Not worked: this is not in your Week Template, so no extra holiday payment is added.";
            }
        }

        const paidOff = !holiday && !!fields.paidOff.checked;
        const disableWorkFields = paidOff || (holiday && !holidayWorked);
        [fields.start, fields.end, fields.breakMin].forEach(field => {
            field.disabled = disableWorkFields;
        });
        fields.applyOt.disabled = paidOff || holiday;
    }

    function setOverrideFields(row) {
        const overrides = row?.overrides || { useGlobal: true };
        const useGlobal = overrides.useGlobal !== false;
        fields.useGlobal.checked = useGlobal;
        fields.overrides.hidden = useGlobal;
        fields.hourly.value = overrides.hourly ?? "";
        fields.otThreshold.value = overrides.otThreshold ?? "";
        fields.otMultiplier.value = overrides.otMultiplier ?? "";
        fields.sundayMultiplier.value = overrides.sundayMultiplier ?? "";
        fields.holidayMultiplier.value = overrides.holidayMultiplier ?? "";
    }

    function openEditorForDate(dateStr) {
        resetNormalDayButton();
        const date = parseInputDate(dateStr);
        if (!date) return;

        const saved = findSavedRow(dateStr);
        const row = saved?.row || null;
        const settings = readJson(STORE.SETTINGS, {});
        const template = Array.isArray(settings.weekTemplate)
            ? (settings.weekTemplate[date.getDay()] || {})
            : {};

        pendingHistoricalEdit = saved?.historical ? { id: row.id, row } : null;
        editTitle.textContent = row ? "Edit Day" : "Add Day";
        fields.id.value = row?.id || "";
        fields.date.value = dateStr;
        fields.holiday.checked = row ? (!!row.isHoliday || isAutoHoliday(dateStr)) : isAutoHoliday(dateStr);
        fields.holidayWorked.checked = row ? !!row.holidayWorked : false;
        const notWorkedHoliday = fields.holiday.checked && !fields.holidayWorked.checked;
        fields.start.value = notWorkedHoliday ? "" : (row?.start || template.start || "");
        fields.end.value = notWorkedHoliday ? "" : (row?.end || template.end || "");
        fields.breakMin.value = row?.breakMin ?? clamp(settings.defaultBreak ?? 60, 0, 1440);
        fields.paidOff.checked = !!row?.paidOff;
        fields.applyOt.checked = row ? (row.applyOvertime !== false && row.countOvertime !== false) : true;
        setOverrideFields(row);
        syncSpecialDayControls();
        syncNormalDayButton(dateStr);
        editSheet.setAttribute("aria-hidden", "false");
    }

    function formMatchesNormalDay(dateStr) {
        const date = parseInputDate(dateStr);
        if (!date) return false;
        const settings = readJson(STORE.SETTINGS, {});
        const template = Array.isArray(settings.weekTemplate)
            ? (settings.weekTemplate[date.getDay()] || {})
            : {};
        const expectedBreak = readBool(DEDUCT_BREAK_KEY, true)
            ? clamp(settings.defaultBreak ?? 60, 0, 1440)
            : 0;
        return !fields.holiday.checked
            && !fields.paidOff.checked
            && !fields.applyOt.checked
            && fields.useGlobal.checked
            && fields.start.value === (template.start || "")
            && fields.end.value === (template.end || "")
            && Number(fields.breakMin.value) === expectedBreak;
    }

    function clearChangedNormalDayMarker() {
        if (fields.normalDay.dataset.saving === "true") return;
        const openedDate = fields.normalDay.dataset.date;
        if (!openedDate) return;
        const state = readNormalDayState();
        if (!state[openedDate]) return;
        if (fields.date.value === openedDate && formMatchesNormalDay(openedDate)) return;
        delete state[openedDate];
        writeNormalDayState(state, false);
    }

    function buildOverridesFromForm() {
        if (fields.useGlobal.checked) return { useGlobal: true };
        return {
            useGlobal: false,
            hourly: fields.hourly.value ? clamp(fields.hourly.value, 0, 1e9) : null,
            otThreshold: fields.otThreshold.value ? clamp(fields.otThreshold.value, 0, 24) : null,
            otMultiplier: fields.otMultiplier.value ? clamp(fields.otMultiplier.value, 1, 10) : null,
            sundayMultiplier: fields.sundayMultiplier.value ? clamp(fields.sundayMultiplier.value, 1, 10) : null,
            holidayMultiplier: fields.holidayMultiplier.value ? clamp(fields.holidayMultiplier.value, 1, 10) : null
        };
    }

    function saveHistoricalEdit(event) {
        if (!pendingHistoricalEdit || fields.id.value !== pendingHistoricalEdit.id) return;

        event.preventDefault();
        event.stopImmediatePropagation();

        const dateStr = fields.date.value;
        if (!parseInputDate(dateStr)) {
            window.alert("Please choose a valid date.");
            return;
        }

        const history = readJson(STORE.HISTORY, []);
        const active = readJson(STORE.ENTRIES, []);
        const cleanHistory = (Array.isArray(history) ? history : []).map(cycle => ({
            ...cycle,
            entries: (Array.isArray(cycle.entries) ? cycle.entries : []).filter(row => row.id !== pendingHistoricalEdit.id)
        }));
        const cleanActive = (Array.isArray(active) ? active : []).filter(row => row.id !== pendingHistoricalEdit.id);
        const holiday = !!fields.holiday.checked || isAutoHoliday(dateStr);
        const holidayWorked = holiday && !!fields.holidayWorked.checked;
        const settings = readJson(STORE.SETTINGS, {});
        const date = parseInputDate(dateStr);
        const template = date && Array.isArray(settings.weekTemplate)
            ? (settings.weekTemplate[date.getDay()] || {})
            : {};
        const sameDate = dateKey(pendingHistoricalEdit.row.dateISO) === dateStr;
        const holidayWasOrdinaryWorkday = holiday && sameDate
            && typeof pendingHistoricalEdit.row.holidayWasOrdinaryWorkday === "boolean"
            ? pendingHistoricalEdit.row.holidayWasOrdinaryWorkday
            : holiday && !!template.start && !!template.end;

        cleanActive.push({
            ...pendingHistoricalEdit.row,
            id: pendingHistoricalEdit.id,
            dateISO: inputDateToIso(dateStr),
            start: holiday && !holidayWorked ? "" : (fields.start.value || ""),
            end: holiday && !holidayWorked ? "" : (fields.end.value || ""),
            breakMin: holiday && !holidayWorked ? 0 : clamp(fields.breakMin.value, 0, 1440),
            isHoliday: holiday,
            holidayWorked,
            holidayWasOrdinaryWorkday,
            paidOff: !holiday && !!fields.paidOff.checked,
            applyOvertime: !!fields.applyOt.checked,
            overrides: buildOverridesFromForm()
        });

        if (!writeHistoricalMove(cleanActive, cleanHistory)) {
            if (pendingNormalDaySave) pendingNormalDaySave.failed = true;
            return;
        }

        pendingHistoricalEdit = null;
        editSheet.setAttribute("aria-hidden", "true");
        document.dispatchEvent(new CustomEvent("workpay:data-changed"));
    }

    calendar.addEventListener("click", event => {
        const cell = event.target.closest("button.calendar-cell[data-date]");
        if (!cell || !calendar.contains(cell)) return;
        const dateStr = cell.dataset.date;
        window.setTimeout(() => openEditorForDate(dateStr), 0);
    }, true);

    editForm.addEventListener("submit", clearChangedNormalDayMarker, true);
    editForm.addEventListener("submit", saveHistoricalEdit, true);
    fields.normalDay.addEventListener("click", saveNormalDayFromEditor);
    fields.date.addEventListener("change", () => {
        resetNormalDayButton();
        syncNormalDayButton(fields.date.value);
        if (!fields.id.value || isAutoHoliday(fields.date.value)) {
            fields.holiday.checked = isAutoHoliday(fields.date.value);
        }
        fields.holidayWorked.checked = false;
        syncSpecialDayControls();
    });
    fields.paidOff.addEventListener("change", syncSpecialDayControls);
    fields.holiday.addEventListener("change", () => {
        fields.holidayWorked.checked = false;
        syncSpecialDayControls();
    });
    fields.holidayWorked.addEventListener("change", () => syncSpecialDayControls(true));
    fields.useGlobal.addEventListener("change", () => {
        fields.overrides.hidden = !!fields.useGlobal.checked;
    });

    [closeEditBtn, cancelEditBtn].forEach(button => {
        button?.addEventListener("click", () => {
            pendingHistoricalEdit = null;
            resetNormalDayButton();
        });
    });

    const editSheetObserver = new MutationObserver(() => {
        if (editSheet.getAttribute("aria-hidden") === "false") {
            window.setTimeout(() => syncNormalDayButton(fields.date.value), 0);
        } else {
            resetNormalDayButton();
        }
    });
    editSheetObserver.observe(editSheet, { attributes: true, attributeFilter: ["aria-hidden"] });
})();
