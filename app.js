/* app.js — Mobile-first PayCalc
   - Secure localStorage usage (try/catch)
   - Full mobile Settings sheet
   - Quick Add (today) form
   - Sunday/holiday + OT calculations
*/
(function () {
    "use strict";

    // ===== Storage keys
    const STORE = {
        SETTINGS: "paycalc_settings_v1",
        ENTRIES: "paycalc_entries_v1"
    };

    // ===== Elements
    const el = {
        // header
        openSettingsBtn: document.getElementById("openSettingsBtn"),
        // sheet
        sheet: document.getElementById("settingsSheet"),
        closeSettingsBtn: document.getElementById("closeSettingsBtn"),
        settingsForm: document.getElementById("settingsForm"),
        autoFillCycleBtn: document.getElementById("autoFillCycleBtn"),

        // settings fields
        s_hourly: document.getElementById("s_hourly"),
        s_otThreshold: document.getElementById("s_otThreshold"),
        s_otMultiplier: document.getElementById("s_otMultiplier"),
        s_sunMult: document.getElementById("s_sunMult"),
        s_holMult: document.getElementById("s_holMult"),
        s_applyOtOnSpecial: document.getElementById("s_applyOtOnSpecial"),
        s_cycleStart: document.getElementById("s_cycleStart"),
        s_currency: document.getElementById("s_currency"),
        s_defaultBreak: document.getElementById("s_defaultBreak"),

        // week template
        week: Array.from({ length: 7 }, (_, i) => ({
            start: document.getElementById(`w${i}_start`),
            end: document.getElementById(`w${i}_end`)
        })),

        // quick add
        qa_form: document.getElementById("quickAddForm"),
        qa_date: document.getElementById("qa_date"),
        qa_start: document.getElementById("qa_start"),
        qa_end: document.getElementById("qa_end"),
        qa_break: document.getElementById("qa_break"),
        qa_holiday: document.getElementById("qa_holiday"),
        qa_addBtn: document.getElementById("qa_addBtn"),

        // entries
        list: document.getElementById("entryList"),
        tpl: document.getElementById("entryCardTpl"),

        // fab
        fabAdd: document.getElementById("fabAdd")
    };

    // ===== Data
    let settings = loadSettings() || {
        hourly: 0,
        otThreshold: 8,
        otMultiplier: 1.5,
        sundayMultiplier: 2,
        holidayMultiplier: 2,
        applyOtOnSpecial: false,
        cycleStartDay: 21,
        currency: "R",
        defaultBreak: 60,
        weekTemplate: [
            { start: "08:00", end: "16:00" }, // Sun
            { start: "08:00", end: "17:00" }, // Mon
            { start: "08:00", end: "17:00" }, // Tue
            { start: "08:00", end: "17:00" }, // Wed
            { start: "08:00", end: "17:00" }, // Thu
            { start: "08:00", end: "17:00" }, // Fri
            { start: "08:00", end: "13:00" }  // Sat
        ]
    };

    let entries = loadEntries() || []; // {id,dateISO,start,end,breakMin,isHoliday}

    // ===== Utils
    function clamp(n, lo, hi) {
        const x = Number.isFinite(+n) ? +n : 0;
        if (Number.isFinite(lo) && x < lo) return lo;
        if (Number.isFinite(hi) && x > hi) return hi;
        return x;
    }
    function parseTime(hhmm) {
        if (typeof hhmm !== "string" || !/^\d{2}:\d{2}$/.test(hhmm)) return null;
        const [h, m] = hhmm.split(":").map(Number);
        if (h < 0 || h > 23 || m < 0 || m > 59) return null;
        return h * 60 + m;
    }
    function fmtMoney(n) {
        try { return new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0); }
        catch { return (n || 0).toFixed(2); }
    }
    function isSunday(date) { return new Date(date).getDay() === 0; }
    function isoDateLocal(y, m, d) { return new Date(y, m, d).toISOString(); }
    function todayLocalISO() {
        const now = new Date();
        return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    }
    function randId() {
        try {
            const a = new Uint32Array(2); crypto.getRandomValues(a);
            return [...a].map(x => x.toString(16).padStart(8, "0")).join("");
        } catch { return String(Date.now()) + Math.random().toString(16).slice(2); }
    }

    // ===== Load/Save
    function loadSettings() {
        try { return JSON.parse(localStorage.getItem(STORE.SETTINGS) || "null"); } catch { return null; }
    }
    function saveSettings() {
        try { localStorage.setItem(STORE.SETTINGS, JSON.stringify(settings)); } catch {}
    }
    function loadEntries() {
        try { return JSON.parse(localStorage.getItem(STORE.ENTRIES) || "null") || []; } catch { return []; }
    }
    function saveEntries() {
        try { localStorage.setItem(STORE.ENTRIES, JSON.stringify(entries)); } catch {}
    }

    // ===== Calculations
    function calcRow(row) {
        const d = new Date(row.dateISO);
        const sunday = isSunday(d);
        const holiday = !!row.isHoliday;

        const hr = clamp(settings.hourly, 0, 1e9);
        const otTh = clamp(settings.otThreshold, 0, 24);
        const otMul = clamp(settings.otMultiplier, 1, 10);
        const sunMul = clamp(settings.sundayMultiplier, 1, 10);
        const holMul = clamp(settings.holidayMultiplier, 1, 10);
        const applySpecialOT = !!settings.applyOtOnSpecial;

        const sMin = parseTime(row.start);
        const eMin = parseTime(row.end);
        const brk = clamp(row.breakMin, 0, 24 * 60);

        let totalMin = 0;
        if (sMin !== null && eMin !== null) {
            let e = eMin;
            if (eMin <= sMin) e = eMin + 24 * 60; // crosses midnight safe
            totalMin = Math.max(0, e - sMin - brk);
        }
        const hours = totalMin / 60;

        const specialMult = holiday ? holMul : (sunday ? sunMul : 1);

        let normalH = 0;
        let otH = 0;
        if (specialMult > 1) {
            if (applySpecialOT) {
                normalH = Math.min(hours, otTh);
                otH = Math.max(0, hours - otTh);
            } else {
                normalH = hours;
                otH = 0;
            }
        } else {
            normalH = Math.min(hours, otTh);
            otH = Math.max(0, hours - otTh);
        }

        const normalPay = normalH * hr * specialMult;
        const otPay = (applySpecialOT && specialMult > 1)
            ? otH * hr * specialMult * otMul
            : otH * hr * otMul;

        return {
            hours, normalH, otH,
            amount: normalPay + otPay,
            multiplier: specialMult
        };
    }

    // ===== Render
    function render() {
        // list
        entries.sort((a, b) => (a.dateISO < b.dateISO ? -1 : a.dateISO > b.dateISO ? 1 : 0));
        el.list.textContent = "";
        for (const row of entries) {
            const view = buildCard(row);
            el.list.appendChild(view);
        }
    }

    function buildCard(row) {
        const node = document.importNode(el.tpl.content, true);
        const d = new Date(row.dateISO);
        const dayname = d.toLocaleDateString(undefined, { weekday: "short" });
        const datestr = d.toLocaleDateString();

        const calc = calcRow(row);
        node.querySelector(".dayname").textContent = dayname;
        node.querySelector(".datestr").textContent = datestr;
        node.querySelector(".amount").textContent = (settings.currency || "R") + " " + fmtMoney(calc.amount);
        node.querySelector(".rate").textContent = `×${calc.multiplier.toFixed(2)}`;
        node.querySelector(".start").textContent = "Start " + (row.start || "—");
        node.querySelector(".end").textContent   = "End " + (row.end || "—");
        node.querySelector(".break").textContent = "Break " + (row.breakMin ?? 0) + "m";
        if (isSunday(row.dateISO)) node.querySelector(".sunday").classList.remove("hide");
        if (row.isHoliday) node.querySelector(".holiday").classList.remove("hide");

        node.querySelector(".edit").addEventListener("click", () => editRow(row.id));
        node.querySelector(".remove").addEventListener("click", () => removeRow(row.id));

        return node;
    }

    // ===== Row CRUD
    function addRow(dateISO, start, end, breakMin, isHoliday) {
        entries.push({
            id: randId(),
            dateISO,
            start: start || "",
            end: end || "",
            breakMin: clamp(breakMin, 0, 24 * 60),
            isHoliday: !!isHoliday
        });
        saveEntries();
        render();
    }

    function removeRow(id) {
        entries = entries.filter(x => x.id !== id);
        saveEntries();
        render();
    }

    function editRow(id) {
        const row = entries.find(x => x.id === id);
        if (!row) return;
        // For mobile simplicity, reuse Quick Add controls as an edit pop-in
        el.qa_date.value = new Date(row.dateISO).toISOString().slice(0,10);
        el.qa_start.value = row.start || "";
        el.qa_end.value = row.end || "";
        el.qa_break.value = row.breakMin ?? settings.defaultBreak;
        el.qa_holiday.checked = !!row.isHoliday;

        // On next submit, update instead of add (one-shot handler)
        const once = (ev) => {
            ev.preventDefault();
            row.dateISO = new Date(el.qa_date.value + "T00:00:00").toISOString();
            row.start = el.qa_start.value || "";
            row.end = el.qa_end.value || "";
            row.breakMin = clamp(el.qa_break.value, 0, 24*60);
            row.isHoliday = !!el.qa_holiday.checked;
            saveEntries();
            render();
            el.qa_form.removeEventListener("submit", once);
        };
        el.qa_form.addEventListener("submit", once);
        window.scrollTo({ top: 0, behavior: "smooth" });
    }

    // ===== Auto-fill (21→20 cycle) — just to pre-create rows quickly
    function daysInMonth(year, monthIdx) {
        return new Date(year, monthIdx + 1, 0).getDate();
    }
    function getCycleRange(year, monthIdx, startDay) {
        const sd = clamp(startDay, 1, 28);
        const start = new Date(year, monthIdx, sd);
        const nextSame = new Date(year, monthIdx + 1, sd);
        const end = new Date(nextSame.getFullYear(), nextSame.getMonth(), nextSame.getDate() - 1);
        return { start, end };
    }
    function autoFillCycle() {
        const now = new Date();
        const y = now.getFullYear();
        const m = now.getMonth();
        const { start, end } = getCycleRange(y, m, settings.cycleStartDay);
        const defBreak = clamp(settings.defaultBreak, 0, 24*60);

        // remove any existing rows in this range to avoid duplicates
        entries = entries.filter(e => {
            const d = new Date(e.dateISO);
            return !(d >= start && d <= end);
        });

        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            const dow = d.getDay(); // 0..6
            const tmpl = settings.weekTemplate[dow] || { start: "", end: "" };
            addRow(new Date(d).toISOString(), tmpl.start || "", tmpl.end || "", defBreak, false);
        }
        saveEntries();
        render();
    }

    // ===== Settings Sheet UI
    function openSheet() { el.sheet.setAttribute("aria-hidden", "false"); }
    function closeSheet() { el.sheet.setAttribute("aria-hidden", "true"); }

    function syncSettingsToForm() {
        el.s_hourly.value = settings.hourly ?? 0;
        el.s_otThreshold.value = settings.otThreshold ?? 8;
        el.s_otMultiplier.value = settings.otMultiplier ?? 1.5;
        el.s_sunMult.value = settings.sundayMultiplier ?? 2;
        el.s_holMult.value = settings.holidayMultiplier ?? 2;
        el.s_applyOtOnSpecial.checked = !!settings.applyOtOnSpecial;
        el.s_cycleStart.value = settings.cycleStartDay ?? 21;
        el.s_currency.value = settings.currency ?? "R";
        el.s_defaultBreak.value = settings.defaultBreak ?? 60;

        for (let i = 0; i < 7; i++) {
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
            applyOtOnSpecial: !!el.s_applyOtOnSpecial.checked,
            cycleStartDay: clamp(el.s_cycleStart.value, 1, 28),
            currency: String(el.s_currency.value || "R").slice(0, 4),
            defaultBreak: clamp(el.s_defaultBreak.value, 0, 24*60),
            weekTemplate: el.week.map(w => ({ start: w.start.value || "", end: w.end.value || "" }))
        };
        saveSettings();
    }

    // ===== Events
    el.openSettingsBtn.addEventListener("click", () => { syncSettingsToForm(); openSheet(); });
    el.closeSettingsBtn.addEventListener("click", closeSheet);

    el.settingsForm.addEventListener("submit", (e) => {
        e.preventDefault();
        saveSettingsFromForm();
        closeSheet();
        render();
    });
    el.autoFillCycleBtn.addEventListener("click", autoFillCycle);

    // Quick Add
    el.qa_form.addEventListener("submit", (e) => {
        e.preventDefault();
        const dateISO = new Date(el.qa_date.value + "T00:00:00").toISOString();
        const start = el.qa_start.value;
        const end = el.qa_end.value;
        const brk = clamp(el.qa_break.value, 0, 24*60);
        const hol = !!el.qa_holiday.checked;
        addRow(dateISO, start, end, brk, hol);
        // keep date, but clear times for fast next entry
        el.qa_start.value = ""; el.qa_end.value = "";
    });

    // FAB opens Quick Add with defaults
    el.fabAdd.addEventListener("click", () => {
        el.qa_date.value = new Date().toISOString().slice(0,10);
        const dow = new Date().getDay();
        el.qa_start.value = settings.weekTemplate[dow]?.start || "";
        el.qa_end.value = settings.weekTemplate[dow]?.end || "";
        el.qa_break.value = settings.defaultBreak ?? 60;
        el.qa_holiday.checked = false;
        window.scrollTo({ top: 0, behavior: "smooth" });
    });

    // ===== Boot
    (function init() {
        // default Quick Add to today (Durban local device time)
        el.qa_date.value = new Date().toISOString().slice(0,10);
        el.qa_break.value = settings.defaultBreak ?? 60;
        render();
    })();
})();