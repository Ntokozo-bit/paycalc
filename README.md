# WorkPay

WorkPay is a fast, private work-hours and pay-cycle calculator designed for South African workers. It runs as a static web app, stores data on the device, and can be installed for offline use.

## What it does

- Tracks normal, overtime, Sunday and public-holiday hours
- Separates public holidays not worked from holidays worked: an eligible normally scheduled holiday not worked keeps ordinary pay, while holiday work can double every worked hour (including extra time) or follow the BCEA daily-wage formula, with the daily-wage minimum preserved
- Uses different pay defaults for usual Sundays (1.5×) and occasional Sundays (2×)
- Marks South African public holidays on the calendar, including Monday observance, without creating entries or pay; users save each holiday themselves
- Uses Normal Paid Hours / OT Starts After as the ordinary paid day for scheduled holiday calculations
- Lets users edit saved days in current and completed pay cycles
- Checks the visible pay month for common BCEA flags such as 45-hour weeks, overtime, meal intervals, rest time and night work
- Preserves custom days when auto-filling a pay cycle
- Exports CSV reports and restorable JSON backups
- Works offline after the first successful visit

## Run locally

Service workers require HTTP rather than opening `index.html` directly:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## Privacy and security

WorkPay has no account, server-side database or third-party analytics. Pay and time data remains in browser storage. A restrictive Content Security Policy permits only same-origin app resources.

Users should download a JSON backup before clearing browser storage or moving to another device. CSV exports are reports and cannot be restored.

## South African rules

The in-app guidance is aligned to general 2026 national rules, including the R30.23 national minimum wage from 1 March 2026 and the [R269,600.90 BCEA earnings threshold from 1 May 2026](https://www.labour.gov.za/DocumentCenter/Regulations%20and%20Notices/Notices/Basic%20Conditions%20of%20Employment/Basic%20Conditions%20of%20Employment%20Act_Determination%20Earnings%20Threshold2026.pdf).

WorkPay is an estimator, not payroll or legal advice. Contracts, bargaining councils, sectoral rules, collective agreements and paid-time-off arrangements can change an employee's correct result.

Public holidays are not treated as generic paid-off days. WorkPay records whether the holiday was worked, uses the Week Template to determine whether it was ordinarily a workday, and uses Normal Paid Hours for the ordinary daily wage. The default holiday work mode multiplies every worked hour, including extra time, by the holiday multiplier (at least 2×), while preserving the BCEA daily-wage minimum. Settings also offers the SA daily-wage formula: work on a scheduled holiday pays the greater of double the ordinary daily wage or the ordinary daily wage plus pay for the actual time worked. Normal 1.5× overtime is not stacked on top in either mode. Older completed cycles retain their saved formula and rates.

## Checks

```bash
npm ci
npm test
```

The tests cover reload persistence, current and historical editing, failed saves, normal/overtime separation, zero-minute breaks, holiday formulas and exact offline asset versions. Dependencies are for tests only; the app still runs without a build step.

## Manual day choices

Choose Not working / no pay when no money is due, including unemployment or after a contract ends. Working a normal day fills the weekday schedule with regular overtime off; Enter worked times uses the actual shift. Holiday work applies the selected holiday formula to all hours without separate normal overtime. Paid holiday, not worked adds normal paid hours only for an ordinarily scheduled workday. Paid off day remains available for ordinary dates. No holiday entry or payment is created automatically, and Auto-Fill skips public holidays. Existing saved days remain editable.
