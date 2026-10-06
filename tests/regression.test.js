"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM, VirtualConsole } = require("jsdom");
const root = path.resolve(__dirname, "..");
const read = name => fs.readFileSync(path.join(root, name), "utf8");
const scripts = ["holiday-pay.js", "day-choices.js", "core.js", "direct-date-edit.js", "app.js"];
const errors = [];
function boot(seed = {}, coreSource) {
    const dom = new JSDOM(read("index.html"), {
        url: "http://localhost:8765", runScripts: "outside-only", pretendToBeVisual: true,
        virtualConsole: new VirtualConsole().on("jsdomError", error => errors.push(error))
    });
    const w = dom.window;
    const RealDate = w.Date;
    w.Date = class extends RealDate {
        constructor(...args) { super(...(args.length ? args : [2026, 9, 5, 12])); }
        static now() { return new RealDate(2026, 9, 5, 12).getTime(); }
    };
    const observers = [];
    const NativeObserver = w.MutationObserver;
    w.MutationObserver = class extends NativeObserver {
        constructor(callback) { super(callback); observers.push(this); }
    };
    const close = w.close.bind(w);
    w.close = () => { observers.forEach(observer => observer.disconnect()); close(); };
    w.alerts = [];
    w.alert = text => w.alerts.push(text);
    w.confirm = () => true;
    w.scrollTo = () => {};
    w.matchMedia = () => ({ matches: false, addEventListener() {} });
    for (const [key, value] of Object.entries(seed)) w.localStorage.setItem(key, JSON.stringify(value));
    for (const name of scripts) w.eval(name === "core.js" && coreSource ? coreSource : read(name));
    return dom;
}
const SETTINGS = "paycalc_settings_v2";
const ENTRIES = "paycalc_entries_v2";
const HISTORY = "paycalc_history_v1";
const settings = { hourly: 100, otThreshold: 9, defaultBreak: 60 };
const day = { id: "existing", dateISO: "2026-10-05", start: "08:00", end: "20:00", breakMin: 60, applyOvertime: true };

const snapshot = w => Object.fromEntries(Array.from({ length: w.localStorage.length }, (_, i) => {
    const key = w.localStorage.key(i);
    return [key, JSON.parse(w.localStorage.getItem(key))];
}));
const storedRows = w => [...JSON.parse(w.localStorage.getItem(ENTRIES) || "[]"),
    ...JSON.parse(w.localStorage.getItem(HISTORY) || "[]").flatMap(cycle => cycle.entries)];
