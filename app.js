/* WorkPay device, privacy and South African guidance enhancements.
   The calculator itself lives in core.js so every essential feature is local
   and available without a network connection.
*/
(function () {
    "use strict";

    const STORE = {
        SETTINGS: "paycalc_settings_v2",
        ENTRIES: "paycalc_entries_v2",
        HISTORY: "paycalc_history_v1",
        DEDUCT_BREAK: "workpay_deduct_break_v1",
        SAVED_BREAK: "workpay_saved_default_break_v1",
        NORMAL_DAYS: "workpay_normal_days_v1"
    };
    const BACKUP_FORMAT = "workpay-backup";
    const BACKUP_VERSION = 1;
    const MAX_BACKUP_BYTES = 2 * 1024 * 1024;
    const SA_RULES = Object.freeze({
        effectiveDate: "2026-05-01",
        minimumWage: 30.23,
        earningsThreshold: 269900.90,
        weeklyOrdinaryHours: 45,
        weeklyOvertimeHours: 10,
        usualSundayMultiplier: 1.5,
        occasionalSundayMultiplier: 2,
        publicHolidayMultiplier: 2,
        mealIntervalMinutes: 60,
        dailyRestHours: 12
    });

    const elements = {
        connection: document.getElementById("connectionStatus"),
        toast: document.getElementById("workpayToast"),
        settingsForm: document.getElementById("settingsForm"),
        openSettings: document.getElementById("openSettingsBtn"),
        defaultBreak: document.getElementById("s_defaultBreak"),
        deductBreak: document.getElementById("s_deductBreak"),
        backup: document.getElementById("backupDataBtn"),
        restore: document.getElementById("restoreDataInput"),
        install: document.getElementById("installAppBtn"),
        checkBadge: document.getElementById("saCheckBadge"),
        checkList: document.getElementById("saCheckList"),
        calendar: document.getElementById("cycleCalendar"),
        entries: document.getElementById("entryList")
    };

    let installPrompt = null;
    let toastTimer = null;
    let checkTimer = null;
    let lastSheetTrigger = null;

    function readJson(key, fallback) {
        try {
            const value = JSON.parse(localStorage.getItem(key));
            return value === null ? fallback : value;
        } catch {
            return fallback;
        }
    }

    function readBool(key, fallback) {
        try {
            const value = localStorage.getItem(key);
            return value === null ? fallback : value === "true";
        } catch {
            return fallback;
        }
    }

    function writeBool(key, value) {
        try {
            localStorage.setItem(key, value ? "true" : "false");
            return true;
        } catch {
            return false;
        }
    }

    function clamp(value, min, max) {
        const number = Number(value);
        if (!Number.isFinite(number)) return min;
        return Math.max(min, Math.min(max, number));
    }

    function showToast(message, kind = "success") {
        if (!elements.toast) return;
        window.clearTimeout(toastTimer);
        elements.toast.textContent = message;
        elements.toast.dataset.kind = kind;
        elements.toast.hidden = false;
        toastTimer = window.setTimeout(() => {
            elements.toast.hidden = true;
        }, 3200);
    }

    function getSavedBreak() {
        try {
            const value = Number(localStorage.getItem(STORE.SAVED_BREAK));
            return Number.isFinite(value) && value > 0 ? clamp(value, 0, 1440) : 60;
        } catch {
            return 60;
        }
    }

    function setSavedBreak(value) {
        const minutes = clamp(value, 0, 1440);
        if (minutes <= 0) return;
        try {
            localStorage.setItem(STORE.SAVED_BREAK, String(minutes));
        } catch {}
    }

    function prepareStoredBreakPreference() {
        const settings = readJson(STORE.SETTINGS, null);
        if (!settings || typeof settings !== "object") return;
        const deduct = readBool(STORE.DEDUCT_BREAK, true);
        const currentBreak = clamp(settings.defaultBreak ?? 60, 0, 1440);
        if (currentBreak > 0) setSavedBreak(currentBreak);
        if (!deduct && currentBreak !== 0) {
            settings.defaultBreak = 0;
            try {
                localStorage.setItem(STORE.SETTINGS, JSON.stringify(settings));
                document.dispatchEvent(new CustomEvent("workpay:data-changed"));
            } catch {}
        }
    }

    function setupBreakPreference() {
        const toggle = elements.deductBreak;
        const input = elements.defaultBreak;
        if (!toggle || !input || !elements.settingsForm) return;
        const control = input.closest("label.control");

        function syncDisplay() {
            const deduct = readBool(STORE.DEDUCT_BREAK, true);
            toggle.checked = deduct;
            input.disabled = !deduct;
            control?.classList.toggle("workpay-break-disabled", !deduct);
            if (!deduct) input.value = String(getSavedBreak());
        }

        toggle.addEventListener("change", () => {
            const deduct = !!toggle.checked;
            if (!deduct) setSavedBreak(input.value);
            writeBool(STORE.DEDUCT_BREAK, deduct);
            if (deduct) input.value = String(getSavedBreak());
            syncDisplay();
        });

        elements.settingsForm.addEventListener("submit", () => {
            const deduct = !!toggle.checked;
            writeBool(STORE.DEDUCT_BREAK, deduct);
            if (deduct) {
                setSavedBreak(input.value);
                return;
            }

            setSavedBreak(input.value);
            input.disabled = false;
            input.value = "0";
            window.setTimeout(syncDisplay, 0);
        }, true);

        elements.openSettings?.addEventListener("click", () => {
            window.setTimeout(syncDisplay, 0);
        });
        syncDisplay();
    }

    function updateConnectionStatus(stateOverride) {
        if (!elements.connection) return;
        let state = stateOverride || (navigator.onLine ? "online" : "offline");
        let label = state === "offline" ? "Offline" : "Online";
        if (state !== "offline" && navigator.serviceWorker?.controller) {
            state = "ready";
            label = "Offline ready";
        }
        elements.connection.dataset.state = state;
        const labelNode = elements.connection.querySelector("span");
        if (labelNode) labelNode.textContent = label;
        elements.connection.title = label;
    }

    function setupOfflineApp() {
        updateConnectionStatus();
        window.addEventListener("online", () => {
            updateConnectionStatus();
            showToast("Back online");
        });
        window.addEventListener("offline", () => {
            updateConnectionStatus("offline");
            showToast("You are offline. WorkPay will keep saving on this device.", "warning");
        });

        if (!("serviceWorker" in navigator) || !/^https?:$/.test(location.protocol)) return;
        navigator.serviceWorker.register("./service-worker.js").then(() => {
            return navigator.serviceWorker.ready;
        }).then(() => {
            updateConnectionStatus();
        }).catch(error => {
            console.error("WorkPay offline setup failed.", error);
            updateConnectionStatus();
        });

        navigator.serviceWorker.addEventListener("controllerchange", () => {
            updateConnectionStatus();
        });
    }

    function setupInstallPrompt() {
        if (!elements.install) return;
        window.addEventListener("beforeinstallprompt", event => {
            event.preventDefault();
            installPrompt = event;
            elements.install.hidden = false;
        });

        elements.install.addEventListener("click", async () => {
            if (!installPrompt) {
                showToast("Use your browser menu and choose “Install app” or “Add to Home Screen”.", "warning");
                return;
            }
            installPrompt.prompt();
            await installPrompt.userChoice;
            installPrompt = null;
            elements.install.hidden = true;
        });

        window.addEventListener("appinstalled", () => {
            installPrompt = null;
            elements.install.hidden = true;
            showToast("WorkPay installed");
        });
    }

    function downloadFile(name, content, type) {
        const blob = new Blob([content], { type });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = name;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    function buildBackup() {
        return {
            format: BACKUP_FORMAT,
            version: BACKUP_VERSION,
            exportedAt: new Date().toISOString(),
            app: "WorkPay",
            data: {
                settings: readJson(STORE.SETTINGS, {}),
                entries: readJson(STORE.ENTRIES, []),
                history: readJson(STORE.HISTORY, []),
                preferences: {
                    deductBreak: readBool(STORE.DEDUCT_BREAK, true),
                    savedDefaultBreak: getSavedBreak(),
                    normalDays: readJson(STORE.NORMAL_DAYS, {})
                }
            }
        };
    }

    function plainObject(value) {
        return !!value && typeof value === "object" && !Array.isArray(value);
    }

    function validBackupRow(row) {
        if (!plainObject(row) || typeof row.dateISO !== "string") return false;
        if (Number.isNaN(new Date(row.dateISO).getTime())) return false;
        if (row.start !== undefined && typeof row.start !== "string") return false;
        if (row.end !== undefined && typeof row.end !== "string") return false;
        if (row.start && parseTime(row.start) === null) return false;
        if (row.end && parseTime(row.end) === null) return false;
        if (row.breakMin !== undefined && !Number.isFinite(Number(row.breakMin))) return false;
        return true;
    }

    function validateBackup(payload) {
        if (!plainObject(payload) || payload.format !== BACKUP_FORMAT || payload.version !== BACKUP_VERSION) {
            throw new Error("This is not a supported WorkPay backup.");
        }
        if (!plainObject(payload.data) || !plainObject(payload.data.settings)) {
            throw new Error("The backup settings are missing or damaged.");
        }
        if (!Array.isArray(payload.data.entries) || payload.data.entries.length > 10000) {
            throw new Error("The backup contains an invalid number of workdays.");
        }
        if (!payload.data.entries.every(validBackupRow)) {
            throw new Error("One or more active workdays are invalid.");
        }
        if (!Array.isArray(payload.data.history) || payload.data.history.length > 1000) {
            throw new Error("The backup history is invalid.");
        }
        for (const cycle of payload.data.history) {
            if (!plainObject(cycle) || !Array.isArray(cycle.entries) || cycle.entries.length > 10000) {
                throw new Error("A saved pay cycle is invalid.");
            }
            if (!cycle.entries.every(validBackupRow)) {
                throw new Error("One or more historical workdays are invalid.");
            }
        }
        if (payload.data.settings.weekTemplate !== undefined) {
            if (!Array.isArray(payload.data.settings.weekTemplate) || payload.data.settings.weekTemplate.length > 7) {
                throw new Error("The week template is invalid.");
            }
        }
        const preferences = payload.data.preferences;
        if (preferences !== undefined && !plainObject(preferences)) {
            throw new Error("The saved preferences are invalid.");
        }
        return payload;
    }

    function applyBackup(payload) {
        const preferences = payload.data.preferences || {};
        const writes = new Map([
            [STORE.SETTINGS, JSON.stringify(payload.data.settings)],
            [STORE.ENTRIES, JSON.stringify(payload.data.entries)],
            [STORE.HISTORY, JSON.stringify(payload.data.history)],
            [STORE.DEDUCT_BREAK, preferences.deductBreak === false ? "false" : "true"],
            [STORE.SAVED_BREAK, String(clamp(preferences.savedDefaultBreak ?? 60, 0, 1440))],
            [STORE.NORMAL_DAYS, JSON.stringify(plainObject(preferences.normalDays) ? preferences.normalDays : {})]
        ]);
        const previous = new Map();
        for (const key of writes.keys()) previous.set(key, localStorage.getItem(key));

        try {
            for (const [key, value] of writes) localStorage.setItem(key, value);
        } catch {
            for (const [key, value] of previous) {
                try {
                    if (value === null) localStorage.removeItem(key);
                    else localStorage.setItem(key, value);
                } catch {}
            }
            throw new Error("The browser could not store the backup. Your existing data was kept.");
        }
    }

    function setupBackups() {
        elements.backup?.addEventListener("click", () => {
            const backup = buildBackup();
            const date = new Date().toISOString().slice(0, 10);
            downloadFile(
                `workpay-backup-${date}.json`,
                JSON.stringify(backup, null, 2),
                "application/json;charset=utf-8"
            );
            showToast("Backup downloaded");
        });

        elements.restore?.addEventListener("change", async () => {
            const file = elements.restore.files?.[0];
            elements.restore.value = "";
            if (!file) return;
            if (file.size > MAX_BACKUP_BYTES) {
                showToast("That backup is too large to import.", "danger");
                return;
            }

            try {
                const payload = validateBackup(JSON.parse(await file.text()));
                const activeCount = payload.data.entries.length;
                const historicalCount = payload.data.history.reduce((sum, cycle) => sum + cycle.entries.length, 0);
                const ok = window.confirm(
                    `Restore ${activeCount + historicalCount} saved workday${activeCount + historicalCount === 1 ? "" : "s"} from ${file.name}? This replaces data on this device.`
                );
                if (!ok) return;
                applyBackup(payload);
                prepareStoredBreakPreference();
                document.dispatchEvent(new CustomEvent("workpay:data-changed"));
                showToast("Backup restored");
            } catch (error) {
                showToast(error instanceof Error ? error.message : "WorkPay could not read that backup.", "danger");
            }
        });
    }

    function dateKey(value) {
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return "";
        return [
            date.getFullYear(),
            String(date.getMonth() + 1).padStart(2, "0"),
            String(date.getDate()).padStart(2, "0")
        ].join("-");
    }

    function parseTime(value) {
        if (typeof value !== "string" || !/^\d{2}:\d{2}$/.test(value)) return null;
        const [hours, minutes] = value.split(":").map(Number);
        if (hours > 23 || minutes > 59) return null;
        return hours * 60 + minutes;
    }

    function localDateFromKey(key) {
        const [year, month, day] = String(key).split("-").map(Number);
        const date = new Date(year, month - 1, day);
        return Number.isNaN(date.getTime()) ? null : date;
    }

    function rowTiming(row) {
        if (!plainObject(row) || row.paidOff) return null;
        const key = dateKey(row.dateISO);
        const day = localDateFromKey(key);
        const startMinutes = parseTime(row.start);
        const rawEndMinutes = parseTime(row.end);
        if (!day || startMinutes === null || rawEndMinutes === null) return null;
        const endMinutes = rawEndMinutes <= startMinutes ? rawEndMinutes + 1440 : rawEndMinutes;
        const elapsedMinutes = endMinutes - startMinutes;
        const breakMinutes = clamp(row.breakMin ?? 0, 0, 1440);
        const workedHours = Math.max(0, elapsedMinutes - breakMinutes) / 60;
        const start = new Date(day);
        start.setMinutes(startMinutes);
        const end = new Date(day);
        end.setMinutes(endMinutes);
        return {
            key,
            start,
            end,
            startMinutes,
            rawEndMinutes,
            elapsedHours: elapsedMinutes / 60,
            breakMinutes,
            workedHours,
            night: startMinutes < 360 || rawEndMinutes > 1080 || rawEndMinutes <= startMinutes
        };
    }

    function mondayKey(dateValue) {
        const date = new Date(dateValue);
        const day = date.getDay();
        date.setDate(date.getDate() - ((day + 6) % 7));
        return dateKey(date);
    }

    function allSavedRows() {
        const active = readJson(STORE.ENTRIES, []);
        const history = readJson(STORE.HISTORY, []);
        const rows = [];
        for (const cycle of Array.isArray(history) ? history : []) {
            if (Array.isArray(cycle?.entries)) rows.push(...cycle.entries);
        }
        if (Array.isArray(active)) rows.push(...active);
        const unique = new Map();
        for (const row of rows) {
            if (!plainObject(row)) continue;
            unique.set(String(row.id || dateKey(row.dateISO)), row);
        }
        return [...unique.values()];
    }

    function visibleRows() {
        const visibleDates = new Set(
            [...document.querySelectorAll("#cycleCalendar .calendar-cell[data-date]")]
                .map(cell => cell.dataset.date)
                .filter(Boolean)
        );
        const rows = allSavedRows();
        return visibleDates.size ? rows.filter(row => visibleDates.has(dateKey(row.dateISO))) : rows;
    }

    function configuredDaysPerWeek(settings) {
        const template = Array.isArray(settings.weekTemplate) ? settings.weekTemplate : [];
        const count = template.filter(day => parseTime(day?.start) !== null && parseTime(day?.end) !== null).length;
        return count || 5;
    }

    function addCheck(list, level, message, priority) {
        list.push({ level, message, priority });
    }

    function buildComplianceChecks() {
        const settings = readJson(STORE.SETTINGS, {});
        const rows = visibleRows();
        const checks = [];
        const rate = clamp(settings.hourly ?? 0, 0, 1e9);
        const annualEarnings = clamp(settings.annualEarnings ?? 0, 0, 1e12);
        const daysPerWeek = configuredDaysPerWeek(settings);
        const dailyOrdinaryLimit = daysPerWeek > 5 ? 8 : 9;
        const overtimeThreshold = clamp(settings.otThreshold ?? dailyOrdinaryLimit, 0, 24);

        if (rate <= 0) {
            addCheck(checks, "warning", `Add your hourly rate. The national minimum is R${SA_RULES.minimumWage.toFixed(2)} from 1 March 2026.`, 1);
        } else if (rate < SA_RULES.minimumWage) {
            addCheck(checks, "danger", `R${rate.toFixed(2)}/h is below the 2026 national minimum of R${SA_RULES.minimumWage.toFixed(2)}/h (standard workers).`, 0);
        } else {
            addCheck(checks, "good", `Hourly rate meets the 2026 national minimum wage check (R${SA_RULES.minimumWage.toFixed(2)}/h).`, 9);
        }

        if (annualEarnings > SA_RULES.earningsThreshold) {
            addCheck(checks, "warning", `Annual earnings are above R${SA_RULES.earningsThreshold.toLocaleString("en-ZA", { minimumFractionDigits: 2 })}; several BCEA working-time protections do not apply automatically.`, 2);
        }

        if (overtimeThreshold > dailyOrdinaryLimit) {
            addCheck(checks, "warning", `Your daily overtime setting starts after ${overtimeThreshold.toFixed(2)}h; the ordinary-hours guide is ${dailyOrdinaryLimit}h for a ${daysPerWeek}-day week.`, 2);
        }

        const usualSunday = clamp(settings.sundayOrdinaryMultiplier ?? 1.5, 1, 10);
        const occasionalSunday = clamp(settings.sundayMultiplier ?? 2, 1, 10);
        const holidayMultiplier = clamp(settings.holidayMultiplier ?? 2, 1, 10);
        if (usualSunday < SA_RULES.usualSundayMultiplier || occasionalSunday < SA_RULES.occasionalSundayMultiplier) {
            addCheck(checks, "danger", "A Sunday multiplier is below the usual BCEA money-pay baseline (1.5× usual Sunday, 2× occasional Sunday).", 0);
        }
        if (holidayMultiplier < SA_RULES.publicHolidayMultiplier) {
            addCheck(checks, "danger", "The public-holiday multiplier is below 2×. Alternative paid-time-off arrangements may need separate handling.", 0);
        }

        const timings = rows.map(rowTiming).filter(Boolean).sort((a, b) => a.start - b.start);
        const overDaily = timings.filter(item => item.workedHours > dailyOrdinaryLimit + 0.01);
        if (overDaily.length) {
            addCheck(checks, "warning", `${overDaily.length} day${overDaily.length === 1 ? "" : "s"} exceed${overDaily.length === 1 ? "s" : ""} the ${dailyOrdinaryLimit}h ordinary-day guide.`, 3);
        }

        const longShifts = timings.filter(item => item.elapsedHours > 12.01);
        if (longShifts.length) {
            addCheck(checks, "danger", `${longShifts.length} shift${longShifts.length === 1 ? "" : "s"} span more than 12 hours including breaks.`, 0);
        }

        const shortMeals = timings.filter(item => item.elapsedHours > 5 && item.breakMinutes < SA_RULES.mealIntervalMinutes);
        if (shortMeals.length) {
            addCheck(checks, "warning", `${shortMeals.length} shift${shortMeals.length === 1 ? "" : "s"} over 5h show${shortMeals.length === 1 ? "s" : ""} less than a 60-minute meal interval; reductions normally require agreement.`, 4);
        }

        let shortRestCount = 0;
        for (let index = 1; index < timings.length; index += 1) {
            const restHours = (timings[index].start - timings[index - 1].end) / 3600000;
            if (restHours >= 0 && restHours < SA_RULES.dailyRestHours) shortRestCount += 1;
        }
        if (shortRestCount) {
            addCheck(checks, "danger", `${shortRestCount} gap${shortRestCount === 1 ? "" : "s"} between saved shifts fall${shortRestCount === 1 ? "s" : ""} below 12 hours.`, 0);
        }

        const weekly = new Map();
        for (const item of timings) {
            const key = mondayKey(item.start);
            const week = weekly.get(key) || { total: 0, dailyExcess: 0 };
            week.total += item.workedHours;
            week.dailyExcess += Math.max(0, item.workedHours - dailyOrdinaryLimit);
            weekly.set(key, week);
        }
        let overOrdinaryWeeks = 0;
        let overOvertimeWeeks = 0;
        for (const week of weekly.values()) {
            const estimatedOvertime = Math.max(week.dailyExcess, week.total - SA_RULES.weeklyOrdinaryHours);
            if (week.total > SA_RULES.weeklyOrdinaryHours + 0.01) overOrdinaryWeeks += 1;
            if (estimatedOvertime > SA_RULES.weeklyOvertimeHours + 0.01) overOvertimeWeeks += 1;
        }
        if (overOrdinaryWeeks) {
            addCheck(checks, "warning", `${overOrdinaryWeeks} week${overOrdinaryWeeks === 1 ? "" : "s"} contain${overOrdinaryWeeks === 1 ? "s" : ""} more than 45 recorded work hours.`, 2);
        }
        if (overOvertimeWeeks) {
            addCheck(checks, "danger", `${overOvertimeWeeks} week${overOvertimeWeeks === 1 ? "" : "s"} appear${overOvertimeWeeks === 1 ? "s" : ""} to exceed the 10h overtime guide.`, 0);
        }

        const nightCount = timings.filter(item => item.night).length;
        if (nightCount) {
            addCheck(checks, "warning", `${nightCount} night-work shift${nightCount === 1 ? "" : "s"} detected (18:00–06:00); agreement, compensation and transport rules may apply.`, 5);
        }

        if (!rows.length) {
            addCheck(checks, "good", "No saved workdays in this pay month yet. Checks update as you add days.", 8);
        } else if (!checks.some(check => check.level === "danger" || check.level === "warning")) {
            addCheck(checks, "good", "No obvious hours, rest or meal-interval flags in the pay month on screen.", 8);
        }

        return checks.sort((a, b) => a.priority - b.priority).slice(0, 5);
    }

    function renderComplianceChecks() {
        if (!elements.checkBadge || !elements.checkList) return;
        const checks = buildComplianceChecks();
        const hasDanger = checks.some(check => check.level === "danger");
        const hasWarning = checks.some(check => check.level === "warning");
        const level = hasDanger ? "danger" : (hasWarning ? "warning" : "good");
        elements.checkBadge.dataset.level = level;
        elements.checkBadge.textContent = hasDanger ? "Needs attention" : (hasWarning ? "Review" : "Looks good");
        elements.checkList.replaceChildren(...checks.map(check => {
            const item = document.createElement("li");
            item.dataset.level = check.level;
            item.textContent = check.message;
            return item;
        }));
    }

    function scheduleComplianceCheck() {
        window.clearTimeout(checkTimer);
        checkTimer = window.setTimeout(renderComplianceChecks, 40);
    }

    function setupComplianceChecks() {
        document.addEventListener("workpay:rendered", scheduleComplianceCheck);
        window.addEventListener("storage", scheduleComplianceCheck);
        if ("MutationObserver" in window) {
            const observer = new MutationObserver(scheduleComplianceCheck);
            if (elements.calendar) observer.observe(elements.calendar, { childList: true, subtree: true });
            if (elements.entries) observer.observe(elements.entries, { childList: true, subtree: true });
        }
        scheduleComplianceCheck();
    }

    function focusableElements(sheet) {
        return [...sheet.querySelectorAll(
            'button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )].filter(node => !node.hidden && node.getClientRects().length);
    }

    function activeSheet() {
        return document.querySelector('.sheet[aria-hidden="false"]');
    }

    function closeActiveSheet(sheet) {
        const closeButton = sheet.querySelector('[id^="close"], #ed_cancel');
        closeButton?.click();
    }

    function setupSheetAccessibility() {
        const sheets = [...document.querySelectorAll(".sheet")];
        for (const sheet of sheets) {
            const observer = new MutationObserver(() => {
                const open = sheet.getAttribute("aria-hidden") === "false";
                if (open) {
                    lastSheetTrigger = document.activeElement;
                    document.body.classList.add("sheet-open");
                    window.setTimeout(() => focusableElements(sheet)[0]?.focus(), 0);
                } else if (!activeSheet()) {
                    document.body.classList.remove("sheet-open");
                    if (lastSheetTrigger instanceof HTMLElement) lastSheetTrigger.focus();
                }
            });
            observer.observe(sheet, { attributes: true, attributeFilter: ["aria-hidden"] });
            sheet.addEventListener("click", event => {
                if (event.target === sheet) closeActiveSheet(sheet);
            });
        }

        document.addEventListener("keydown", event => {
            const sheet = activeSheet();
            if (!sheet) return;
            if (event.key === "Escape") {
                event.preventDefault();
                closeActiveSheet(sheet);
                return;
            }
            if (event.key !== "Tab") return;
            const focusable = focusableElements(sheet);
            if (!focusable.length) return;
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        });
    }

    prepareStoredBreakPreference();
    setupBreakPreference();
    setupOfflineApp();
    setupInstallPrompt();
    setupBackups();
    setupComplianceChecks();
    setupSheetAccessibility();
})();
