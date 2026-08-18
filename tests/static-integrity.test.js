"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const html = read("index.html");
const scripts = ["core.js", "direct-date-edit.js", "app.js"];
const javascript = scripts.map(read).join("\n");
const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]));
const references = [...javascript.matchAll(/getElementById\("([^"]+)"\)/g)].map(match => match[1]);

for (const id of references) assert.ok(ids.has(id), `missing HTML element #${id}`);
assert.equal(ids.size, [...html.matchAll(/\bid="([^"]+)"/g)].length, "duplicate HTML id detected");

for (const source of [...html.matchAll(/<script\s+src="([^"]+)"/g)].map(match => match[1])) {
    assert.ok(fs.existsSync(path.join(root, source.split("?")[0])), `missing script ${source}`);
}

const serviceWorker = read("service-worker.js");
for (const asset of [...serviceWorker.matchAll(/"\.\/([^"]*)"/g)].map(match => match[1]).filter(Boolean)) {
    assert.ok(fs.existsSync(path.join(root, asset)), `missing offline asset ${asset}`);
}

assert.doesNotThrow(() => JSON.parse(read("manifest.webmanifest")), "manifest must contain valid JSON");
assert.ok(ids.has("qa_holidayWorked") && ids.has("ed_holidayWorked"), "holiday-work choices must exist in both entry forms");
assert.ok(html.includes("holiday-pay.js?v=8"), "holiday rules must load before the calculator");
assert.ok(html.includes("id=\"ed_normalDay\""), "normal-day shortcut must remain available for ordinary days");
assert.ok(html.includes("id=\"ed_workTimeFields\""), "holiday-work time controls must be grouped for progressive disclosure");
assert.ok(javascript.includes("workpay:edit-date"), "historical dates must expose a direct edit path");
assert.ok(javascript.includes("ensureAutomaticHolidayEntries"), "scheduled public holidays must be registered automatically");
assert.ok(read("core.js").includes("const ordinaryDailyHours = frozenDailyHours ?? otTh"), "Normal Paid Hours must set the holiday daily wage");
assert.ok(serviceWorker.includes('CACHE_NAME = "workpay-v8"'), "offline cache must be bumped for this release");
assert.ok(read("app.js").includes("earningsThreshold: 269600.90"), "2026 BCEA earnings threshold must be current");
assert.ok(!html.includes("analytics.js") && !html.includes("cdn.jsdelivr.net"), "app shell must remain private and local");

console.log("static integrity tests passed");
