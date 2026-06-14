/* WorkPay Calculator
   - Pay-cycle calendar with tap-to-add/edit workflow
   - Completed cycle history stored separately
   - South African public holiday detection
   - Per-day overtime and rate overrides
*/
(function () {
    "use strict";

    const STORE = {
        SETTINGS: "paycalc_settings_v2",
        ENTRIES: "paycalc_entries_v2",
        HISTORY: "paycalc_history_v1"
    };

    const el = {
        openHelpBtn: document.getElementById("openHelpBtn"),
        openSettingsBtn: document.getElementById("openSettingsBtn"),

        monthTotal: document.getElementById("monthTotal"),
        cycleTotal: document.getElementById("cycleTotal"),
        cycleWindow: document.getElementById("cycleWindow"),
        cycleTitle: document.getElementById("cycleTitle"),
        cycleSubtitle: document.getElementById("cycleSubtitle"),
        cycleWorkDays: document.getElementById("cycleWorkDays"),
        cycleHours: document.getElementById("cycleHours"),
        cycleAverage: document.getElementById("cycleAverage"),
        cycleProgressText: document.getElementById("cycleProgressText"),
        cycleProgressBar: document.getElementById("cycleProgressBar"),

        calendarTodayBtn: document.getElementById("calendarTodayBtn"),
        prevMonthBtn: document.getElementById("prevMonthBtn"),
        nextMonthBtn: document.getElementById("nextMonthBtn"),
        monthPicker: document.getElementById("monthPicker"),
        calendarRangeLabel: document.getElementById("calendarRangeLabel"),
        cycleCalendar: document.getElementById("cycleCalendar"),
        selectedDayPanel: document.getElementById("selectedDayPanel"),
        entryListTitle: document.getElementById("entryListTitle"),
        entryCount: document.getElementById("entryCount"),

        helpSheet: document.getElementById("helpSheet"),
        closeHelpBtn: document.getElementById("closeHelpBtn"),
        settingsSheet: document.getElementById("settingsSheet"),
        closeSettingsBtn: document.getElementById("closeSettingsBtn"),
        editSheet: document.getElementById("editSheet"),
        editSheetTitle: document.getElementById("editSheetTitle"),
        closeEditBtn: document.getElementById("closeEditBtn"),

        settingsForm: document.getElementById("settingsForm"),
        autoFillCycleBtn: document.getElementById("autoFillCycleBtn"),
        s_hourly: document.getElementById("s_hourly"),
        s_otThreshold: document.getElementById("s_otThreshold"),
        s_otMultiplier: document.getElementById("s_otMultiplier"),
        s_sunMult: document.getElementById("s_sunMult"),
        s_holMult: document.getElementById("s_holMult"),
        s_cycleStart: document.getElementById("s_cycleStart"),
        s_currency: document.getElementById("s_currency"),
        s_defaultBreak: document.getElementById("s_defaultBreak"),
        week: Array.from({ length: 7 }, (_, i) => ({
            start: document.getElementById(`w${i}_start`),
            end: document.getElementById(`w${i}_end`)
        })),

        qa_form: document.getElementById("quickAddForm"),
        qa_date: document.getElementById("qa_date"),
        qa_editDate: document.getElementById("qa_editDate"),
        qa_start: document.getElementById("qa_start"),
        qa_end: document.getElementById("qa_end"),
        qa_break: document.getElementById("qa_break"),
        qa_holiday: document.getElementById("qa_holiday"),
        qa_paidOff: document.getElementById("qa_paidOff"),
        qa_applyOt: document.getElementById("qa_applyOt"),

        list: document.getElementById("entryList"),
        tpl: document.getElementById("entryCardTpl"),
        fabExport: document.getElementById("fabExport"),

        editForm: document.getElementById("editForm"),
        ed_id: document.getElementById("ed_id"),
        ed_date: document.getElementById("ed_date"),
        ed_holiday: document.getElementById("ed_holiday"),
        ed_start: document.getElementById("ed_start"),
        ed_end: document.getElementById("ed_end"),
        ed_break: document.getElementById("ed_break"),
        ed_paidOff: document.getElementById("ed_paidOff"),
        ed_useGlobal: document.getElementById("ed_useGlobal"),
        ed_overrides: document.getElementById("ed_overrides"),
        ed_hourly: document.getElementById("ed_hourly"),
        ed_otTh: document.getElementById("ed_otTh"),
        ed_otMul: document.getElementById("ed_otMul"),
        ed_sunMul: document.getElementById("ed_sunMul"),
        ed_holMul: document.getElementById("ed_holMul"),
        ed_applyOt: document.getElementById("ed_applyOt"),
        ed_cancel: document.getElementById("ed_cancel"),
        ed_save: document.getElementById("ed_save")
    };

    let settings = loadSettings() || {
        hourly: 0,
        otThreshold: 8,
        otMultiplier: 1.5,
        sundayMultiplier: 2,
        holidayMultiplier: 2,
        cycleStartDay: 21,
        currency: "R",
        defaultBreak: 60,
        weekTemplate: [
            { start: "", end: "" },
            { start: "08:00", end: "17:00" },
            { start: "08:00", end: "17:00" },
            { start: "08:00", end: "17:00" },
            { start: "08:00", end: "17:00" },
            { start: "08:00", end: "17:00" },
            { start: "", end: "" }
        ]
    };

    let entries = loadEntries();
    let history = loadHistory();
    let selectedDate = null;
    let viewedCycleAnchor = startOfToday();

    const PUBLIC_HOLIDAY_CACHE = new Map();
    const FIXED_PUBLIC_HOLIDAYS = [
        { month: 0, day: 1 },
        { month: 2, day: 21 },
        { month: 3, day: 27 },
        { month: 4, day: 1 },
        { month: 5, day: 16 },
        { month: 7, day: 9 },
        { month: 8, day: 24 },
        { month: 11, day: 16 },
        { month: 11, day: 25 },
        { month: 11, day: 26 }
    ];

    function clamp(n, lo, hi) {
        const x = Number.isFinite(+n) ? +n : 0;
        if (Number.isFinite(lo) && x < lo) return lo;
        if (Number.isFinite(hi) && x > hi) return hi;
        return x;
    }

    function parseTime(hhmm) {
        if (typeof hhmm !== "string" || !/^\d{2}:\d{2}$/.test(hhmm)) return null;
        const parts = hhmm.split(":").map(Number);
        const h = parts[0];
        const m = parts[1];
        if (h < 0 || h > 23 || m < 0 || m > 59) return null;
        return h * 60 + m;
    }

    function parseInputDate(str) {
        if (typeof str !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(str)) return null;
        const parts = str.split("-").map(Number);
        const date = new Date(parts[0], parts[1] - 1, parts[2]);
        if (date.getFullYear() !== parts[0] || date.getMonth() !== parts[1] - 1 || date.getDate() !== parts[2]) return null;
        return date;
    }

    function toDate(value) {
        if (value instanceof Date) return new Date(value.getFullYear(), value.getMonth(), value.getDate());
        if (typeof value === "string") {
            const inputDate = parseInputDate(value);
            if (inputDate) return inputDate;
            const parsed = new Date(value);
            if (!Number.isNaN(parsed.getTime())) {
                return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
            }
        }
        if (typeof value === "number") {
            const parsed = new Date(value);
            if (!Number.isNaN(parsed.getTime())) return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
        }
        return null;
    }

    function ymd(value) {
        const d = toDate(value);
        if (!d) return "";
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        return `${y}-${m}-${day}`;
    }

    function dateISO(dateStr) {
        const d = parseInputDate(dateStr) || toDate(dateStr) || startOfToday();
        return d.toISOString();
    }

    function addDays(value, days) {
        const d = toDate(value);
        if (!d || !Number.isFinite(days)) return null;
        const copy = new Date(d.getFullYear(), d.getMonth(), d.getDate());
        copy.setDate(copy.getDate() + days);
        return copy;
    }

    function startOfToday() {
        const now = new Date();
        return new Date(now.getFullYear(), now.getMonth(), now.getDate());
    }

    function isSunday(value) {
        const d = toDate(value);
        return !!d && d.getDay() === 0;
    }

    function fmtMoney(n) {
        const value = Number.isFinite(+n) ? +n : 0;
        try {
            return new Intl.NumberFormat(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            }).format(value);
        } catch {
            return value.toFixed(2);
        }
    }

    function fmtCellMoney(n) {
        const text = fmtMoney(n);
        return text.endsWith(".00") ? text.slice(0, -3) : text;
    }

    function money(n) {
        return `${settings.currency || "R"} ${fmtMoney(n)}`;
    }

    function cellMoney(n) {
        const value = Number.isFinite(+n) ? +n : 0;
        const symbol = settings.currency || "R";
        const abs = Math.abs(value);
        if (abs >= 1000000) return `${symbol}${(value / 1000000).toFixed(1)}m`;
        if (abs >= 1000) return `${symbol}${Math.round(value / 1000)}k`;
        return `${symbol}${fmtCellMoney(Math.round(value))}`;
    }

    function formatDate(value, options) {
        const d = toDate(value);
        if (!d) return "";
        return d.toLocaleDateString(undefined, options);
    }

    function formatRange(start, end) {
        const a = toDate(start);
        const b = toDate(end);
        if (!a || !b) return "";
        const sameYear = a.getFullYear() === b.getFullYear();
        const startText = a.toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
            year: sameYear ? undefined : "numeric"
        });
        const endText = b.toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
            year: "numeric"
        });
        return `${startText} to ${endText}`;
    }

    function make(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
    }

    function calcEasterSunday(year) {
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

    function registerHoliday(set, date) {
        if (!(date instanceof Date) || Number.isNaN(date.getTime())) return;
        set.add(ymd(date));
        if (date.getDay() === 0) {
            const observed = addDays(date, 1);
            if (observed) set.add(ymd(observed));
        }
    }

    function computePublicHolidays(year) {
        if (PUBLIC_HOLIDAY_CACHE.has(year)) return PUBLIC_HOLIDAY_CACHE.get(year);
        const set = new Set();
        for (const fixed of FIXED_PUBLIC_HOLIDAYS) {
            registerHoliday(set, new Date(year, fixed.month, fixed.day));
        }
        const easter = calcEasterSunday(year);
        registerHoliday(set, addDays(easter, -2));
        registerHoliday(set, addDays(easter, 1));
        PUBLIC_HOLIDAY_CACHE.set(year, set);
        return set;
    }

    function isAutoHoliday(value) {
        const d = toDate(value);
        if (!d) return false;
        return computePublicHolidays(d.getFullYear()).has(ymd(d));
    }

    function loadSettings() {
        try {
            return JSON.parse(localStorage.getItem(STORE.SETTINGS) || "null");
        } catch {
            return null;
        }
    }

    function saveSettings() {
        try {
            localStorage.setItem(STORE.SETTINGS, JSON.stringify(settings));
        } catch {}
    }

    function loadEntries() {
        try {
            return normalizeEntries(JSON.parse(localStorage.getItem(STORE.ENTRIES) || "[]"));
        } catch {
            return [];
        }
    }

    function saveEntries() {
        try {
            localStorage.setItem(STORE.ENTRIES, JSON.stringify(entries));
        } catch {}
    }

    function loadHistory() {
        try {
            return normalizeHistory(JSON.parse(localStorage.getItem(STORE.HISTORY) || "[]"));
        } catch {
            return [];
        }
    }

    function saveHistory() {
        try {
            localStorage.setItem(STORE.HISTORY, JSON.stringify(history));
        } catch {}
    }

    function nextCreatedAt() {
        return Date.now() + Math.random();
    }

    function cryptoId() {
        try {
            const a = new Uint32Array(2);
            crypto.getRandomValues(a);
            return Array.from(a).map(x => x.toString(16).padStart(8, "0")).join("");
        } catch {
            return String(Date.now()) + Math.random().toString(16).slice(2);
        }
    }

    function usesOvertime(row) {
        return row.applyOvertime !== false;
    }

    function normalizeEntry(row, index) {
        const source = row && typeof row === "object" ? row : {};
        const date = toDate(source.dateISO) || startOfToday();
        const overrides = source.overrides && typeof source.overrides === "object"
            ? { ...source.overrides, useGlobal: source.overrides.useGlobal !== false }
            : { useGlobal: true };

        return {
            id: source.id || `${date.getTime()}_${index}`,
            dateISO: date.toISOString(),
            start: source.start || "",
            end: source.end || "",
            breakMin: clamp(source.breakMin ?? 0, 0, 24 * 60),
            isHoliday: !!source.isHoliday,
            paidOff: !!source.paidOff,
            applyOvertime: usesOvertime(source),
            createdAt: Number.isFinite(+source.createdAt) ? +source.createdAt : date.getTime() + index,
            overrides
        };
    }

    function normalizeEntries(rows) {
        return (Array.isArray(rows) ? rows : []).map((row, index) => normalizeEntry(row, index));
    }

    function normalizeHistory(raw) {
        const list = Array.isArray(raw) ? raw : [];
        return list.map((cycle, index) => {
            const entriesForCycle = normalizeEntries(cycle.entries || []).sort(compareEntriesAsc);
            const firstEntryDate = entriesForCycle[0] ? toDate(entriesForCycle[0].dateISO) : startOfToday();
            const fallbackRange = getCycleRange(firstEntryDate, settings.cycleStartDay || 21);
            const start = toDate(cycle.startISO) || fallbackRange.start;
            const end = toDate(cycle.endISO) || fallbackRange.end;
            const key = cycle.key || cycleKey({ start, end });
            return {
                key,
                startISO: start.toISOString(),
                endISO: end.toISOString(),
                archivedAt: cycle.archivedAt || new Date().toISOString(),
                entries: entriesForCycle,
                index
            };
        }).sort(compareCyclesDesc);
    }

    function compareEntriesDesc(a, b) {
        const dateDiff = (toDate(b.dateISO)?.getTime() || 0) - (toDate(a.dateISO)?.getTime() || 0);
        if (dateDiff !== 0) return dateDiff;
        const createdDiff = (+b.createdAt || 0) - (+a.createdAt || 0);
        if (createdDiff !== 0) return createdDiff;
        return String(b.id || "").localeCompare(String(a.id || ""));
    }

    function compareEntriesAsc(a, b) {
        return -compareEntriesDesc(a, b);
    }

    function compareCyclesDesc(a, b) {
        return (toDate(b.startISO)?.getTime() || 0) - (toDate(a.startISO)?.getTime() || 0);
    }

    function resolveRates(row) {
        if (row.overrides && row.overrides.useGlobal === false) {
            const o = row.overrides;
            return {
                hourly: clamp(o.hourly ?? settings.hourly, 0, 1e9),
                otThreshold: clamp(o.otThreshold ?? settings.otThreshold, 0, 24),
                otMultiplier: clamp(o.otMultiplier ?? settings.otMultiplier, 1, 10),
                sundayMultiplier: clamp(o.sundayMultiplier ?? settings.sundayMultiplier, 1, 10),
                holidayMultiplier: clamp(o.holidayMultiplier ?? settings.holidayMultiplier, 1, 10)
            };
        }
        return { ...settings };
    }

    function calcRow(row) {
        const sunday = isSunday(row.dateISO);
        const holiday = !!row.isHoliday || isAutoHoliday(row.dateISO);
        const paidOff = !!row.paidOff;
        const rates = resolveRates(row);
        const hr = clamp(rates.hourly, 0, 1e9);
        const otTh = clamp(rates.otThreshold, 0, 24);
        const otMul = clamp(rates.otMultiplier, 1, 10);
        const sunMul = clamp(rates.sundayMultiplier, 1, 10);
        const holMul = clamp(rates.holidayMultiplier, 1, 10);
        const applyOvertime = usesOvertime(row);
        const sMin = parseTime(row.start);
        const eMin = parseTime(row.end);
        const brk = clamp(row.breakMin, 0, 24 * 60);

        let totalMin = 0;
        if (sMin !== null && eMin !== null) {
            let end = eMin;
            if (eMin <= sMin) end = eMin + 24 * 60;
            totalMin = Math.max(0, end - sMin - brk);
        }

        const hours = paidOff ? 0 : totalMin / 60;
        const paidHours = paidOff ? otTh : 0;
        const paidOffPay = paidHours * hr;
        const specialType = holiday ? "holiday" : (sunday ? "sunday" : "");
        const specialMult = specialType === "holiday" ? holMul : (specialType === "sunday" ? sunMul : 1);
        let normalH = 0;
        let otH = 0;
        let specialH = 0;

        if (paidOff) {
            normalH = 0;
        } else if (specialType) {
            specialH = hours;
        } else if (applyOvertime) {
            normalH = Math.min(hours, otTh);
            otH = Math.max(0, hours - otTh);
        } else {
            normalH = hours;
        }

        const normalPay = normalH * hr;
        const otPay = otH * hr * otMul;
        const specialPay = specialH * hr * specialMult;

        return {
            hours,
            paidHours,
            normalH,
            otH,
            specialH,
            amount: normalPay + otPay + specialPay + paidOffPay,
            multiplier: specialMult,
            specialType,
            paidOff,
            usesOvertime: applyOvertime,
            otThreshold: otTh,
            otMultiplier: otMul
        };
    }

    function getMonthRange(date) {
        const d = toDate(date) || startOfToday();
        const start = new Date(d.getFullYear(), d.getMonth(), 1);
        const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
        return { start, end };
    }

    function getCycleRange(anchorDate, startDay) {
        const d = toDate(anchorDate) || startOfToday();
        const sd = clamp(startDay, 1, 28);
        const start = new Date(d.getFullYear(), d.getMonth(), sd);
        if (d < start) start.setMonth(start.getMonth() - 1);
        const next = new Date(start.getFullYear(), start.getMonth() + 1, sd);
        const end = addDays(next, -1);
        return { start, end };
    }

    function getCurrentCycleRange() {
        return getCycleRange(startOfToday(), settings.cycleStartDay);
    }

    function cycleKey(range) {
        return `${ymd(range.start)}_${ymd(range.end)}`;
    }

    function monthInputValue(value) {
        const d = toDate(value) || startOfToday();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    }

    function cycleName(range) {
        return formatRange(range.start, range.end);
    }

    function getViewedCycleRange() {
        return getCycleRange(viewedCycleAnchor, settings.cycleStartDay);
    }

    function isActiveRow(row) {
        return entries.some(item => item.id === row.id);
    }

    function isEditableDate(dateStr) {
        const date = toDate(dateStr);
        if (!date) return false;
        return date >= getCurrentCycleRange().start;
    }

    function rowsForViewedCycle(range) {
        return entriesForRange(allEntries(), range);
    }

    function setViewedCycle(date) {
        const d = toDate(date) || startOfToday();
        viewedCycleAnchor = d;
        const range = getViewedCycleRange();
        const today = ymd(startOfToday());
        selectedDate = isInRange(today, range) ? today : ymd(range.start);
    }

    function moveViewedCycle(direction) {
        const range = getViewedCycleRange();
        viewedCycleAnchor = direction < 0 ? addDays(range.start, -1) : addDays(range.end, 1);
        const nextRange = getViewedCycleRange();
        selectedDate = ymd(nextRange.start);
        render();
    }

    function showCurrentCycle() {
        setViewedCycle(startOfToday());
        render();
    }

    function jumpToCycleMonth(monthValue) {
        if (!/^\d{4}-\d{2}$/.test(monthValue || "")) return;
        const parts = monthValue.split("-").map(Number);
        viewedCycleAnchor = new Date(parts[0], parts[1] - 1, clamp(settings.cycleStartDay, 1, 28));
        const range = getViewedCycleRange();
        selectedDate = ymd(range.start);
        render();
    }

    function isInRange(value, range) {
        const d = toDate(value);
        if (!d) return false;
        return d >= range.start && d <= range.end;
    }

    function datesBetween(start, end) {
        const dates = [];
        for (let d = toDate(start); d && d <= end; d = addDays(d, 1)) {
            dates.push(d);
        }
        return dates;
    }

    function calendarDatesForRange(range) {
        const first = addDays(range.start, -range.start.getDay());
        const last = addDays(range.end, 6 - range.end.getDay());
        return datesBetween(first, last);
    }

    function allEntries() {
        return [
            ...history.flatMap(cycle => cycle.entries || []),
            ...entries
        ];
    }

    function entriesForRange(rows, range) {
        return rows.filter(row => isInRange(row.dateISO, range));
    }

    function entriesForDate(dateStr, rows) {
        return rows.filter(row => ymd(row.dateISO) === dateStr);
    }

    function summarizeDate(dateStr, rows) {
        const dayRows = entriesForDate(dateStr, rows);
        let hours = 0;
        let amount = 0;
        for (const row of dayRows) {
            const calc = calcRow(row);
            hours += calc.hours;
            amount += calc.amount;
        }
        return {
            rows: dayRows,
            hours,
            amount,
            worked: hours > 0,
            paidOff: dayRows.some(row => row.paidOff),
            saved: dayRows.length > 0,
            sunday: isSunday(dateStr),
            holiday: isAutoHoliday(dateStr) || dayRows.some(row => row.isHoliday)
        };
    }

    function summarizeRange(rows, range) {
        const inRange = entriesForRange(rows, range);
        const byDate = new Map();
        let amount = 0;
        let hours = 0;
        for (const row of inRange) {
            const calc = calcRow(row);
            amount += calc.amount;
            hours += calc.hours;
            const key = ymd(row.dateISO);
            const existing = byDate.get(key) || { hours: 0, amount: 0 };
            existing.hours += calc.hours;
            existing.amount += calc.amount;
            byDate.set(key, existing);
        }
        const workedDays = Array.from(byDate.values()).filter(day => day.hours > 0).length;
        return {
            rows: inRange,
            amount,
            hours,
            workedDays,
            average: workedDays ? amount / workedDays : 0
        };
    }

    function freezeRowForHistory(row) {
        const rates = resolveRates(row);
        return {
            ...row,
            overrides: {
                useGlobal: false,
                hourly: clamp(rates.hourly, 0, 1e9),
                otThreshold: clamp(rates.otThreshold, 0, 24),
                otMultiplier: clamp(rates.otMultiplier, 1, 10),
                sundayMultiplier: clamp(rates.sundayMultiplier, 1, 10),
                holidayMultiplier: clamp(rates.holidayMultiplier, 1, 10)
            }
        };
    }

    function archiveCompletedCycles() {
        const current = getCurrentCycleRange();
        const active = [];
        const toArchive = [];

        for (const row of entries) {
            const d = toDate(row.dateISO);
            if (d && d < current.start) {
                toArchive.push(row);
            } else {
                active.push(row);
            }
        }

        if (!toArchive.length) return;

        for (const row of toArchive) {
            const range = getCycleRange(row.dateISO, settings.cycleStartDay);
            const key = cycleKey(range);
            let cycle = history.find(item => item.key === key);
            if (!cycle) {
                cycle = {
                    key,
                    startISO: range.start.toISOString(),
                    endISO: range.end.toISOString(),
                    archivedAt: new Date().toISOString(),
                    entries: []
                };
                history.push(cycle);
            }
            const frozenRow = freezeRowForHistory(row);
            const existingIndex = cycle.entries.findIndex(item => item.id === frozenRow.id);
            if (existingIndex >= 0) {
                cycle.entries[existingIndex] = frozenRow;
            } else {
                cycle.entries.push(frozenRow);
            }
            cycle.entries.sort(compareEntriesAsc);
        }

        entries = active;
        history.sort(compareCyclesDesc);
        saveEntries();
        saveHistory();
    }

    function openSheet(sheet) {
        sheet.setAttribute("aria-hidden", "false");
    }

    function closeSheet(sheet) {
        sheet.setAttribute("aria-hidden", "true");
    }

    function syncSettingsToForm() {
        el.s_hourly.value = settings.hourly ?? 0;
        el.s_otThreshold.value = settings.otThreshold ?? 8;
        el.s_otMultiplier.value = settings.otMultiplier ?? 1.5;
        el.s_sunMult.value = settings.sundayMultiplier ?? 2;
        el.s_holMult.value = settings.holidayMultiplier ?? 2;
        el.s_cycleStart.value = settings.cycleStartDay ?? 21;
        el.s_currency.value = settings.currency ?? "R";
        el.s_defaultBreak.value = settings.defaultBreak ?? 60;
        for (let i = 0; i < 7; i += 1) {
            el.week[i].start.value = settings.weekTemplate[i]?.start || "";
            el.week[i].end.value = settings.weekTemplate[i]?.end || "";
        }
    }

    function saveSettingsFromForm() {
        settings = {
            hourly: clamp(el.s_hourly.value, 0, 1e9),
            otThreshold: clamp(el.s_otThreshold.value, 0, 24),
            otMultiplier: clamp(el.s_otMultiplier.value, 1, 10),
            sundayMultiplier: clamp(el.s_sunMult.value, 1, 10),
            holidayMultiplier: clamp(el.s_holMult.value, 1, 10),
            cycleStartDay: clamp(el.s_cycleStart.value, 1, 28),
            currency: String(el.s_currency.value || "R").slice(0, 4),
            defaultBreak: clamp(el.s_defaultBreak.value, 0, 24 * 60),
            weekTemplate: el.week.map(w => ({ start: w.start.value || "", end: w.end.value || "" }))
        };
        saveSettings();
    }

    function entryFromValues(values, existing) {
        return {
            id: existing?.id || cryptoId(),
            dateISO: dateISO(values.date),
            start: values.start || "",
            end: values.end || "",
            breakMin: clamp(values.breakMin, 0, 24 * 60),
            isHoliday: !!values.isHoliday,
            paidOff: !!values.paidOff,
            applyOvertime: values.applyOvertime !== false,
            createdAt: existing?.createdAt || nextCreatedAt(),
            overrides: values.overrides || { useGlobal: true }
        };
    }

    function addRow(dateValue, start, end, breakMin, isHoliday, paidOff, applyOvertime, overrides) {
        const dateStr = ymd(dateValue);
        const existingIndex = entries.findIndex(row => ymd(row.dateISO) === dateStr);
        const existing = existingIndex >= 0 ? entries[existingIndex] : null;
        const row = entryFromValues({
            date: dateStr,
            start,
            end,
            breakMin,
            isHoliday,
            paidOff,
            applyOvertime,
            overrides
        }, existing);

        if (existingIndex >= 0) {
            entries[existingIndex] = row;
        } else {
            entries.push(row);
        }
        saveEntries();
        if (!isInRange(dateStr, getViewedCycleRange())) {
            viewedCycleAnchor = toDate(dateStr);
        }
        selectedDate = dateStr;
        render();
    }

    function removeRow(id) {
        const row = entries.find(item => item.id === id);
        if (!row) return;
        const ok = window.confirm("Remove this saved work day?");
        if (!ok) return;
        selectedDate = ymd(row.dateISO);
        entries = entries.filter(item => item.id !== id);
        saveEntries();
        render();
    }

    function autoFillCycle() {
        const range = getCurrentCycleRange();
        const generated = [];
        const keep = entries.filter(row => !isInRange(row.dateISO, range));

        for (const day of datesBetween(range.start, range.end)) {
            const template = settings.weekTemplate[day.getDay()] || { start: "", end: "" };
            if (!template.start && !template.end) continue;
            generated.push(entryFromValues({
                date: ymd(day),
                start: template.start || "",
                end: template.end || "",
                breakMin: settings.defaultBreak,
                isHoliday: isAutoHoliday(day),
                paidOff: false,
                applyOvertime: true,
                overrides: { useGlobal: true }
            }));
        }

        entries = [...keep, ...generated];
        saveEntries();
        selectedDate = ymd(range.start);
        render();
    }

    function setEditOverrides(row) {
        const useGlobal = !(row.overrides && row.overrides.useGlobal === false);
        el.ed_useGlobal.checked = useGlobal;
        el.ed_overrides.hidden = useGlobal;
        const o = row.overrides || {};
        el.ed_hourly.value = o.hourly ?? "";
        el.ed_otTh.value = o.otThreshold ?? "";
        el.ed_otMul.value = o.otMultiplier ?? "";
        el.ed_sunMul.value = o.sundayMultiplier ?? "";
        el.ed_holMul.value = o.holidayMultiplier ?? "";
    }

    function openEdit(id) {
        const row = entries.find(item => item.id === id);
        if (!row) return;
        selectedDate = ymd(row.dateISO);
        el.editSheetTitle.textContent = "Edit Day";
        el.ed_id.value = row.id;
        el.ed_date.value = ymd(row.dateISO);
        el.ed_holiday.checked = !!row.isHoliday || isAutoHoliday(row.dateISO);
        el.ed_start.value = row.start || "";
        el.ed_end.value = row.end || "";
        el.ed_break.value = row.breakMin ?? settings.defaultBreak;
        el.ed_paidOff.checked = !!row.paidOff;
        el.ed_applyOt.checked = usesOvertime(row);
        syncPaidOffControls("edit");
        setEditOverrides(row);
        openSheet(el.editSheet);
        render();
    }

    function openNewEntry(dateStr) {
        const date = parseInputDate(dateStr) || startOfToday();
        const template = settings.weekTemplate[date.getDay()] || { start: "", end: "" };
        el.editSheetTitle.textContent = "Add Day";
        el.ed_id.value = "";
        el.ed_date.value = ymd(date);
        el.ed_holiday.checked = isAutoHoliday(date);
        el.ed_start.value = template.start || "";
        el.ed_end.value = template.end || "";
        el.ed_break.value = clamp(settings.defaultBreak ?? 60, 0, 24 * 60);
        el.ed_paidOff.checked = false;
        el.ed_applyOt.checked = true;
        syncPaidOffControls("edit");
        setEditOverrides({ overrides: { useGlobal: true } });
        openSheet(el.editSheet);
    }

    function saveEdit(event) {
        event.preventDefault();
        const id = el.ed_id.value;
        const dateStr = el.ed_date.value || ymd(startOfToday());
        const existingIndex = id
            ? entries.findIndex(item => item.id === id)
            : entries.findIndex(item => ymd(item.dateISO) === dateStr);
        const existing = existingIndex >= 0 ? entries[existingIndex] : null;
        const useGlobal = !!el.ed_useGlobal.checked;
        const overrides = useGlobal ? { useGlobal: true } : {
            useGlobal: false,
            hourly: el.ed_hourly.value ? clamp(el.ed_hourly.value, 0, 1e9) : null,
            otThreshold: el.ed_otTh.value ? clamp(el.ed_otTh.value, 0, 24) : null,
            otMultiplier: el.ed_otMul.value ? clamp(el.ed_otMul.value, 1, 10) : null,
            sundayMultiplier: el.ed_sunMul.value ? clamp(el.ed_sunMul.value, 1, 10) : null,
            holidayMultiplier: el.ed_holMul.value ? clamp(el.ed_holMul.value, 1, 10) : null
        };
        const row = entryFromValues({
            date: dateStr,
            start: el.ed_start.value || "",
            end: el.ed_end.value || "",
            breakMin: el.ed_break.value,
            isHoliday: !!el.ed_holiday.checked,
            paidOff: !!el.ed_paidOff.checked,
            applyOvertime: !!el.ed_applyOt.checked,
            overrides
        }, existing);

        if (existingIndex >= 0) {
            entries[existingIndex] = row;
        } else {
            entries.push(row);
        }

        selectedDate = dateStr;
        if (!isInRange(dateStr, getViewedCycleRange())) {
            viewedCycleAnchor = toDate(dateStr);
        }
        saveEntries();
        closeSheet(el.editSheet);
        render();
    }

    function autoTickHoliday(dateStr) {
        el.qa_holiday.checked = !!dateStr && isAutoHoliday(dateStr);
    }

    function prefillQuickAddForDate(dateStr) {
        const date = parseInputDate(dateStr) || startOfToday();
        const template = settings.weekTemplate[date.getDay()] || { start: "", end: "" };
        el.qa_start.value = template.start || "";
        el.qa_end.value = template.end || "";
        el.qa_break.value = clamp(settings.defaultBreak ?? 60, 0, 24 * 60);
    }

    function applyQuickAddDate(dateStr, prefillTimes) {
        if (!dateStr) return;
        el.qa_date.value = dateStr;
        autoTickHoliday(dateStr);
        if (prefillTimes) prefillQuickAddForDate(dateStr);
    }

    function syncPaidOffControls(scope) {
        const paidOff = scope === "edit" ? !!el.ed_paidOff.checked : !!el.qa_paidOff.checked;
        const fields = scope === "edit"
            ? [el.ed_start, el.ed_end, el.ed_break, el.ed_applyOt]
            : [el.qa_start, el.qa_end, el.qa_break, el.qa_applyOt];
        fields.forEach(field => {
            field.disabled = paidOff;
        });
    }

    function setAutoDate() {
        applyQuickAddDate(ymd(startOfToday()), true);
    }

    function submitQuickAdd(event) {
        event.preventDefault();
        const dateStr = el.qa_date.value || ymd(startOfToday());
        let start = el.qa_start.value;
        let end = el.qa_end.value;
        if (!start || !end) {
            const date = parseInputDate(dateStr) || startOfToday();
            const template = settings.weekTemplate[date.getDay()] || { start: "", end: "" };
            start = start || template.start || "";
            end = end || template.end || "";
        }
        addRow(
            dateStr,
            start,
            end,
            el.qa_break.value || settings.defaultBreak || 0,
            !!el.qa_holiday.checked,
            !!el.qa_paidOff.checked,
            !!el.qa_applyOt.checked,
            { useGlobal: true }
        );
        const nextDate = addDays(dateStr, 1);
        applyQuickAddDate(nextDate ? ymd(nextDate) : ymd(startOfToday()), true);
    }

    function buildRateText(calc) {
        if (calc.paidOff) return `Paid off base day (${calc.paidHours.toFixed(2)}h)`;
        if (calc.specialType === "holiday") return `Holiday x${calc.multiplier.toFixed(2)} on all hours`;
        if (calc.specialType === "sunday") return `Sunday x${calc.multiplier.toFixed(2)} on all hours`;
        if (calc.otH > 0) return `OT x${calc.otMultiplier.toFixed(2)} after ${calc.otThreshold.toFixed(2)}h`;
        if (!calc.usesOvertime) return "Overtime off";
        return "Standard pay";
    }

    function buildPayDetailText(calc) {
        if (calc.paidOff) return `Paid base ${calc.paidHours.toFixed(2)}h`;
        if (calc.hours <= 0) return "No hours";
        if (calc.specialH > 0) return `Special ${calc.specialH.toFixed(2)}h`;
        if (calc.otH > 0) return `Normal ${calc.normalH.toFixed(2)}h + OT ${calc.otH.toFixed(2)}h`;
        return `Normal ${calc.normalH.toFixed(2)}h`;
    }

    function renderCalendar(container, range, rows, selected, onSelect) {
        container.textContent = "";
        const today = ymd(startOfToday());
        for (const date of calendarDatesForRange(range)) {
            const dateStr = ymd(date);
            if (!isInRange(date, range)) {
                container.appendChild(make("div", "calendar-cell blank"));
                continue;
            }

            const summary = summarizeDate(dateStr, rows);
            const btn = make("button", "calendar-cell");
            btn.type = "button";
            btn.dataset.date = dateStr;
            btn.setAttribute("aria-label", `Open ${formatDate(dateStr, { weekday: "long", month: "long", day: "numeric" })}`);
            if (summary.worked) btn.classList.add("is-worked");
            else if (summary.paidOff) btn.classList.add("is-paid-off");
            else btn.classList.add("is-off");
            if (summary.sunday) btn.classList.add("is-sunday");
            if (summary.holiday) btn.classList.add("is-holiday");
            if (dateStr === today) btn.classList.add("is-today");
            if (dateStr === selected) btn.classList.add("is-selected");

            btn.appendChild(make("span", "day-num", String(date.getDate())));
            let bottomText = "";
            if (summary.amount > 0) bottomText = cellMoney(summary.amount);
            else if (summary.holiday) bottomText = "Holiday";
            else if (summary.sunday) bottomText = "Sunday";
            btn.appendChild(make("span", "day-pay", bottomText));
            btn.addEventListener("click", () => onSelect(dateStr, summary));
            container.appendChild(btn);
        }
    }

    function appendDetailRow(parent, label, value) {
        const row = make("div", "detail-row");
        row.appendChild(make("span", "", label));
        row.appendChild(make("strong", "", value));
        parent.appendChild(row);
    }

    function appendEntryDetails(parent, row, label) {
        const calc = calcRow(row);
        if (label) parent.appendChild(make("h3", "", label));
        if (calc.paidOff) {
            appendDetailRow(parent, "Type", "Paid off day");
            appendDetailRow(parent, "Worked hours", "0.00h");
            appendDetailRow(parent, "Paid base", `${calc.paidHours.toFixed(2)}h`);
            appendDetailRow(parent, "Pay rule", buildRateText(calc));
            appendDetailRow(parent, "Pay", money(calc.amount));
            return;
        }
        appendDetailRow(parent, "Time", `${row.start || "-"} to ${row.end || "-"}`);
        appendDetailRow(parent, "Break", `${row.breakMin ?? 0} min`);
        appendDetailRow(parent, "Hours", `${calc.hours.toFixed(2)}h`);
        appendDetailRow(parent, "Pay rule", buildRateText(calc));
        appendDetailRow(parent, "Breakdown", buildPayDetailText(calc));
        appendDetailRow(parent, "Pay", money(calc.amount));
    }

    function renderSelectedDay(range, rows) {
        if (!selectedDate || !isInRange(selectedDate, range)) {
            const today = ymd(startOfToday());
            selectedDate = isInRange(today, range) ? today : ymd(range.start);
        }

        const summary = summarizeDate(selectedDate, rows);
        const editable = isEditableDate(selectedDate) && summary.rows.every(row => isActiveRow(row));
        el.selectedDayPanel.textContent = "";

        const top = make("div", "selected-day-top");
        const titleWrap = make("div");
        titleWrap.appendChild(make("h3", "", formatDate(selectedDate, {
            weekday: "long",
            month: "long",
            day: "numeric",
            year: "numeric"
        })));
        const labels = [];
        if (summary.worked) labels.push("Worked");
        else if (summary.paidOff) labels.push("Paid off");
        else labels.push("Not worked");
        if (summary.sunday) labels.push("Sunday");
        if (summary.holiday) labels.push("Holiday");
        titleWrap.appendChild(make("p", "", labels.join(" / ")));
        top.appendChild(titleWrap);
        top.appendChild(make("div", "selected-total", money(summary.amount)));
        el.selectedDayPanel.appendChild(top);

        const details = make("div", "detail-grid");
        if (summary.rows.length) {
            summary.rows.forEach((row, index) => {
                appendEntryDetails(details, row, summary.rows.length > 1 ? `Shift ${index + 1}` : "");
            });
        } else {
            appendDetailRow(details, "Saved work", "None");
            appendDetailRow(details, "Expected type", summary.holiday ? "Holiday" : (summary.sunday ? "Sunday" : "Normal day"));
        }
        el.selectedDayPanel.appendChild(details);

        if (editable) {
            const actions = make("div", "selected-actions");
            const primary = make("button", "btn-primary", summary.rows.length ? "Edit Day" : "Add Work");
            primary.type = "button";
            primary.addEventListener("click", () => {
                if (summary.rows.length) openEdit(summary.rows[0].id);
                else openNewEntry(selectedDate);
            });
            actions.appendChild(primary);

            el.selectedDayPanel.appendChild(actions);
        } else {
            el.selectedDayPanel.appendChild(make("p", "helper", "This older payroll date is shown for review and CSV export."));
        }
    }

    function handleCalendarSelect(dateStr, summary) {
        selectedDate = dateStr;
        const range = getViewedCycleRange();
        const rows = rowsForViewedCycle(range);
        const editable = isEditableDate(dateStr) && summary.rows.every(row => isActiveRow(row));
        renderCalendar(el.cycleCalendar, range, rows, selectedDate, handleCalendarSelect);
        renderSelectedDay(range, rows);
        if (!summary.saved && editable) openNewEntry(dateStr);
    }

    function renderDashboard() {
        const currentRange = getCurrentCycleRange();
        const viewedRange = getViewedCycleRange();
        const monthRange = getMonthRange(startOfToday());
        const monthStats = summarizeRange(allEntries(), monthRange);
        const cycleStats = summarizeRange(entries, currentRange);
        const days = datesBetween(currentRange.start, currentRange.end);
        const todayIndex = days.findIndex(day => ymd(day) === ymd(startOfToday()));
        const elapsed = todayIndex < 0 ? days.length : todayIndex + 1;
        const progress = Math.max(0, Math.min(100, Math.round((elapsed / days.length) * 100)));
        const remainingDays = Math.max(0, days.length - elapsed);

        el.monthTotal.textContent = money(monthStats.amount);
        el.cycleTotal.textContent = money(cycleStats.amount);
        el.cycleWindow.textContent = `Cycle ${currentRange.start.getDate()}->${currentRange.end.getDate()}`;
        el.cycleTitle.textContent = formatRange(currentRange.start, currentRange.end);
        el.cycleSubtitle.textContent = `${remainingDays} day${remainingDays === 1 ? "" : "s"} left in this cycle. Tap a calendar date to add or inspect a day.`;
        el.cycleWorkDays.textContent = `${cycleStats.workedDays} day${cycleStats.workedDays === 1 ? "" : "s"}`;
        el.cycleHours.textContent = `${cycleStats.hours.toFixed(2)}h`;
        el.cycleAverage.textContent = money(cycleStats.average);
        el.cycleProgressText.textContent = `${progress}% complete`;
        el.cycleProgressBar.style.width = `${progress}%`;

        const viewedRows = rowsForViewedCycle(viewedRange);
        const viewedStats = summarizeRange(viewedRows, viewedRange);
        const paidOffDays = viewedRows.filter(row => row.paidOff).length;
        const currentCycle = cycleKey(viewedRange) === cycleKey(currentRange);
        el.monthPicker.value = monthInputValue(viewedRange.start);
        el.calendarRangeLabel.textContent = `${currentCycle ? "This cycle" : cycleName(viewedRange)}: ${money(viewedStats.amount)} total / ${viewedRows.length} saved day${viewedRows.length === 1 ? "" : "s"} / ${viewedStats.workedDays} worked / ${paidOffDays} paid off.`;
    }

    function renderEntries() {
        const range = getViewedCycleRange();
        const rows = rowsForViewedCycle(range).sort(compareEntriesDesc);
        const stats = summarizeRange(rows, range);
        const paidOffDays = rows.filter(row => row.paidOff).length;
        const name = cycleName(range);

        el.list.textContent = "";
        el.entryListTitle.textContent = `${cycleKey(range) === cycleKey(getCurrentCycleRange()) ? "Current Cycle" : name} Days`;
        el.entryCount.textContent = rows.length
            ? `${money(stats.amount)} total / ${rows.length} saved day${rows.length === 1 ? "" : "s"} / ${stats.workedDays} worked / ${paidOffDays} paid off / ${stats.hours.toFixed(2)}h`
            : `No saved days for ${name}.`;

        if (!rows.length) {
            el.list.appendChild(make("div", "empty-state", isEditableDate(ymd(range.start))
                ? "Tap a date on the calendar to add your first work day for this month."
                : "No work was recorded for this older month."));
            return;
        }

        for (const row of rows) {
            el.list.appendChild(buildCard(row, isActiveRow(row)));
        }
    }

    function buildCard(row, editable = true) {
        const node = document.importNode(el.tpl.content, true);
        const date = toDate(row.dateISO);
        const calc = calcRow(row);
        node.querySelector(".dayname").textContent = date.toLocaleDateString(undefined, { weekday: "long" });
        node.querySelector(".datestr").textContent = date.toLocaleDateString(undefined, {
            year: "numeric",
            month: "short",
            day: "numeric"
        });
        node.querySelector(".amount").textContent = money(calc.amount);
        node.querySelector(".rate").textContent = buildRateText(calc);
        if (calc.paidOff) {
            node.querySelector(".start").textContent = "Paid off";
            node.querySelector(".end").textContent = `Base ${calc.paidHours.toFixed(2)}h`;
            node.querySelector(".break").textContent = "Worked 0.00h";
            node.querySelector(".hours").textContent = money(calc.amount);
            node.querySelector(".paid-off").classList.remove("hide");
        } else {
            node.querySelector(".start").textContent = `Start ${row.start || "-"}`;
            node.querySelector(".end").textContent = `End ${row.end || "-"}`;
            node.querySelector(".break").textContent = `Break ${row.breakMin ?? 0}m`;
            node.querySelector(".hours").textContent = `${calc.hours.toFixed(2)}h`;
        }

        const payDetail = node.querySelector(".paydetail");
        payDetail.textContent = buildPayDetailText(calc);
        payDetail.classList.remove("hide");

        if (isSunday(row.dateISO)) node.querySelector(".sunday").classList.remove("hide");
        if (row.isHoliday || isAutoHoliday(row.dateISO)) node.querySelector(".holiday").classList.remove("hide");

        const actions = node.querySelector(".entry-actions");
        if (editable) {
            node.querySelector(".edit").addEventListener("click", () => openEdit(row.id));
            node.querySelector(".remove").addEventListener("click", () => removeRow(row.id));
        } else {
            actions.remove();
        }
        return node;
    }

    function render() {
        archiveCompletedCycles();
        const range = getViewedCycleRange();
        const rows = rowsForViewedCycle(range);
        if (!selectedDate || !isInRange(selectedDate, range)) {
            const today = ymd(startOfToday());
            selectedDate = isInRange(today, range) ? today : ymd(range.start);
        }
        renderDashboard();
        renderCalendar(el.cycleCalendar, range, rows, selectedDate, handleCalendarSelect);
        renderSelectedDay(range, rows);
        renderEntries();
    }

    function exportCsv() {
        const headers = [
            "Cycle",
            "Date",
            "Day",
            "Start",
            "End",
            "Break(min)",
            "Holiday",
            "PaidOff",
            "AutoOT",
            "NormalHours",
            "OTHours",
            "SpecialHours",
            "PaidOffHours",
            "SpecialType",
            "DayPay"
        ];
        const rows = allEntries().sort(compareEntriesDesc).map(row => {
            const d = toDate(row.dateISO);
            const range = getCycleRange(row.dateISO, settings.cycleStartDay);
            const calc = calcRow(row);
            const autoOt = calc.specialType || calc.paidOff ? "N/A" : (usesOvertime(row) ? "Yes" : "No");
            return [
                `"${formatRange(range.start, range.end)}"`,
                ymd(row.dateISO),
                d.toLocaleDateString(undefined, { weekday: "short" }),
                row.start || "",
                row.end || "",
                row.breakMin ?? 0,
                (row.isHoliday || isAutoHoliday(row.dateISO)) ? "Yes" : "No",
                row.paidOff ? "Yes" : "No",
                autoOt,
                calc.normalH.toFixed(2),
                calc.otH.toFixed(2),
                calc.specialH.toFixed(2),
                calc.paidHours.toFixed(2),
                calc.specialType || "normal",
                calc.amount.toFixed(2)
            ].join(",");
        });
        const csv = [headers.join(","), ...rows].join("\n");
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "workpay-timesheet.csv";
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    }

    el.openHelpBtn.addEventListener("click", () => openSheet(el.helpSheet));
    el.closeHelpBtn.addEventListener("click", () => closeSheet(el.helpSheet));

    el.openSettingsBtn.addEventListener("click", () => {
        syncSettingsToForm();
        openSheet(el.settingsSheet);
    });
    el.closeSettingsBtn.addEventListener("click", () => closeSheet(el.settingsSheet));
    el.settingsForm.addEventListener("submit", event => {
        event.preventDefault();
        saveSettingsFromForm();
        archiveCompletedCycles();
        closeSheet(el.settingsSheet);
        render();
    });
    el.autoFillCycleBtn.addEventListener("click", autoFillCycle);

    el.ed_useGlobal.addEventListener("change", () => {
        el.ed_overrides.hidden = !!el.ed_useGlobal.checked;
    });
    el.ed_cancel.addEventListener("click", () => closeSheet(el.editSheet));
    el.closeEditBtn.addEventListener("click", () => closeSheet(el.editSheet));
    el.editForm.addEventListener("submit", saveEdit);
    el.ed_paidOff.addEventListener("change", () => syncPaidOffControls("edit"));
    el.ed_date.addEventListener("change", () => {
        if (!el.ed_id.value || isAutoHoliday(el.ed_date.value)) {
            el.ed_holiday.checked = isAutoHoliday(el.ed_date.value);
        }
    });

    el.qa_editDate.addEventListener("click", () => {
        const isDisabled = el.qa_date.disabled;
        el.qa_date.disabled = !isDisabled;
        if (!isDisabled) setAutoDate();
    });
    el.qa_date.addEventListener("change", () => {
        autoTickHoliday(el.qa_date.value);
        prefillQuickAddForDate(el.qa_date.value);
    });
    el.qa_paidOff.addEventListener("change", () => syncPaidOffControls("quick"));
    el.qa_form.addEventListener("submit", submitQuickAdd);
    el.fabExport.addEventListener("click", exportCsv);
    el.prevMonthBtn.addEventListener("click", () => moveViewedCycle(-1));
    el.nextMonthBtn.addEventListener("click", () => moveViewedCycle(1));
    el.calendarTodayBtn.addEventListener("click", showCurrentCycle);
    el.monthPicker.addEventListener("change", () => jumpToCycleMonth(el.monthPicker.value));

    (function init() {
        entries = normalizeEntries(entries);
        history = normalizeHistory(history);
        settings.weekTemplate = Array.from({ length: 7 }, (_, index) => settings.weekTemplate?.[index] || { start: "", end: "" });
        saveSettings();
        saveEntries();
        saveHistory();
        el.qa_applyOt.checked = true;
        setAutoDate();
        syncPaidOffControls("quick");
        render();
    })();
})();
