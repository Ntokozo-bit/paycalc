/* WorkPay feature loader
   Adds a persistent lunch-break preference and direct calendar editing,
   then loads the original calculator application from its last stable commit.
*/
(function () {
    "use strict";

    const SETTINGS_KEY = "paycalc_settings_v2";
    const DEDUCT_KEY = "workpay_deduct_break_v1";
    const SAVED_BREAK_KEY = "workpay_saved_default_break_v1";
    const NOTICE_KEY = "workpay_break_feature_seen_v1";
    const ORIGINAL_APP_URL = "https://cdn.jsdelivr.net/gh/Ntokozo-bit/paycalc@aaa4084318301e5fb0a12537b44cc6bff23ccdbe/app.js";
    const DIRECT_EDIT_URL = "./direct-date-edit.js?v=1";

    function readJson(key, fallback) {
        try {
            const value = JSON.parse(localStorage.getItem(key));
            return value === null ? fallback : value;
        } catch {
            return fallback;
        }
    }

    function writeJson(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
        } catch {}
    }

    function readBool(key, fallback) {
        try {
            const value = localStorage.getItem(key);
            if (value === null) return fallback;
            return value === "true";
        } catch {
            return fallback;
        }
    }

    function writeBool(key, value) {
        try {
            localStorage.setItem(key, value ? "true" : "false");
        } catch {}
    }

    function clampBreak(value) {
        const n = Number(value);
        if (!Number.isFinite(n)) return 60;
        return Math.max(0, Math.min(1440, n));
    }

    function getSavedBreak() {
        try {
            const stored = Number(localStorage.getItem(SAVED_BREAK_KEY));
            return Number.isFinite(stored) && stored > 0 ? clampBreak(stored) : 60;
        } catch {
            return 60;
        }
    }

    function setSavedBreak(value) {
        const minutes = clampBreak(value);
        if (minutes <= 0) return;
        try {
            localStorage.setItem(SAVED_BREAK_KEY, String(minutes));
        } catch {}
    }

    function prepareStoredSettings() {
        const settings = readJson(SETTINGS_KEY, null);
        const deduct = readBool(DEDUCT_KEY, true);
        if (!settings || typeof settings !== "object") return;

        const currentBreak = clampBreak(settings.defaultBreak ?? 60);
        if (deduct) {
            if (currentBreak > 0) setSavedBreak(currentBreak);
        } else {
            if (currentBreak > 0) setSavedBreak(currentBreak);
            settings.defaultBreak = 0;
            writeJson(SETTINGS_KEY, settings);
        }
    }

    function addStyles() {
        const style = document.createElement("style");
        style.textContent = `
            .workpay-break-helper { margin-top: -2px; }
            .workpay-break-disabled { opacity: .58; }
            .workpay-feature-notice[hidden] { display: none; }
            .workpay-feature-notice {
                position: fixed;
                inset: 0;
                z-index: 200;
                display: grid;
                place-items: center;
                padding: 20px;
                background: rgba(0, 0, 0, .74);
                backdrop-filter: blur(6px);
            }
            .workpay-feature-card {
                width: min(470px, 100%);
                padding: 22px;
                color: var(--ink, #f5f2e8);
                background: var(--surface, #181816);
                border: 1px solid var(--line, #37342d);
                border-radius: 12px;
                box-shadow: var(--shadow, 0 16px 40px rgba(0,0,0,.28));
            }
            .workpay-feature-card h2 { margin: 6px 0 8px; }
            .workpay-feature-card p { margin: 0; color: var(--ink-dim, #d6d0c0); }
            .workpay-feature-actions {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 10px;
                margin-top: 20px;
            }
            @media (max-width: 420px) {
                .workpay-feature-actions { grid-template-columns: 1fr; }
            }
        `;
        document.head.appendChild(style);
    }

    function injectBreakSetting() {
        const defaultInput = document.getElementById("s_defaultBreak");
        if (!defaultInput || document.getElementById("s_deductBreak")) return;

        const defaultControl = defaultInput.closest("label.control");
        if (!defaultControl) return;

        const toggleControl = document.createElement("label");
        toggleControl.className = "control chk full";
        toggleControl.innerHTML = `
            <span class="lab">Deduct lunch break by default</span>
            <input type="checkbox" id="s_deductBreak" />
        `;

        const helper = document.createElement("p");
        helper.className = "helper workpay-break-helper";
        helper.textContent = "Turn this off if you work straight through. New workdays will use 0 break minutes until you turn it on again. Existing saved days are not changed.";

        defaultControl.before(toggleControl);
        defaultControl.after(helper);

        const toggle = toggleControl.querySelector("input");
        const settingsForm = document.getElementById("settingsForm");
        const openSettingsBtn = document.getElementById("openSettingsBtn");

        function syncDisplay() {
            const deduct = readBool(DEDUCT_KEY, true);
            toggle.checked = deduct;
            defaultInput.disabled = !deduct;
            defaultControl.classList.toggle("workpay-break-disabled", !deduct);
            if (!deduct) defaultInput.value = String(getSavedBreak());
        }

        toggle.addEventListener("change", () => {
            const deduct = !!toggle.checked;
            if (!deduct) setSavedBreak(defaultInput.value);
            writeBool(DEDUCT_KEY, deduct);
            if (deduct) defaultInput.value = String(getSavedBreak());
            syncDisplay();
        });

        if (settingsForm) {
            settingsForm.addEventListener("submit", () => {
                const deduct = !!toggle.checked;
                writeBool(DEDUCT_KEY, deduct);
                if (deduct) {
                    setSavedBreak(defaultInput.value);
                    return;
                }

                const displayed = defaultInput.value;
                setSavedBreak(displayed);
                defaultInput.disabled = false;
                defaultInput.value = "0";
                setTimeout(() => {
                    defaultInput.value = String(getSavedBreak());
                    syncDisplay();
                }, 0);
            }, true);
        }

        if (openSettingsBtn) {
            openSettingsBtn.addEventListener("click", () => setTimeout(syncDisplay, 0));
        }

        syncDisplay();
    }

    function createNotice() {
        if (document.getElementById("workpayFeatureNotice")) return;

        const notice = document.createElement("div");
        notice.id = "workpayFeatureNotice";
        notice.className = "workpay-feature-notice";
        notice.hidden = true;
        notice.setAttribute("role", "dialog");
        notice.setAttribute("aria-modal", "true");
        notice.setAttribute("aria-labelledby", "workpayFeatureTitle");
        notice.innerHTML = `
            <div class="workpay-feature-card">
                <span class="eyebrow">New feature</span>
                <h2 id="workpayFeatureTitle">Lunch-break control</h2>
                <p>Working without a fixed lunch break? Turn off <strong>Deduct lunch break by default</strong> in Settings. New workdays will use 0 break minutes until you turn it on again.</p>
                <div class="workpay-feature-actions">
                    <button class="btn-secondary" type="button" id="workpayNoticeDismiss">Got it</button>
                    <button class="btn-primary" type="button" id="workpayNoticeSettings">Open Settings</button>
                </div>
            </div>
        `;
        document.body.appendChild(notice);

        function dismiss() {
            writeBool(NOTICE_KEY, true);
            notice.hidden = true;
        }

        notice.querySelector("#workpayNoticeDismiss").addEventListener("click", dismiss);
        notice.querySelector("#workpayNoticeSettings").addEventListener("click", () => {
            dismiss();
            document.getElementById("openSettingsBtn")?.click();
        });

        if (!readBool(NOTICE_KEY, false)) notice.hidden = false;
    }

    function loadDirectDateEditing() {
        if (document.querySelector('script[data-workpay-direct-edit]')) return;
        const script = document.createElement("script");
        script.src = DIRECT_EDIT_URL;
        script.async = false;
        script.dataset.workpayDirectEdit = "true";
        script.onerror = () => {
            console.error("WorkPay direct calendar editing could not load.");
        };
        document.head.appendChild(script);
    }

    function loadOriginalApp() {
        const script = document.createElement("script");
        script.src = ORIGINAL_APP_URL;
        script.async = false;
        script.onload = () => {
            injectBreakSetting();
            createNotice();
            loadDirectDateEditing();
        };
        script.onerror = () => {
            window.alert("WorkPay could not load. Please check your internet connection and refresh the page.");
        };
        document.head.appendChild(script);
    }

    prepareStoredSettings();
    addStyles();
    injectBreakSetting();
    loadOriginalApp();
})();