const rowById = (w, id) => storedRows(w).find(row => row.id === id);
const rowByDate = (w, date) => storedRows(w).find(row => {
    const value = new w.Date(row.dateISO);
    const key = [value.getFullYear(), String(value.getMonth() + 1).padStart(2, "0"), String(value.getDate()).padStart(2, "0")].join("-");
    return key === date;
});
const text = (w, id) => w.document.getElementById(id).textContent;
const money = (w, id = "allTimeMoney") => Number(text(w, id).replace(/[^0-9.-]/g, ""));
const field = (w, id, value) => {
    const input = w.document.getElementById(id);
    if (typeof value === "boolean") input.checked = value;
    else input.value = value;
    input.dispatchEvent(new w.Event("change", { bubbles: true }));
};
const submit = (w, id) => w.document.getElementById(id).dispatchEvent(new w.Event("submit", { bubbles: true, cancelable: true }));
const edit = (w, date) => w.document.dispatchEvent(new w.CustomEvent("workpay:edit-date", { detail: { date } }));
const verify = (name, callback) => { callback(); console.log("PASS " + name); };
async function run() {
    require("./holiday-pay.test.js");
    require("./static-integrity.test.js");
    verify("saved active and historical days survive startup and repeated reloads", () => {
        const history = [{ key: "old", startISO: "2026-08-21", endISO: "2026-09-20", entries: [{ ...day, id: "past", dateISO: "2026-09-01", overrides: { useGlobal: false, hourly: 70, otThreshold: 9, otMultiplier: 1.5 } }] }];
        let dom = boot({ [SETTINGS]: settings, [ENTRIES]: [day], [HISTORY]: history }, process.env.WORKPAY_TEST_CORE ? fs.readFileSync(process.env.WORKPAY_TEST_CORE, "utf8") : undefined);
        for (let i = 0; i < 3; i++) {
            const w = dom.window;
            assert.equal(rowById(w, "existing").start, "08:00");
            assert.equal(rowById(w, "past").overrides.hourly, 70);
            const saved = snapshot(w); w.close(); dom = boot(saved);
        }
        dom.window.close();
    });
    verify("normal pay and overtime hours are separated, including minutes", () => {
        const dom = boot({ [SETTINGS]: settings, [ENTRIES]: [day] }); const w = dom.window;
        assert.equal(money(w), 1200); // Nine normal hours and two overtime hours.
        assert.equal(text(w, "allTimeNormalHours"), "9.00h");
        assert.equal(text(w, "allTimeOvertimeHours"), "2.00h");
        edit(w, "2026-10-05"); field(w, "ed_end", "18:15"); submit(w, "editForm");
        assert.equal(money(w), 937.5); assert.equal(text(w, "allTimeOvertimeHours"), "0.25h");
        edit(w, "2026-10-05"); field(w, "ed_end", "18:00"); submit(w, "editForm");
        assert.equal(money(w), 900); assert.equal(text(w, "allTimeOvertimeHours"), "0.00h");
        w.close();
    });
    verify("zero-minute break is respected by Fast Entry", () => {
        const dom = boot({ [SETTINGS]: settings }); const w = dom.window;
        field(w, "qa_start", "08:00"); field(w, "qa_end", "18:00"); field(w, "qa_break", "0"); submit(w, "quickAddForm");
        assert.equal(rowByDate(w, "2026-10-05").breakMin, 0);
        assert.equal(text(w, "allTimeHours"), "10.00h"); assert.equal(money(w), 1050);
        w.close();
    });
    verify("holiday pay defaults to double all worked hours with no normal OT", () => {
        const dom = boot({ [SETTINGS]: settings }); const w = dom.window;
        assert.equal(money(w), 0);
        edit(w, "2026-09-24"); field(w, "ed_dayChoice", "times");
        field(w, "ed_start", "08:00"); field(w, "ed_end", "20:00"); field(w, "ed_break", "60"); submit(w, "editForm");
        assert.equal(money(w), 2200); assert.equal(text(w, "allTimeOvertimeHours"), "0.00h");
        assert.match(text(w, "entryList"), /2.00× every worked hour/);
        let saved = snapshot(w); w.close(); const reloaded = boot(saved);
        assert.equal(money(reloaded.window), 2200); reloaded.window.close();
    });
    verify("unworked holiday pay switch persists and holiday identity stays detected", () => {
        const dom = boot({ [SETTINGS]: settings }); const w = dom.window;
        edit(w, "2026-09-24"); field(w, "ed_dayChoice", "not-working"); submit(w, "editForm");
        assert.equal(money(w), 0); assert.equal(rowByDate(w, "2026-09-24").isHoliday, true);
        const saved = snapshot(w); w.close(); const reload = boot(saved); const next = reload.window;
        assert.equal(money(next), 0); edit(next, "2026-09-24");
        assert.equal(next.document.getElementById("ed_holidayPayEnabled").checked, false);
        field(next, "ed_dayChoice", "paid-holiday"); submit(next, "editForm"); assert.equal(money(next), 900);
        next.close();
    });
    verify("SA daily-wage mode can be selected in Settings", () => {
        const dom = boot({ [SETTINGS]: { ...settings, holidayPayMode: "daily-wage" } }); const w = dom.window;
        edit(w, "2026-09-24"); field(w, "ed_dayChoice", "times");
        field(w, "ed_start", "08:00"); field(w, "ed_end", "20:00"); field(w, "ed_break", "60"); submit(w, "editForm");
        assert.equal(money(w), 2000);
        w.document.getElementById("openSettingsBtn").click(); field(w, "s_holidayPayMode", "all-hours"); submit(w, "settingsForm");
        assert.equal(money(w), 2200); w.close();
    });
    verify("blank daily-wage overrides fall back to normal hours", () => {
        const dom = boot({ [SETTINGS]: settings, [ENTRIES]: [{ ...day, id: "blank-overrides", dateISO: "2026-09-24", isHoliday: true, holidayWorked: false, holidayWasOrdinaryWorkday: true, overrides: { useGlobal: false, hourly: null, otThreshold: null, ordinaryDailyHours: null } }] });
        assert.equal(money(dom.window), 900); dom.window.close();
    });
    verify("historical holiday editing saves preference and freezes the chosen formula", () => {
        const dom = boot({ [SETTINGS]: settings, [ENTRIES]: [{ ...day, id: "historic-holiday", dateISO: "2026-08-10", isHoliday: true, holidayWorked: true, holidayWasOrdinaryWorkday: true, holidayPayEnabled: true }] }); const w = dom.window;
        assert.equal(rowById(w, "historic-holiday").overrides.holidayPayMode, "all-hours");
        edit(w, "2026-08-10"); field(w, "ed_holidayWorked", false); field(w, "ed_dayChoice", "not-working"); submit(w, "editForm");
        assert.equal(rowById(w, "historic-holiday").holidayPayEnabled, false);
        const saved = snapshot(w); w.close(); const reload = boot(saved);
        assert.equal(rowById(reload.window, "historic-holiday").holidayPayEnabled, false); reload.window.close();
    });
    verify("failed edit keeps stored data, totals and editor intact", () => {
        const dom = boot({ [SETTINGS]: settings, [ENTRIES]: [day] }); const w = dom.window;
        edit(w, "2026-10-05"); field(w, "ed_end", "21:00");
        const previous = snapshot(w); const originalSet = w.Storage.prototype.setItem;
        let once = true;
        w.Storage.prototype.setItem = function(key, value) {
            if (key === ENTRIES && once) { once = false; throw new Error("Quota exceeded"); }
            return originalSet.call(this, key, value);
        };
        submit(w, "editForm"); assert.deepEqual(snapshot(w), previous);
        assert.equal(money(w), 1200); assert.equal(w.document.getElementById("editSheet").getAttribute("aria-hidden"), "false");
        assert.equal(w.alerts.length, 1); w.Storage.prototype.setItem = originalSet;
        submit(w, "editForm"); assert.equal(rowById(w, "existing").end, "21:00"); assert.equal(money(w), 1350);
        w.close();
    });
    verify("viewing any month creates no holiday entries or money", () => {
        const dom = boot({ [SETTINGS]: settings }); const w = dom.window;
        for (const month of ["2026-10", "2026-12", "2027-01"]) {
            field(w, "monthPicker", month);
            assert.equal(storedRows(w).length, 0); assert.equal(money(w), 0);
        }
        edit(w, "2026-12-25"); assert.equal(w.document.getElementById("ed_dayChoice").value, "not-working");
        assert.equal(storedRows(w).length, 0); w.close();
    });
    verify("Not working covers ordinary dates, Sundays and holidays after a contract ends", () => {
        const dom = boot({ [SETTINGS]: settings, [ENTRIES]: [day] }); const w = dom.window;
        for (const date of ["2026-10-05", "2026-10-04", "2026-12-25", "2027-01-01"]) {
            edit(w, date); field(w, "ed_dayChoice", "not-working"); submit(w, "editForm");
            assert.equal(rowByDate(w, date).notWorking, true);
            assert.equal(rowByDate(w, date).start, ""); assert.equal(money(w), 0);
        }
        const saved = snapshot(w); w.close(); const reload = boot(saved);
        assert.equal(money(reload.window), 0); edit(reload.window, "2027-01-01");
        assert.equal(reload.window.document.getElementById("ed_dayChoice").value, "not-working");
        reload.window.close();
    });
    verify("historical ordinary day can be marked Not working and survive reload", () => {
        const dom = boot({ [SETTINGS]: settings, [ENTRIES]: [{ ...day, id: "old-work", dateISO: "2026-09-01" }] }); const w = dom.window;
        edit(w, "2026-09-01"); field(w, "ed_dayChoice", "not-working"); submit(w, "editForm");
        assert.equal(rowById(w, "old-work").notWorking, true); assert.equal(money(w), 0);
        const saved = snapshot(w); w.close(); const reload = boot(saved);
        assert.equal(money(reload.window), 0); assert.equal(rowById(reload.window, "old-work").dayChoice, "not-working"); reload.window.close();
    });
    verify("normal shift and actual worked times can replace an unpaid holiday", () => {
        const dom = boot({ [SETTINGS]: settings }); const w = dom.window;
        edit(w, "2026-09-24"); field(w, "ed_dayChoice", "not-working"); submit(w, "editForm");
        edit(w, "2026-09-24"); field(w, "ed_dayChoice", "normal"); submit(w, "editForm");
        assert.equal(rowByDate(w, "2026-09-24").holidayWorked, true);
        assert.equal(rowByDate(w, "2026-09-24").start, "08:00");
        assert.equal(money(w), 1800); // Eight worked hours, with a nine-hour daily minimum.
        edit(w, "2026-09-24"); field(w, "ed_dayChoice", "times");
        field(w, "ed_end", "20:15"); submit(w, "editForm");
        assert.equal(money(w), 2250); assert.equal(text(w, "allTimeOvertimeHours"), "0.00h"); w.close();
    });
    verify("normal day shortcut in both forms uses the template without overtime", () => {
        const dom = boot({ [SETTINGS]: settings }); const w = dom.window;
        field(w, "qa_dayChoice", "normal"); submit(w, "quickAddForm"); assert.equal(money(w), 800);
        assert.equal(rowByDate(w, "2026-10-05").applyOvertime, false);
        edit(w, "2026-10-06"); field(w, "ed_dayChoice", "normal"); submit(w, "editForm");
        assert.equal(money(w), 1600); assert.equal(text(w, "allTimeOvertimeHours"), "0.00h"); w.close();
    });
    verify("Fast Entry can manually add an unpaid or paid holiday", () => {
        const dom = boot({ [SETTINGS]: settings }); const w = dom.window;
        field(w, "qa_editDate", true); field(w, "qa_date", "2026-12-25");
        field(w, "qa_dayChoice", "not-working"); submit(w, "quickAddForm"); assert.equal(money(w), 0);
        field(w, "qa_date", "2026-12-25"); field(w, "qa_dayChoice", "paid-holiday"); submit(w, "quickAddForm");
        assert.equal(money(w), 900); assert.equal(rowByDate(w, "2026-12-25").holidayWorked, false); w.close();
    });
    verify("Auto-Fill skips holidays and preserves manual unpaid choices", () => {
        const dom = boot({ [SETTINGS]: settings }); const w = dom.window;
        edit(w, "2026-10-05"); field(w, "ed_dayChoice", "not-working"); submit(w, "editForm");
        w.document.getElementById("autoFillCycleBtn").click();
        assert.equal(rowByDate(w, "2026-09-24"), undefined);
        assert.equal(rowByDate(w, "2026-10-05").notWorking, true);
        assert.ok(rowByDate(w, "2026-10-06").start); w.close();
    });
    verify("paid off day uses Normal Paid Hours without overtime or a Sunday premium", () => {
        const template = Array.from({ length: 7 }, () => ({ start: "08:00", end: "20:00" }));
        const dom = boot({ [SETTINGS]: { ...settings, weekTemplate: template } }); const w = dom.window;
        edit(w, "2026-10-04"); field(w, "ed_dayChoice", "paid-off"); submit(w, "editForm");
        assert.equal(money(w), 900);
        assert.match(text(w, "entryList"), /Paid off base day \(9\.00h\)/);
        assert.equal(text(w, "allTimeHours"), "0.00h");
        assert.equal(text(w, "allTimeOvertimeHours"), "0.00h");
        w.close();
    });
    verify("ordinary overtime can be toggled and zero extra time adds no OT", () => {
        const dom = boot({ [SETTINGS]: settings, [ENTRIES]: [day] }); const w = dom.window;
        edit(w, "2026-10-05"); field(w, "ed_applyOt", false); submit(w, "editForm");
        assert.equal(money(w), 1100); assert.equal(text(w, "allTimeOvertimeHours"), "0.00h");
        edit(w, "2026-10-05"); field(w, "ed_dayChoice", "times"); field(w, "ed_end", "18:00"); submit(w, "editForm");
        assert.equal(money(w), 900); assert.equal(text(w, "allTimeOvertimeHours"), "0.00h"); w.close();
    });
    const dom = boot({ [SETTINGS]: settings }); const w = dom.window;
    edit(w, "2026-10-05"); w.document.getElementById("ed_normalDay").click();
    await new Promise(resolve => setTimeout(resolve, 500));
    assert.equal(rowByDate(w, "2026-10-05").applyOvertime, false);
    assert.equal(text(w, "allTimeOvertimeHours"), "0.00h"); assert.equal(money(w), 800);
    edit(w, "2026-10-05"); w.document.getElementById("ed_normalDay").click();
    assert.equal(rowByDate(w, "2026-10-05"), undefined); assert.equal(money(w), 0);
    w.close(); console.log("PASS Save Normal Day and cancel retain normal pay without OT");
    await require("./service-worker.test.js")();
    assert.deepEqual(errors, []);
    console.log("All integration tests passed");
}
run().catch(error => { console.error(error); process.exitCode = 1; });
