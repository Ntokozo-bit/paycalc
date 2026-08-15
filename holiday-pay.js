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

        if (!ordinarilyWorks) {
            return {
                amount: ordinaryDailyPay + timeWorkedPay,
                paidHours: ordinaryDailyHours,
                workedHours,
                ordinarilyWorks: false,
                worked: true,
                rule: "non-ordinary-day-worked"
            };
        }

        const doubleDailyPay = ordinaryDailyPay * holidayMultiplier;
        const dailyPlusTimeWorked = ordinaryDailyPay + timeWorkedPay;
        return {
            amount: Math.max(doubleDailyPay, dailyPlusTimeWorked),
            paidHours: ordinaryDailyHours,
            workedHours,
            ordinarilyWorks: true,
            worked: true,
            rule: doubleDailyPay >= dailyPlusTimeWorked
                ? "ordinary-day-worked-double-daily"
                : "ordinary-day-worked-daily-plus-time"
        };
    }

    return { calculatePublicHolidayPay };
});
