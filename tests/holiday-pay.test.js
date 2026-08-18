"use strict";

const assert = require("node:assert/strict");
const { calculatePublicHolidayPay } = require("../holiday-pay.js");

function pay(overrides) {
    return calculatePublicHolidayPay({
        hourlyRate: 100,
        ordinaryDailyHours: 8,
        workedHours: 0,
        ordinarilyWorks: true,
        worked: false,
        holidayMultiplier: 2,
        ...overrides
    });
}

assert.equal(pay({ worked: false }).amount, 800, "scheduled holiday not worked keeps normal pay");
assert.equal(pay({ worked: true, workedHours: 8 }).amount, 1600, "scheduled holiday worked pays at least double daily wage");
assert.equal(pay({ worked: true, workedHours: 10 }).amount, 1800, "daily wage plus time worked wins when greater");
assert.equal(pay({ ordinaryDailyHours: 9, worked: false }).amount, 900, "normal paid hours set the scheduled holiday base");
assert.equal(pay({ ordinaryDailyHours: 9, worked: true, workedHours: 9 }).amount, 1800, "working normal holiday hours pays a double day");
assert.equal(pay({ ordinaryDailyHours: 9, worked: true, workedHours: 11 }).amount, 2000, "extra holiday hours use daily wage plus actual hours without stacking 1.5x OT");
assert.equal(pay({ ordinarilyWorks: false, worked: false }).amount, 0, "non-scheduled holiday not worked adds no pay");
assert.equal(pay({ ordinarilyWorks: false, worked: true, workedHours: 4 }).amount, 1200, "non-scheduled holiday worked pays daily wage plus hours");
assert.equal(pay({ worked: true, workedHours: 8, holidayMultiplier: 2.5 }).amount, 2000, "better configured multiplier is preserved");
assert.equal(pay({ worked: true, workedHours: -2 }).amount, 800, "invalid negative hours cannot create holiday work pay");

console.log("holiday pay tests passed");
