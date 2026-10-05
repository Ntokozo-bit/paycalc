"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
module.exports = async function () {
    const handlers = new Map(); const saved = new Map(); const puts = [];
    const cloneable = value => ({ value, ok: true, clone() { return cloneable(value); } });
    const currentUrl = "http://localhost/core.js?v=12";
    saved.set(currentUrl, cloneable("current-script"));
    const cache = {
        match: async key => saved.get(typeof key === "string" ? key : key.url),
        put: async (key, value) => { puts.push(key); saved.set(typeof key === "string" ? key : key.url, value); }
    };
    let online = false;
    const context = vm.createContext({
        URL,
        self: { location: { origin: "http://localhost" }, addEventListener: (name, callback) => handlers.set(name, callback) },
        caches: { open: async name => { assert.equal(name, "workpay-v12"); return cache; } },
        fetch: async () => { if (!online) throw new Error("offline"); return cloneable("fresh-script"); }
    });
    vm.runInContext(fs.readFileSync(path.join(__dirname, "../service-worker.js"), "utf8"), context);
    const request = url => {
        const waits = []; let response;
        handlers.get("fetch")({ request: { url, method: "GET", mode: "cors" },
            waitUntil: promise => waits.push(promise), respondWith: promise => { response = promise; } });
        return { response, waits };
    };
    const offline = request(currentUrl);
    assert.equal((await offline.response).value, "current-script"); await Promise.all(offline.waits);
    await assert.rejects(request("http://localhost/core.js?v=8").response, /offline/);
    online = true;
    const refresh = request(currentUrl); await refresh.response; await Promise.all(refresh.waits);
    assert.equal(saved.get(currentUrl).value, "fresh-script"); assert.equal(puts.length, 1);
    console.log("PASS offline assets match exact script versions and refreshes finish");
};
