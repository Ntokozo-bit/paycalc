/* WorkPay privacy-safe Google Analytics events.
   Never include pay, rates, hours, dates, or other user-entered values.
*/
(function () {
    "use strict";

    function track(eventName, parameters) {
        if (typeof window.gtag !== "function") return;
        window.gtag("event", eventName, parameters || {});
    }

    function bindFormEvent(formId, eventName, parameters) {
        const form = document.getElementById(formId);
        if (!form) return;
        form.addEventListener("submit", () => track(eventName, parameters));
    }

    function bindAnalytics() {
        bindFormEvent("settingsForm", "settings_saved");
        bindFormEvent("quickAddForm", "work_day_saved", { entry_method: "fast_entry" });
        bindFormEvent("editForm", "work_day_saved", { entry_method: "calendar_editor" });

        const monthPicker = document.getElementById("monthPicker");
        monthPicker?.addEventListener("change", () => {
            track("pay_month_changed", { navigation_method: "month_picker" });
        });

        document.addEventListener("click", event => {
            const button = event.target.closest("button");
            if (!button) return;

            const eventsById = {
                openHelpBtn: ["help_opened"],
                openSettingsBtn: ["settings_opened"],
                prevMonthBtn: ["pay_month_changed", { navigation_method: "previous_button" }],
                nextMonthBtn: ["pay_month_changed", { navigation_method: "next_button" }],
                calendarTodayBtn: ["pay_month_changed", { navigation_method: "current_month_button" }],
                autoFillCycleBtn: ["cycle_autofilled"],
                fabExport: ["file_download", { file_extension: "csv", content_type: "workpay_entries" }],
                workpayNoticeDismiss: ["feature_notice_action", { action: "dismissed" }],
                workpayNoticeSettings: ["feature_notice_action", { action: "opened_settings" }]
            };

            const configuredEvent = eventsById[button.id];
            if (configuredEvent) {
                track(configuredEvent[0], configuredEvent[1]);
                return;
            }

            if (button.matches("#entryList .edit")) {
                track("work_day_edit_opened");
                return;
            }

            if (button.matches("#entryList .remove")) {
                track("work_day_removed");
                return;
            }

            if (button.matches("#cycleCalendar .calendar-cell[data-date]")) {
                track("calendar_day_selected");
            }
        });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", bindAnalytics, { once: true });
    } else {
        bindAnalytics();
    }
})();