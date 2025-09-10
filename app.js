/* app.js — Mobile-first PayCalc with:
   - Help sheet (detailed instructions)
   - Auto date for Add Today (editable on demand)
   - Full-screen Edit sheet with per-day overrides
   - Add Today uses settings/template instantly
   - FAB = Download CSV
   - Totals bar (Month + 21→20 Cycle)
*/
(function () {
    "use strict";

    // ===== Storage keys
    const STORE = {
        SETTINGS: "paycalc_settings_v2",
        ENTRIES: "paycalc_entries_v2"
    };

    // ===== Elements
    const el = {
        // header
        openHelpBtn: document.getElementById("openHelpBtn"),
        openSettingsBtn: document.getElementById("openSettingsBtn"),

        // totals bar
        monthTotal: document.getElementById("monthTotal"),
        cycleTotal: document.getElementById("cycleTotal"),

        // sheets
        helpSheet: document.getElementById("helpSheet"),
        closeHelpBtn: document.getElementById("closeHelpBtn"),
        settingsSheet: document.getElementById("settingsSheet"),
        closeSettingsBtn: document.getElementById("closeSettingsBtn"),
        editSheet: document.getElementById("editSheet"),
        closeEditBtn: document.getElementById("closeEditBtn"),

        // settings form
        settingsForm: document.getElementById("settingsForm"),
        autoFillCycleBtn: document.getElementById("autoFillCycleBtn"),
        s_hourly: document.getElementById("s_hourly"),
        s_otThreshold: document.getElementById("s_otThreshold"),
        s_otMultiplier: document.getElementById("s_otMultiplier"),
        s_sunMult: document.getElementById("s_sunMult"),
        s_holMult: document.getElementById("s_holMult"),
        s_applyOtOnSpecial: document.getElementById("s_applyOtOnSpecial"),
        s_cycleStart: document.getElementById("s_cycleStart"),
        s_currency: document.getElementById("s_currency"),
        s_defaultBreak: document.getElementById("s_defaultBreak"),
        week: Array.from({ length: 7 }, (_, i) => ({
            start: document.getElementById(`w${i}_start`),
            end: document.getElementById(`w${i}_end`)
        })),

        // quick add
        qa_form: document.getElementById("quickAddForm"),
        qa_date: document.getElementById("qa_date"),
        qa_editDate: document.getElementById("qa_editDate"),
        qa_start: document.getElementById("qa_start"),
        qa_end: document.getElementById("qa_end"),
        qa_break: document.getElementById("qa_break"),
        qa_holiday: document.getElementById("qa_holiday"),

        // entries
        list: document.getElementById("entryList"),
        tpl: document.getElementById("entryCardTpl"),

        // export
        fabExport: document.getElementById("fabExport"),

        // edit
        editForm: document.getElementById("editForm"),
        ed_id: document.getElementById("ed_id"),
        ed_date: document.getElementById("ed_date"),
        ed_holiday: document.getElementById("ed_holiday"),
        ed_start: document.getElementById("ed_start"),
        ed_end: document.getElementById("ed_end"),
        ed_break: document.getElementById("ed_break"),
        ed_useGlobal: document.getElementById("ed_useGlobal"),
        ed_overrides: document.getElementById("ed_overrides"),
        ed_hourly: document.getElementById("ed_hourly"),
        ed_otTh: document.getElementById("ed_otTh"),
        ed_otMul: document.getElementById("ed_otMul"),
        ed_sunMul: document.getElementById("ed_sunMul"),
        ed_holMul: document.getElementById("ed_holMul"),
        ed_applySpecialOT: document.getElementById("ed_applySpecialOT"),
        ed_cancel: document.getElementById("ed_cancel"),
        ed_save: document.getElementById("ed_save"),
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

    // entries: {id,dateISO,start,end,breakMin,isHoliday, overrides?:{...}}
    let entries = loadEntries() || [];

    // ===== Utils
    function clamp(n, lo, hi) {
        const x = Number.isFinite(+n) ? +n : 0;
        if (Number.isFinite(lo) && x < lo) return lo;
        if (Number.isFinite(hi) && x > hi) return hi;
        return x;
    }
    function parseTime(hhmm) {
        if (typeof hhmm !== "string" || !/^\d{2}:\d{2}$/.test(hhmm)) return null;
        const [h,m] = hhmm.split(":").map(Number);
        if (h<0||h>23||m<0||m>59) return null;
        return h*60+m;
    }
    function fmtMoney(n) {
        try { return new Intl.NumberFormat(undefined,{minimumFractionDigits:2,maximumFractionDigits:2}).format(n||0); }
        catch { return (n||0).toFixed(2); }
    }
    function isSunday(date) { return new Date(date).getDay() === 0; }
    function startOfTodayISO() {
        const now = new Date();
        return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    }
    function ymd(date) { return new Date(date).toISOString().slice(0,10); }

    // ===== Load/Save
    function loadSettings(){ try{ return JSON.parse(localStorage.getItem(STORE.SETTINGS)||"null"); }catch{ return null; } }
    function saveSettings(){ try{ localStorage.setItem(STORE.SETTINGS, JSON.stringify(settings)); }catch{} }
    function loadEntries(){ try{ return JSON.parse(localStorage.getItem(STORE.ENTRIES)||"null")||[]; }catch{ return []; } }
    function saveEntries(){ try{ localStorage.setItem(STORE.ENTRIES, JSON.stringify(entries)); }catch{} }

    // ===== Calculations
    function resolveRates(row){
        if (row.overrides && !row.overrides.useGlobal) {
            const o = row.overrides;
            return {
                hourly: clamp(o.hourly ?? settings.hourly, 0, 1e9),
                otThreshold: clamp(o.otThreshold ?? settings.otThreshold, 0, 24),
                otMultiplier: clamp(o.otMultiplier ?? settings.otMultiplier, 1, 10),
                sundayMultiplier: clamp(o.sundayMultiplier ?? settings.sundayMultiplier, 1, 10),
                holidayMultiplier: clamp(o.holidayMultiplier ?? settings.holidayMultiplier, 1, 10),
                applyOtOnSpecial: !!(o.applyOtOnSpecial ?? settings.applyOtOnSpecial)
            };
        }
        return {...settings};
    }

    function calcRow(row) {
        const d = new Date(row.dateISO);
        const sunday = isSunday(d);
        const holiday = !!row.isHoliday;

        const rates = resolveRates(row);
        const hr = rates.hourly;
        const otTh = rates.otThreshold;
        const otMul = rates.otMultiplier;
        const sunMul = rates.sundayMultiplier;
        const holMul = rates.holidayMultiplier;
        const applySpecialOT = !!rates.applyOtOnSpecial;

        const sMin = parseTime(row.start);
        const eMin = parseTime(row.end);
        const brk = clamp(row.breakMin, 0, 24*60);

        let totalMin = 0;
        if (sMin !== null && eMin !== null) {
            let e = eMin;
            if (eMin <= sMin) e = eMin + 24*60;
            totalMin = Math.max(0, e - sMin - brk);
        }
        const hours = totalMin/60;

        const specialMult = holiday ? holMul : (sunday ? sunMul : 1);
        let normalH = 0, otH = 0;

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

        return { hours, normalH, otH, amount: normalPay + otPay, multiplier: specialMult };
    }

    // Totals for calendar month / cycle
    function getMonthRange(date){
        const d = new Date(date);
        const y = d.getFullYear(), m = d.getMonth();
        const start = new Date(y, m, 1);
        const end = new Date(y, m+1, 0, 23,59,59,999);
        return {start, end};
    }
    function getCycleRange(anchorDate, startDay){
        const d = new Date(anchorDate);
        const y = d.getFullYear(), m = d.getMonth();
        const sd = clamp(startDay,1,28);
        const start = new Date(y, m, sd);
        // if current date is before start day, use previous month start
        if (d < start) {
            start.setMonth(start.getMonth()-1);
        }
        const next = new Date(start.getFullYear(), start.getMonth()+1, sd);
        const end = new Date(next.getFullYear(), next.getMonth(), next.getDate()-1, 23,59,59,999);
        return {start, end};
    }

    function computeTotals(){
        const now = new Date();
        const monthRange = getMonthRange(now);
        const cycleRange = getCycleRange(now, settings.cycleStartDay);

        let monthSum = 0, cycleSum = 0;
        for (const r of entries) {
            const d = new Date(r.dateISO);
            const amt = calcRow(r).amount;
            if (d >= monthRange.start && d <= monthRange.end) monthSum += amt;
            if (d >= cycleRange.start && d <= cycleRange.end) cycleSum += amt;
        }
        el.monthTotal.textContent = (settings.currency || "R") + " " + fmtMoney(monthSum);
        el.cycleTotal.textContent = (settings.currency || "R") + " " + fmtMoney(cycleSum);
    }

    // ===== Render
    function render() {
        entries.sort((a,b)=> a.dateISO<b.dateISO?-1:a.dateISO>b.dateISO?1:0);
        el.list.textContent = "";
        for (const row of entries) el.list.appendChild(buildCard(row));
        computeTotals();
    }

    function buildCard(row) {
        const node = document.importNode(el.tpl.content, true);
        const d = new Date(row.dateISO);
        node.querySelector(".dayname").textContent = d.toLocaleDateString(undefined,{weekday:"short"});
        node.querySelector(".datestr").textContent = d.toLocaleDateString();

        const calc = calcRow(row);
        node.querySelector(".amount").textContent = (settings.currency || "R") + " " + fmtMoney(calc.amount);
        node.querySelector(".rate").textContent = `×${calc.multiplier.toFixed(2)}`;

        node.querySelector(".start").textContent = "Start " + (row.start || "—");
        node.querySelector(".end").textContent = "End " + (row.end || "—");
        node.querySelector(".break").textContent = "Break " + (row.breakMin ?? 0) + "m";

        if (isSunday(row.dateISO)) node.querySelector(".sunday").classList.remove("hide");
        if (row.isHoliday) node.querySelector(".holiday").classList.remove("hide");

        node.querySelector(".edit").addEventListener("click", () => openEdit(row.id));
        node.querySelector(".remove").addEventListener("click", () => removeRow(row.id));
        return node;
    }

    // ===== Row CRUD
    function addRow(dateISO, start, end, breakMin, isHoliday, overrides) {
        entries.push({
            id: cryptoId(),
            dateISO,
            start: start || "",
            end: end || "",
            breakMin: clamp(breakMin, 0, 24*60),
            isHoliday: !!isHoliday,
            overrides: overrides || { useGlobal: true }
        });
        saveEntries();
        render();
    }

    function removeRow(id) {
        entries = entries.filter(x => x.id !== id);
        saveEntries();
        render();
    }

    function cryptoId(){
        try { const a=new Uint32Array(2); crypto.getRandomValues(a); return [...a].map(x=>x.toString(16).padStart(8,"0")).join(""); }
        catch { return String(Date.now()) + Math.random().toString(16).slice(2); }
    }

    // ===== Settings
    function syncSettingsToForm(){
        el.s_hourly.value = settings.hourly ?? 0;
        el.s_otThreshold.value = settings.otThreshold ?? 8;
        el.s_otMultiplier.value = settings.otMultiplier ?? 1.5;
        el.s_sunMult.value = settings.sundayMultiplier ?? 2;
        el.s_holMult.value = settings.holidayMultiplier ?? 2;
        el.s_applyOtOnSpecial.checked = !!settings.applyOtOnSpecial;
        el.s_cycleStart.value = settings.cycleStartDay ?? 21;
        el.s_currency.value = settings.currency ?? "R";
        el.s_defaultBreak.value = settings.defaultBreak ?? 60;
        for (let i=0;i<7;i++){
            el.week[i].start.value = settings.weekTemplate[i]?.start || "";
            el.week[i].end.value = settings.weekTemplate[i]?.end || "";
        }
    }
    function saveSettingsFromForm(){
        settings = {
            hourly: clamp(el.s_hourly.value, 0, 1e9),
            otThreshold: clamp(el.s_otThreshold.value, 0, 24),
            otMultiplier: clamp(el.s_otMultiplier.value, 1, 10),
            sundayMultiplier: clamp(el.s_sunMult.value, 1, 10),
            holidayMultiplier: clamp(el.s_holMult.value, 1, 10),
            applyOtOnSpecial: !!el.s_applyOtOnSpecial.checked,
            cycleStartDay: clamp(el.s_cycleStart.value, 1, 28),
            currency: String(el.s_currency.value || "R").slice(0,4),
            defaultBreak: clamp(el.s_defaultBreak.value, 0, 24*60),
            weekTemplate: el.week.map(w => ({ start: w.start.value || "", end: w.end.value || "" }))
        };
        saveSettings();
    }

    // Auto-fill (current cycle)
    function daysInMonth(y,m){ return new Date(y, m+1, 0).getDate(); }
    function getCycleRangeFromNow(){
        const now = new Date();
        const sd = settings.cycleStartDay || 21;
        const {start,end} = getCycleRange(now, sd);
        return {start,end};
    }
    function autoFillCycle(){
        const {start,end} = getCycleRangeFromNow();
        const defBreak = clamp(settings.defaultBreak, 0, 24*60);

        // remove rows in range to avoid dupes
        entries = entries.filter(e=> {
            const d=new Date(e.dateISO);
            return !(d>=start && d<=end);
        });

        for(let d=new Date(start); d<=end; d.setDate(d.getDate()+1)){
            const dow = d.getDay();
            const t = settings.weekTemplate[dow] || {start:"",end:""};
            addRow(new Date(d).toISOString(), t.start||"", t.end||"", defBreak, false, {useGlobal:true});
        }
    }

    // ===== Help/Settings Sheet open/close
    function openSheet(sheet){ sheet.setAttribute("aria-hidden","false"); }
    function closeSheet(sheet){ sheet.setAttribute("aria-hidden","true"); }

    // ===== Edit full-screen
    function openEdit(id){
        const r = entries.find(x=>x.id===id);
        if (!r) return;
        el.ed_id.value = r.id;
        el.ed_date.value = ymd(r.dateISO);
        el.ed_holiday.checked = !!r.isHoliday;
        el.ed_start.value = r.start || "";
        el.ed_end.value = r.end || "";
        el.ed_break.value = r.breakMin ?? settings.defaultBreak;

        const useGlobal = !(r.overrides && r.overrides.useGlobal===false) ? true : false;
        el.ed_useGlobal.checked = useGlobal;
        el.ed_overrides.hidden = useGlobal;

        // fill overrides if any
        const o = r.overrides || {};
        el.ed_hourly.value = o.hourly ?? "";
        el.ed_otTh.value = o.otThreshold ?? "";
        el.ed_otMul.value = o.otMultiplier ?? "";
        el.ed_sunMul.value = o.sundayMultiplier ?? "";
        el.ed_holMul.value = o.holidayMultiplier ?? "";
        el.ed_applySpecialOT.checked = !!o.applyOtOnSpecial;

        openSheet(el.editSheet);
    }

    function saveEdit(e){
        e.preventDefault();
        const id = el.ed_id.value;
        const i = entries.findIndex(x=>x.id===id);
        if (i===-1) return;
        const r = entries[i];
        r.dateISO = new Date(el.ed_date.value + "T00:00:00").toISOString();
        r.isHoliday = !!el.ed_holiday.checked;
        r.start = el.ed_start.value || "";
        r.end = el.ed_end.value || "";
        r.breakMin = clamp(el.ed_break.value,0,24*60);

        const useGlobal = !!el.ed_useGlobal.checked;
        if (useGlobal){
            r.overrides = { useGlobal: true };
        } else {
            r.overrides = {
                useGlobal: false,
                hourly: el.ed_hourly.value ? clamp(el.ed_hourly.value,0,1e9) : null,
                otThreshold: el.ed_otTh.value ? clamp(el.ed_otTh.value,0,24) : null,
                otMultiplier: el.ed_otMul.value ? clamp(el.ed_otMul.value,1,10) : null,
                sundayMultiplier: el.ed_sunMul.value ? clamp(el.ed_sunMul.value,1,10) : null,
                holidayMultiplier: el.ed_holMul.value ? clamp(el.ed_holMul.value,1,10) : null,
                applyOtOnSpecial: !!el.ed_applySpecialOT.checked
            };
        }
        entries[i]=r; saveEntries(); render(); closeSheet(el.editSheet);
    }

    // ===== Download CSV
    function exportCsv(){
        const headers = ["Date","Day","Start","End","Break(min)","Holiday","NormalHours","OTHours","RateMultiplier","DayPay"];
        const rows = entries.map(e=>{
            const d = new Date(e.dateISO);
            const c = calcRow(e);
            const day = d.toLocaleDateString(undefined,{weekday:"short"});
            return [
                ymd(e.dateISO), day, e.start||"", e.end||"", e.breakMin??0, e.isHoliday?"Yes":"No",
                c.normalH.toFixed(2), c.otH.toFixed(2), c.multiplier.toFixed(2), c.amount.toFixed(2)
            ].join(",");
        });
        const csv = [headers.join(","), ...rows].join("\n");
        const blob = new Blob([csv], {type:"text/csv;charset=utf-8"});
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = "timesheet.csv";
        document.body.appendChild(a); a.click(); a.remove();
        URL.revokeObjectURL(url);
    }

    // ===== Quick Add behavior
    function setAutoDate(){
        el.qa_date.value = ymd(startOfTodayISO());
    }
    function prefillFromTemplateForToday(){
        const dow = new Date().getDay();
        el.qa_start.value = settings.weekTemplate[dow]?.start || "";
        el.qa_end.value = settings.weekTemplate[dow]?.end || "";
        el.qa_break.value = settings.defaultBreak ?? 60;
        el.qa_holiday.checked = false;
    }

    function submitQuickAdd(ev){
        ev.preventDefault();
        // Use automatic date unless user changed it
        const dateStr = el.qa_date.value || ymd(startOfTodayISO());
        const dISO = new Date(dateStr + "T00:00:00").toISOString();

        // If empty, fill from template at add-time
        let start = el.qa_start.value;
        let end = el.qa_end.value;
        if (!start || !end) {
            const dow = new Date(dISO).getDay();
            start = start || (settings.weekTemplate[dow]?.start || "");
            end   = end   || (settings.weekTemplate[dow]?.end || "");
        }
        const brk = clamp(el.qa_break.value || settings.defaultBreak || 0, 0, 24*60);
        const hol = !!el.qa_holiday.checked;

        addRow(dISO, start, end, brk, hol, {useGlobal:true});

        // Clear times for fast next entry (date stays today)
        el.qa_start.value = ""; el.qa_end.value = "";
    }

    // ===== Events
    // help
    el.openHelpBtn.addEventListener("click", ()=> openSheet(el.helpSheet));
    el.closeHelpBtn.addEventListener("click", ()=> closeSheet(el.helpSheet));

    // settings
    el.openSettingsBtn.addEventListener("click", ()=> { syncSettingsToForm(); openSheet(el.settingsSheet); });
    el.closeSettingsBtn.addEventListener("click", ()=> closeSheet(el.settingsSheet));
    el.settingsForm.addEventListener("submit",(e)=>{ e.preventDefault(); saveSettingsFromForm(); closeSheet(el.settingsSheet); render(); });
    el.autoFillCycleBtn.addEventListener("click", autoFillCycle);

    // edit
    el.ed_useGlobal.addEventListener("change", ()=> { el.ed_overrides.hidden = !!el.ed_useGlobal.checked; });
    el.ed_cancel.addEventListener("click", ()=> closeSheet(el.editSheet));
    el.editForm.addEventListener("submit", saveEdit);
    el.closeEditBtn.addEventListener("click", ()=> closeSheet(el.editSheet));

    // quick add
    el.qa_editDate.addEventListener("click", ()=>{
        const isDisabled = el.qa_date.disabled;
        el.qa_date.disabled = !isDisabled;
        if (!isDisabled) { // turning editing off -> reset to today
            setAutoDate();
        }
    });
    el.qa_form.addEventListener("submit", submitQuickAdd);

    // export
    el.fabExport.addEventListener("click", exportCsv);

    // ===== Boot
    (function init(){
        setAutoDate();
        prefillFromTemplateForToday();
        render();
    })();
})();