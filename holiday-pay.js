(function (root, factory) {
    "use strict";
    const rules = factory();
    if (typeof module === "object" && module.exports) module.exports = rules;
    else root.WorkPayRules = Object.freeze(rules);
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
    "use strict";

    function number(value, fallback = 0) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? Math.max(0, parsed) : fallback;
    }

    function calculatePublicHolidayPay(input) {
        const hourlyRate = number(input?.hourlyRate);
        const ordinaryDailyHours = number(input?.ordinaryDailyHours);
        const workedHours = number(input?.workedHours);
        const ordinarilyWorks = !!input?.ordinarilyWorks;
        const worked = !!input?.worked && workedHours > 0;
        const holidayMultiplier = Math.max(2, number(input?.holidayMultiplier, 2));
        const ordinaryDailyPay = ordinaryDailyHours * hourlyRate;
        const timeWorkedPay = workedHours * hourlyRate;

        if (!worked && input?.payNotWorked === false) {
            return {
                amount: 0, paidHours: 0, workedHours: 0, ordinarilyWorks, worked: false,
                rule: "not-worked-pay-excluded"
            };
        }

        if (!worked) {
            return {
                amount: ordinarilyWorks ? ordinaryDailyPay : 0,
                paidHours: ordinarilyWorks ? ordinaryDailyHours : 0,
                workedHours: 0,
                ordinarilyWorks,
                worked: false,
                rule: ordinarilyWorks ? "ordinary-day-not-worked" : "non-ordinary-day-not-worked"
            };
        }

        const multipliedHoursPay = timeWorkedPay * holidayMultiplier;
        const payAllHours = input?.holidayPayMode === "all-hours";

        if (!ordinarilyWorks) {
            return {
                amount: Math.max(ordinaryDailyPay + timeWorkedPay, payAllHours ? multipliedHoursPay : 0),
                paidHours: ordinaryDailyHours,
                workedHours,
                ordinarilyWorks: false,
                worked: true,
                rule: payAllHours && multipliedHoursPay >= ordinaryDailyPay + timeWorkedPay
                    ? "worked-hours-multiplier" : "non-ordinary-day-worked"
            };
        }

        const doubleDailyPay = ordinaryDailyPay * holidayMultiplier;
        const dailyPlusTimeWorked = ordinaryDailyPay + timeWorkedPay;
        const minimumPay = Math.max(doubleDailyPay, dailyPlusTimeWorked);
        return {
            amount: Math.max(minimumPay, payAllHours ? multipliedHoursPay : 0),
            paidHours: ordinaryDailyHours,
            workedHours,
            ordinarilyWorks: true,
            worked: true,
            rule: payAllHours && multipliedHoursPay >= minimumPay
                ? "worked-hours-multiplier"
                : doubleDailyPay >= dailyPlusTimeWorked
                ? "ordinary-day-worked-double-daily"
                : "ordinary-day-worked-daily-plus-time"
        };
    }

    function getEmploymentDayStatus(settings, dateKey) {
        const start = settings?.employmentStart || "";
        const end = settings?.employmentEnd || "";
        if (start && dateKey < start) return { eligible: false, reason: "Before your employment start date" };
        if (end && dateKey > end) return { eligible: false, reason: "After your contract end date" };
        const unpaidStart = settings?.unpaidStart || "";
        const unpaidEnd = settings?.unpaidEnd || "";
        if (unpaidStart && dateKey >= unpaidStart && (!unpaidEnd || dateKey <= unpaidEnd)) {
            return { eligible: false, reason: "Recorded unpaid time away" };
        }
        return { eligible: true, reason: "" };
    }

    function getHolidayPayEligibility(settings, dateKey) {
        const employment = getEmploymentDayStatus(settings, dateKey);
        if (!employment.eligible) return employment;
        if (settings?.autoHolidayPay === false) return { eligible: false, reason: "Automatic unworked holiday pay is off" };
        return employment;
    }

    return { calculatePublicHolidayPay, getEmploymentDayStatus, getHolidayPayEligibility };
});
