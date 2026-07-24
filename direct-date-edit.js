/* WorkPay direct calendar editing
   One tap saves an empty ordinary day with the weekly template and overtime off.
   Saved, special, future, or unscheduled dates still open the Add/Edit Day sheet,
   including dates that belong to completed pay cycles.
*/
(function () {
    "use strict";

    const STORE = {
        SETTINGS: "paycalc_settings_v2",
        ENTRIES: "paycalc_entries_v2",
        HISTORY: "paycalc_history_v1"
    };
    const DEDUCT_BREAK_KEY = "workpay_deduct_break_v1";

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
        start: document.getElementById("ed_start"),
        end: document.getElementById("ed_end"),
        breakMin: document.getElementById("ed_break"),
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
        for (const cycle of Array.isArray(history) ? history : []) {
            const row = (Array.isArray(cycle.entries) ? cycle.entries : []).find(item => localDateKey(item.dateISO) === dateStr);
            if (row) return { row, historical: true };
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

    function createId() {
        try {
            const values = new Uint32Array(2);
            crypto.getRandomValues(values);
            return Array.from(values)
                .map(value => value.toString(16).padStart(8, "0"))
                .join("");
        } catch {
            return String(Date.now()) + Math.random().toString(16).slice(2);
        }
    }

    function quickNormalDayValues(dateStr) {
        const date = parseInputDate(dateStr);
        if (!date || date > new Date()) return null;
        if (date.getDay() === 0 || isAutoHoliday(dateStr)) return null;
        if (findSavedRow(dateStr)) return null;

        const settings = readJson(STORE.SETTINGS, {});
        const template = Array.isArray(settings.weekTemplate)
            ? (settings.weekTemplate[date.getDay()] || {})
            : {};
        if (!template.start || !template.end) return null;

        return {
            settings,
            start: template.start,
            end: template.end
        };
    }

    function saveQuickNormalDay(dateStr, values) {
        const active = readJson(STORE.ENTRIES, []);
        const entries = Array.isArray(active) ? active : [];
        if (findSavedRow(dateStr)) return false;

        const deductBreak = readBool(DEDUCT_BREAK_KEY, true);
        entries.push({
            id: createId(),
            dateISO: inputDateToIso(dateStr),
            start: values.start,
            end: values.end,
            breakMin: deductBreak ? clamp(values.settings.defaultBreak ?? 60, 0, 1440) : 0,
            isHoliday: false,
            paidOff: false,
            applyOvertime: false,
            createdAt: Date.now() + Math.random(),
            overrides: { useGlobal: true }
        });

        try {
            localStorage.setItem(STORE.ENTRIES, JSON.stringify(entries));
        } catch {
            window.alert("WorkPay could not save this day. Please check browser storage and try again.");
            return false;
        }

        if (typeof window.gtag === "function") {
            window.gtag("event", "work_day_saved", { entry_method: "one_tap_normal" });
        }
        window.location.reload();
        return true;
    }

    function syncPaidOffControls() {
        const disabled = !!fields.paidOff.checked;
        [fields.start, fields.end, fields.breakMin, fields.applyOt].forEach(field => {
            field.disabled = disabled;
        });
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
        fields.start.value = row?.start || template.start || "";
        fields.end.value = row?.end || template.end || "";
        fields.breakMin.value = row?.breakMin ?? clamp(settings.defaultBreak ?? 60, 0, 1440);
        fields.paidOff.checked = !!row?.paidOff;
        fields.applyOt.checked = row ? (row.applyOvertime !== false && row.countOvertime !== false) : true;
        setOverrideFields(row);
        syncPaidOffControls();
        editSheet.setAttribute("aria-hidden", "false");
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

        cleanActive.push({
            ...pendingHistoricalEdit.row,
            id: pendingHistoricalEdit.id,
            dateISO: inputDateToIso(dateStr),
            start: fields.start.value || "",
            end: fields.end.value || "",
            breakMin: clamp(fields.breakMin.value, 0, 1440),
            isHoliday: !!fields.holiday.checked,
            paidOff: !!fields.paidOff.checked,
            applyOvertime: !!fields.applyOt.checked,
            overrides: buildOverridesFromForm()
        });

        if (!writeHistoricalMove(cleanActive, cleanHistory)) return;

        pendingHistoricalEdit = null;
        window.location.reload();
    }

    calendar.addEventListener("click", event => {
        const cell = event.target.closest("button.calendar-cell[data-date]");
        if (!cell || !calendar.contains(cell)) return;
        const dateStr = cell.dataset.date;
        const quickValues = quickNormalDayValues(dateStr);

        if (quickValues) {
            event.preventDefault();
            event.stopImmediatePropagation();
            saveQuickNormalDay(dateStr, quickValues);
            return;
        }

        window.setTimeout(() => openEditorForDate(dateStr), 0);
    }, true);

    editForm.addEventListener("submit", saveHistoricalEdit, true);
    fields.paidOff.addEventListener("change", syncPaidOffControls);
    fields.useGlobal.addEventListener("change", () => {
        fields.overrides.hidden = !!fields.useGlobal.checked;
    });

    [closeEditBtn, cancelEditBtn].forEach(button => {
        button?.addEventListener("click", () => {
            pendingHistoricalEdit = null;
        });
    });
})();
