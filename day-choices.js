/* Manual day choices shared by Fast Entry and current/historical editors. */
(function () {
    "use strict";
    const field = (prefix, name) => document.getElementById(prefix + "_" + name);
    function restore(prefix, row) {
        const holiday = field(prefix, "holiday").checked;
        const savedChoice = row?.dayChoice;
        field(prefix, "dayChoice").value = row?.notWorking ? "not-working"
            : savedChoice || (row ? (holiday ? (row.holidayWorked ? "times" : row.holidayPayEnabled === false ? "not-working" : "paid-holiday") : row.paidOff ? "paid-off" : "times") : holiday ? "not-working" : "times");
        if (!row && holiday) field(prefix, "holidayPayEnabled").checked = false;
    }
    function sync(prefix) {
        const holiday = field(prefix, "holiday").checked;
        const select = field(prefix, "dayChoice");
        select.querySelector('[value="paid-holiday"]').hidden = !holiday;
        select.querySelector('[value="paid-off"]').hidden = holiday;
        field(prefix, "holidayChoice").hidden = true;
        field(prefix, "holidayPayControl").hidden = true;
        field(prefix, "paidOffControl").hidden = true;
        if (prefix === "ed") field(prefix, "normalDay").hidden = true;
        const noWork = select.value === "not-working";
        if (noWork) {
            ["start", "end", "break"].forEach(name => { field(prefix, name).disabled = true; });
            field(prefix, "workTimeFields").hidden = true;
            if (prefix === "qa") field(prefix, "breakControl").hidden = true;
            field(prefix, "applyOt").disabled = true;
            field(prefix, "applyOtControl").hidden = true;
        }
        // Keep the calculation hint visible without the old toggle controls.
        const hint = field(prefix, "holidayHint");
        if (hint.parentElement.id === prefix + "_holidayChoice") hint.parentElement.after(hint);
        hint.hidden = !holiday || noWork;
    }
    function apply(prefix) {
        const choice = field(prefix, "dayChoice").value;
        const holiday = field(prefix, "holiday").checked;
        const date = new Date(field(prefix, "date").value + "T12:00:00");
        let settings = {};
        try { settings = JSON.parse(localStorage.getItem("paycalc_settings_v2")) || {}; } catch {}
        const template = settings.weekTemplate?.[date.getDay()] || {};
        if (choice === "normal" && (!template.start || !template.end)) {
            window.alert("Set this weekday's usual start and finish in Settings, or choose Enter worked times.");
            field(prefix, "dayChoice").value = "times";
            return apply(prefix);
        }
        const working = choice === "normal" || choice === "times";
        field(prefix, "holidayWorked").checked = holiday && working;
        field(prefix, "holidayPayEnabled").checked = choice === "paid-holiday";
        field(prefix, "paidOff").checked = !holiday && choice === "paid-off";
        field(prefix, "applyOt").checked = working && choice === "times" && !holiday;
        if (choice === "normal") {
            field(prefix, "start").value = template.start;
            field(prefix, "end").value = template.end;
            let deduct = true;
            try { deduct = JSON.parse(localStorage.getItem("workpay_deduct_break_v1")) !== false; } catch {}
            field(prefix, "break").value = deduct ? settings.defaultBreak ?? 60 : 0;
        } else if (!working) {
            field(prefix, "start").value = "";
            field(prefix, "end").value = "";
            field(prefix, "break").value = 0;
        }
        field(prefix, "holidayWorked").dispatchEvent(new Event("change", { bubbles: true }));
        field(prefix, "paidOff").dispatchEvent(new Event("change", { bubbles: true }));
        sync(prefix);
    }
    for (const prefix of ["qa", "ed"]) field(prefix, "dayChoice").addEventListener("change", () => apply(prefix));
    window.WorkPayDayChoices = { restore, sync };
})();
