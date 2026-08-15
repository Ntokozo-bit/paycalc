# WorkPay

WorkPay is a fast, private work-hours and pay-cycle calculator designed for South African workers. It runs as a static web app, stores data on the device, and can be installed for offline use.

## What it does

- Tracks normal, overtime, Sunday and public-holiday hours
- Uses different pay defaults for usual Sundays (1.5×) and occasional Sundays (2×)
- Detects South African public holidays, including Monday observance when a holiday falls on Sunday
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

The in-app guidance is aligned to general 2026 national rules, including the R30.23 national minimum wage from 1 March 2026 and the R269,900.90 BCEA earnings threshold from 1 May 2026.

WorkPay is an estimator, not payroll or legal advice. Contracts, bargaining councils, sectoral rules, collective agreements and paid-time-off arrangements can change an employee's correct result.
