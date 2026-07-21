# Workforce Allocation Dashboard

A modular workforce-planning, project-allocation, utilization, revenue-capacity, and plan-to-execution dashboard built with **Node.js**, **Express**, **SQLite**, **Chart.js**, modular browser JavaScript, modular CSS, and HTML fragments.

The application manages employees, projects, weekly assignments, timesheet summaries, utilization, planned revenue, committed targets, annual capacity, Pre-Sale products, and planned-versus-actual delivery analysis while preserving all operational data in `workforce.db`.

---

## Contents

- [Current capabilities](#current-capabilities)
- [Runtime requirements](#runtime-requirements)
- [Quick start](#quick-start)
- [Configuration](#configuration)
- [NPM commands](#npm-commands)
- [Database and data safety](#database-and-data-safety)
- [Core business rules](#core-business-rules)
- [Dashboard modules](#dashboard-modules)
- [API overview](#api-overview)
- [Architecture](#architecture)
- [Complete project structure](#complete-project-structure)
- [Development workflow](#development-workflow)
- [Verification checklist](#verification-checklist)
- [Troubleshooting](#troubleshooting)

---

## Current capabilities

### Executive KPI row

The dashboard contains six primary KPI cards:

1. **Active Resources**
2. **Running Projects**
3. **Avg Utilization**
4. **Assigned Projects**
5. **Committed Target**
6. **Allocated Capacity**

The supporting rows in these cards are interactive and open detailed resource, project, utilization, target, or capacity views.

### Resource management

- Add, edit, activate, deactivate, and delete employee records.
- Maintain designation and annual Workdays.
- Existing employee Workdays default to `220`.
- Supported revenue-rate designations:
  - Team Lead
  - Senior Consultant
  - Consultant
  - Junior Consultant
  - Analyst
- Team-composition shortcuts open designation-filtered employee lists.
- Selecting an employee opens the existing Edit Resource modal.

### Project management

- Add, edit, delete, and import project records.
- Track project stage, probability, progress, Product Family, Product Amount, opportunity data, Closed Won Date, and Project Closing Date.
- Open project lists directly from dashboard KPI rows.
- Selecting a project opens the Edit Project modal.

### Resource Assignment Matrix

- Weekly resource allocation by fiscal year.
- Fiscal years use the **ending year** convention:
  - FY2027 = April 2026 through March 2027
  - FY2028 = April 2027 through March 2028
- Allocation and Revenue groups use separate visual treatments.
- Revenue breakdown is available from the Total/Average row.
- Assignment editing preserves project, dates, presets, percentage allocation, customer, and product metadata.
- Matrix controls appear in this order:
  1. Pre-Sale Product
  2. Reserve Revenue
  3. Resource Assignment Matrix
  4. Yearly Work by Project
  5. Project-wise People
  6. Matrix FY

### Reserve Revenue

Two hourly rates are stored for each supported designation:

- **Intrasourcing**
- **Local / Pre-Sale / Training**

Local, Pre-Sale, and Training remain separate assignment categories but share the second designation rate.

### Pre-Sale Product master

The **Pre-Sale Product** modal provides a persistent master list containing:

- Product Name
- Amount

Products can be added, edited, renamed, and removed. The modal has a fixed outer height and an internally scrollable list for large product sets.

For Pre-Sale assignments:

- Product Name must be selected from the saved master list.
- Arbitrary product names are rejected by both the browser and server.
- The selected product's saved amount is shown for reference.
- A product that is still referenced by an assignment cannot be removed.
- Renaming a product updates matching assignment selections.

### Plan-to-Execution Map

The Plan-to-Execution Map compares planned assignment effort with Work Summary Time Sheet delivery effort.

It includes:

- Planned resources
- Actual resources
- Planned effort
- Actual effort
- Planned Budget
- Actual Budget
- Planned Team
- Actual Delivery Team
- Central execution-variance visualization

Project selection supports known options and typed values. Project aliases and Time Sheet Work Type matching are preserved.

When **Pre-Sale** is selected:

- A Product dropdown appears to the right of Month.
- The dropdown contains `All Products` and applicable saved Pre-Sale products.
- Planned Team Amount is calculated from employee planned hours and designation rates.
- Actual Delivery Team Amount comes from the Pre-Sale Product master.
- All Products sums the distinct included product amounts.
- Selecting one product scopes effort and amount information to that product.

### Planned vs Actual

The Planned vs Actual section supports:

- Percent Wise view
- Revenue Wise view
- A fiscal-year selector local to the card
- Planned and Actual values in a compact two-column hover table
- Total values
- The existing six Work Summary categories and ordering

### Imports and timesheets

- Project import
- Assignment import
- Work Summary Time Sheet bulk upload
- Normalization of employee identities and work types
- Analytics based on imported actual effort

---

## Runtime requirements

- **Target runtime:** Node.js 24.x
- **Minimum supported version:** Node.js `22.13.0`
- **Package manager:** npm
- **Database:** built-in `node:sqlite`
- **Web server:** Express 4
- **Default URL:** `http://localhost:9002`

The project does **not** use `better-sqlite3`. Native SQLite addon compilation, Visual Studio Build Tools, and platform-specific SQLite binaries are not required.

Check the installed runtime:

```bash
node --version
npm --version
```

---

## Quick start

From the project root:

```bash
npm install
npm start
```

Open:

```text
http://localhost:9002
```

The compatibility password is:

```text
*******
```

For normal deployment, configure a private password and authentication secret rather than relying on the compatibility default.

### Windows convenience startup

The included `autorun.bat` starts the application with:

```bat
npm start
```

---

## Configuration

The server reads the following environment variables:

| Variable                |       Default | Purpose                                  |
| ----------------------- | ------------: | ---------------------------------------- |
| `PORT`                  |        `9002` | HTTP listening port                      |
| `DASHBOARD_PASSWORD`    |   `Esr!@9122` | Dashboard login password                 |
| `DASHBOARD_AUTH_SECRET` | Derived value | Secret used to sign authentication state |

### Linux/macOS example

```bash
DASHBOARD_PASSWORD='replace-this-password' \
DASHBOARD_AUTH_SECRET='replace-with-a-long-random-secret' \
PORT=9002 \
npm start
```

### PowerShell example

```powershell
$env:DASHBOARD_PASSWORD = 'replace-this-password'
$env:DASHBOARD_AUTH_SECRET = 'replace-with-a-long-random-secret'
$env:PORT = '9002'
npm start
```

Authentication cookies use the name `wa_auth` and expire after 12 hours.

---

## NPM commands

| Command         | Description                                                  |
| --------------- | ------------------------------------------------------------ |
| `npm start`     | Start the production-style server with`node server.js`       |
| `npm run dev`   | Start the server with Node's watch mode                      |
| `npm run seed`  | Replace application records with the supplied seed JSON data |
| `npm run reset` | Reset and reseed the database                                |

> **Warning:** `seed` and `reset` are destructive data-management commands. Back up `workforce.db` before using either command against valuable data.

The seeder validates the supplied JSON inputs before deleting existing application records.

---

## Database and data safety

The live database is:

```text
workforce.db
```

SQLite may also create:

```text
workforce.db-wal
workforce.db-shm
```

These companion files are part of SQLite's write-ahead logging state. Do not casually copy, delete, or replace them while the application is running.

### Safe backup procedure

1. Stop the application.
2. Copy `workforce.db` to a secure backup location.
3. If `workforce.db-wal` and `workforce.db-shm` exist, keep them with the database copy unless SQLite has already checkpointed and removed them.
4. Restart the application.

### Migrations

Database migrations run during startup and are designed to be idempotent. They add missing tables, columns, and indexes without recreating the database.

Current persisted domains include:

- Employees and Workdays
- Projects and opportunity metadata
- Weekly assignments
- Assignment customer and product metadata
- Work Summary Time Sheet entries
- Reserve Revenue rates
- Committed revenue targets
- Pre-Sale Product master data

Never replace `workforce.db` merely to apply a source-code update.

---

## Core business rules

### Standard work week

The application uses exactly:

```text
36.66 hours per week
```

Do not substitute a 40-hour work week.

### Assignment hours

```text
hours = 36.66 × allocationPercent / 100
```

Examples:

| Allocation | Weekly hours |
| ---------: | -----------: |
|       100% |        36.66 |
|        75% |       27.495 |
|        50% |        18.33 |
|        25% |        9.165 |

### N/A availability rule

N/A and equivalent unavailable assignments:

- remain visible and editable;
- exclude the affected resource-week from analytics denominators;
- exclude all other assignments for that resource in that week from analytics;
- are never classified as Local.

For annual capacity calculations:

- each resource-month containing one or more N/A assignments deducts exactly `18.33` Workdays;
- the deduction occurs once per affected resource-month, not once per weekly N/A row;
- adjusted Workdays cannot be less than zero.

### Running Projects definition

A project is a Running Project when all of the following are true:

- Stage is `Closed Won`;
- Product Family is `Professional Service` or `Professional Services`;
- Progress is below 100%;
- Closed Won Date is on or after March 1, 2025.

Future Closed Won Dates are included.

Running-project PS Revenue is the direct sum of Product Amount. Opportunity Amount and Budget are not used as fallbacks.

Relative date labels use only Project Closing Date. When Project Closing Date is empty, Closed Won Date can still be displayed, but no relative due-date text is generated.

### Utilization definitions

- **Intrasourcing Utilization:** Intrasourcing
- **Billable Utilization:** Intrasourcing + Local + Pre-Sale
- **Project Utilization:** Intrasourcing + Local + Pre-Sale + Training
- **General Admin:** excluded

N/A resource-weeks are excluded from availability denominators.

### Assigned Projects portfolio

- **Running Project:** uses the Running Projects definition above
- **Weighted Prospect:** Stage is not Closed Won and Probability is at least 75%
- **Prospect:** Stage is not Closed Won and Probability is below 75%

### Committed Target

```text
Committed Target = Intrasourcing Revenue Target + Local PS Revenue Target
```

Manual target values persist in SQLite. Until a manual target is saved, the existing calculated assignment revenue remains the fallback.

Committed targets are separate from Reserve Revenue hourly rates.

### Allocated Capacity

```text
Remaining Allocated Capacity = Max Capacity Amount − Capacity Allocated
```

#### Max Capacity Amount

For each active resource:

```text
Adjusted Workdays × 8 × Local / Pre-Sale / Training hourly rate
```

The resource values are summed across all active resources.

#### Available Capacity

```text
Available Capacity = sum of adjusted Workdays across active resources
```

#### Capacity Allocated

```text
Capacity Allocated = Planned Intrasourcing Revenue + Planned Local Revenue
```

Pre-Sale and Training are excluded from Capacity Allocated. Existing N/A exclusions continue to apply.

### Planned Team amount for Pre-Sale

For each planned employee in the selected scope:

```text
Employee planned hours × employee Local / Pre-Sale / Training hourly rate
```

The employee amounts are summed.

### Actual Delivery Team amount for Pre-Sale

Actual Pre-Sale amount is sourced from the saved Pre-Sale Product master:

- `All Products` sums the distinct included product amounts.
- An individual product selection shows that product's saved amount.

### Canonical employee identity

The following names refer to the same employee identity:

- Imran Chowdhury
- Shah Imran Ahsan Chowdhury

Canonical display name:

```text
Shah Imran Ahsan Chowdhury
```

---

## Dashboard modules

### Header and navigation

`public/views/header.html` contains the primary dashboard navigation, tabs, controls, and shared actions.

### Stats and KPI cards

`public/views/sections/stats.html` contains the six-card KPI row. KPI computation and detail interactions are primarily implemented in:

- `public/js/modules/dashboard/overview.js`
- `public/js/modules/dashboard/resource-summary.js`
- `public/js/modules/dashboard/resource-summary-metrics.js`
- `public/js/modules/dashboard/resource-summary-totals.js`

### Resource Assignment Matrix

Markup:

```text
public/views/sections/resource-matrix.html
```

Related modules and styles:

```text
public/js/modules/ui/assignment-modal.js
public/js/modules/ui/events.js
public/js/modules/ui/revenue-rates-modal.js
public/js/modules/ui/presale-products-modal.js
public/js/modules/ui/revenue-breakdown-modal.js
public/css/matrix.css
public/css/matrix-assignments.css
public/css/matrix-summary.css
```

### Plan-to-Execution and Planned vs Actual

Markup:

```text
public/views/sections/allocation-charts.html
```

Related modules:

```text
public/js/modules/dashboard/monthly-planned-work.js
public/js/modules/timesheets/planned-actual-model.js
public/js/modules/timesheets/planned-actual-chart.js
```

### Project and resource lists

```text
public/js/modules/projects/lists.js
public/js/modules/projects/resources.js
public/js/modules/ui/resource-project-modals.js
```

### Sales and pipeline analytics

```text
public/js/modules/dashboard/sales-common.js
public/js/modules/dashboard/sales-acquisition.js
public/js/modules/dashboard/sales-revenue.js
public/js/modules/dashboard/sales-ps-type.js
```

### Imports

```text
public/js/modules/imports/projects.js
public/js/modules/imports/assignments.js
public/js/modules/timesheets/upload.js
```

---

## API overview

All application APIs are protected by dashboard authentication, except the authentication flow itself.

### Employees

| Method | Path                        | Purpose             |
| ------ | --------------------------- | ------------------- |
| GET    | `/api/employees`            | List employees      |
| POST   | `/api/employees`            | Create an employee  |
| PUT    | `/api/employees/:id`        | Update an employee  |
| PATCH  | `/api/employees/:id/active` | Change active state |
| DELETE | `/api/employees/:id`        | Delete an employee  |

### Projects

| Method | Path                   | Purpose             |
| ------ | ---------------------- | ------------------- |
| GET    | `/api/projects`        | List projects       |
| POST   | `/api/projects`        | Create a project    |
| PUT    | `/api/projects/:id`    | Update a project    |
| DELETE | `/api/projects/:id`    | Delete a project    |
| POST   | `/api/projects/import` | Import project data |

### Assignments

| Method | Path                              | Purpose                    |
| ------ | --------------------------------- | -------------------------- |
| GET    | `/api/assignments`                | List assignments           |
| POST   | `/api/assignments`                | Create an assignment       |
| POST   | `/api/assignments/bulk`           | Create assignments in bulk |
| POST   | `/api/assignments/import`         | Import assignments         |
| PUT    | `/api/assignments/:id`            | Update an assignment       |
| POST   | `/api/assignments/:id/reschedule` | Reschedule an assignment   |
| DELETE | `/api/assignments/:id`            | Delete an assignment       |

### Timesheets

| Method | Path                          | Purpose                              |
| ------ | ----------------------------- | ------------------------------------ |
| GET    | `/api/timesheet-summary`      | Read Work Summary Time Sheet entries |
| POST   | `/api/timesheet-summary/bulk` | Upload entries in bulk               |
| DELETE | `/api/timesheet-summary`      | Clear matching timesheet data        |

### Revenue configuration

| Method | Path                                | Purpose                                |
| ------ | ----------------------------------- | -------------------------------------- |
| GET    | `/api/revenue-rates`                | Read designation hourly rates          |
| PUT    | `/api/revenue-rates`                | Save designation hourly rates          |
| GET    | `/api/committed-targets`            | Read committed targets                 |
| PUT    | `/api/committed-targets/:targetKey` | Save a committed target                |
| GET    | `/api/presale-products`             | Read Pre-Sale products                 |
| PUT    | `/api/presale-products`             | Save the complete Pre-Sale product set |

### Dashboard analytics

| Method | Path                                       |
| ------ | ------------------------------------------ |
| GET    | `/api/dashboard/stats`                     |
| GET    | `/api/dashboard/utilization`               |
| GET    | `/api/dashboard/utilization-details`       |
| GET    | `/api/dashboard/workload`                  |
| GET    | `/api/dashboard/deadlines`                 |
| GET    | `/api/dashboard/trends`                    |
| GET    | `/api/dashboard/pipeline`                  |
| GET    | `/api/dashboard/running-project-metrics`   |
| GET    | `/api/dashboard/project-portfolio-metrics` |
| GET    | `/api/dashboard/new-logo-chart`            |
| GET    | `/api/dashboard/ps-revenue-chart`          |
| GET    | `/api/dashboard/ps-type-chart`             |

### Miscellaneous

| Method | Path                | Purpose                       |
| ------ | ------------------- | ----------------------------- |
| GET    | `/api/fiscal-years` | Return available fiscal years |
| GET    | `/api/health`       | Application health check      |

---

## Architecture

### Backend

The backend is composed through `server/app.js`:

1. CORS middleware
2. JSON and URL-encoded request parsing
3. Authentication router
4. Authentication guard
5. Static frontend files
6. Feature-specific API routers
7. Root page fallback
8. Central error handler

`server.js` is intentionally a small process entry point.

### Database layer

- `sqlite-driver.js` wraps Node's built-in SQLite implementation.
- `server/database/connection.js` opens the database.
- `server/database/schema.js` establishes the base schema.
- `server/database/migrations.js` applies idempotent upgrades.
- `server/database/seeder.js` manages destructive seed/reset operations.

### Frontend

The frontend uses classic browser scripts rather than a bundler. `public/js/app.js` loads HTML fragments and initializes the dashboard modules.

Benefits of this structure:

- no build step;
- direct browser debugging;
- feature-focused JavaScript files;
- shared functions and existing inline handlers remain compatible;
- CSS is separated by dashboard area.

---

## Complete project structure

```text
Assignment_Dashboard_Shared_Revenue_Rate/
├── .gitignore
├── PROJECT_NAME_ALLOCATION_RULES.md
├── README.md
├── WORKWEEK_36_66_UPDATE.md
├── autorun.bat
├── db.js
├── historical_seed.json
├── package-lock.json
├── package.json
├── pipeline_seed.json
├── server.js
├── sqlite-driver.js
├── workforce.db
├── workforce.db-shm
├── workforce.db-wal
│
├── public/
│   ├── index.html
│   │
│   ├── css/
│   │   ├── components.css
│   │   ├── drag-drop.css
│   │   ├── foundation.css
│   │   ├── layout.css
│   │   ├── matrix-assignments.css
│   │   ├── matrix-summary.css
│   │   ├── matrix.css
│   │   ├── monthly-planned-work.css
│   │   ├── planned-actual.css
│   │   ├── project-lists.css
│   │   ├── sales-charts.css
│   │   ├── style.css
│   │   └── timesheets.css
│   │
│   ├── js/
│   │   ├── app.js
│   │   └── modules/
│   │       ├── core/
│   │       │   ├── api.js
│   │       │   ├── availability.js
│   │       │   ├── data.js
│   │       │   ├── designations.js
│   │       │   ├── person-identity.js
│   │       │   ├── state.js
│   │       │   └── work-schedule.js
│   │       │
│   │       ├── dashboard/
│   │       │   ├── insights.js
│   │       │   ├── monthly-planned-work.js
│   │       │   ├── overview.js
│   │       │   ├── resource-summary-metrics.js
│   │       │   ├── resource-summary-totals.js
│   │       │   ├── resource-summary.js
│   │       │   ├── sales-acquisition.js
│   │       │   ├── sales-common.js
│   │       │   ├── sales-ps-type.js
│   │       │   ├── sales-revenue.js
│   │       │   └── workload.js
│   │       │
│   │       ├── imports/
│   │       │   ├── assignments.js
│   │       │   └── projects.js
│   │       │
│   │       ├── projects/
│   │       │   ├── lists.js
│   │       │   └── resources.js
│   │       │
│   │       ├── timesheets/
│   │       │   ├── charts.js
│   │       │   ├── model.js
│   │       │   ├── planned-actual-chart.js
│   │       │   ├── planned-actual-model.js
│   │       │   ├── ui.js
│   │       │   └── upload.js
│   │       │
│   │       └── ui/
│   │           ├── assignment-modal.js
│   │           ├── committed-targets-modal.js
│   │           ├── events.js
│   │           ├── modal-shell.js
│   │           ├── presale-products-modal.js
│   │           ├── resource-project-modals.js
│   │           ├── revenue-breakdown-modal.js
│   │           └── revenue-rates-modal.js
│   │
│   └── views/
│       ├── header.html
│       └── sections/
│           ├── allocation-charts.html
│           ├── insights.html
│           ├── projects.html
│           ├── resource-matrix.html
│           ├── sales-acquisition-tab.html
│           ├── sales-charts.html
│           ├── sales-ps-type-tab.html
│           ├── sales-revenue-tab.html
│           ├── stats.html
│           └── work-summary.html
│
└── server/
    ├── app.js
    ├── config.js
    │
    ├── auth/
    │   ├── index.js
    │   └── login-page.js
    │
    ├── database/
    │   ├── connection.js
    │   ├── index.js
    │   ├── migrations.js
    │   ├── schema.js
    │   ├── seed-data.js
    │   └── seeder.js
    │
    ├── routes/
    │   ├── assignments.js
    │   ├── committed-targets.js
    │   ├── dashboard-core.js
    │   ├── dashboard-new-logo.js
    │   ├── dashboard-ps-type.js
    │   ├── dashboard-revenue.js
    │   ├── employees.js
    │   ├── index.js
    │   ├── misc.js
    │   ├── presale-products.js
    │   ├── projects.js
    │   ├── revenue-rates.js
    │   └── timesheets.js
    │
    └── services/
        ├── assignment-import.js
        ├── assignment-metadata.js
        ├── availability.js
        ├── committed-targets.js
        ├── fiscal.js
        ├── person-identity.js
        ├── presale-products.js
        ├── project-analytics.js
        ├── project-colors.js
        ├── project-import.js
        ├── revenue-rates.js
        ├── timesheet-normalizer.js
        └── values.js
```

### Root files

| File                               | Responsibility                               |
| ---------------------------------- | -------------------------------------------- |
| `server.js`                        | Starts the HTTP server                       |
| `db.js`                            | Database seed/reset CLI entry point          |
| `sqlite-driver.js`                 | `node:sqlite` compatibility wrapper          |
| `package.json`                     | Runtime metadata, dependencies, and commands |
| `historical_seed.json`             | Historical seed dataset                      |
| `pipeline_seed.json`               | Pipeline seed dataset                        |
| `PROJECT_NAME_ALLOCATION_RULES.md` | Project-name and allocation notes            |
| `WORKWEEK_36_66_UPDATE.md`         | 36.66-hour workweek notes                    |
| `workforce.db`                     | Live SQLite data                             |

---

## Development workflow

### Install dependencies after replacing an older copy

When moving from an older project version, remove old dependencies before reinstalling.

#### PowerShell

```powershell
Remove-Item -Recurse -Force node_modules -ErrorAction SilentlyContinue
Remove-Item -Force package-lock.json -ErrorAction SilentlyContinue
npm install
```

#### Linux/macOS

```bash
rm -rf node_modules package-lock.json
npm install
```

Do **not** delete or replace `workforce.db` during this process.

### Source-change discipline

When implementing changes:

- preserve existing API paths;
- preserve stored data;
- use idempotent migrations for schema additions;
- keep browser JavaScript and CSS modular;
- avoid redesigning unrelated features;
- keep the 36.66-hour formula unchanged;
- enforce important business rules on the server as well as in the UI.

### JavaScript syntax checks

A simple project-wide check can be run from the project root.

#### Linux/macOS

```bash
find public server -name '*.js' -print0 | xargs -0 -n1 node --check
node --check server.js
node --check db.js
node --check sqlite-driver.js
```

#### PowerShell

```powershell
Get-ChildItem public,server -Recurse -Filter *.js | ForEach-Object {
    node --check $_.FullName
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
node --check server.js
node --check db.js
node --check sqlite-driver.js
```

---

## Verification checklist

For a production change, verify at least the following:

- JavaScript syntax checks
- Application starts with `npm start`
- Login page is accessible
- Incorrect password is rejected
- Correct password authenticates successfully
- Protected API endpoints reject unauthenticated requests
- Employee CRUD and Workdays persistence
- Project CRUD and import
- Assignment create, edit, bulk create, import, reschedule, and delete
- Pre-Sale Product create, edit, rename, remove, and persistence
- Pre-Sale assignment Product Name validation
- Reserve Revenue persistence
- Committed Target persistence and fallback behavior
- Running Projects date and revenue rules
- Utilization N/A denominator exclusions
- N/A monthly Workdays deduction
- Max Capacity, Available Capacity, Capacity Allocated, and remaining capacity calculations
- Plan-to-Execution Pre-Sale product filtering and amount calculations
- Work Summary Time Sheet upload and Planned vs Actual rendering
- Modal fixed-header, fixed-footer, and internal-scroll behavior
- Database row counts and integrity after migrations

A database integrity check can be performed with a suitable SQLite client or through a small `node:sqlite` script using:

```sql
PRAGMA integrity_check;
```

The expected result is:

```text
ok
```

---

## Troubleshooting

### Port already in use

Start on another port:

```bash
PORT=9003 npm start
```

PowerShell:

```powershell
$env:PORT = '9003'
npm start
```

### Login repeatedly returns to the login page

- Confirm the server is running from the intended project directory.
- Verify `DASHBOARD_PASSWORD` and `DASHBOARD_AUTH_SECRET` are consistent between restarts.
- Clear the site's `wa_auth` cookie.
- Check reverse-proxy HTTPS and trusted-proxy configuration when deployed behind a proxy.

### `node:sqlite` is unavailable

Upgrade Node.js to version `22.13.0` or newer. Node.js 24.x is the target runtime.

### Dashboard loads without data

- Confirm `workforce.db` exists in the project root.
- Confirm the process has read/write permission for the database directory.
- Check the server console for migration or SQLite errors.
- Do not run `npm run seed` or `npm run reset` unless replacing current records is intentional.

### Pre-Sale product cannot be deleted

The product is still referenced by one or more assignments. Change or remove those assignment references first, then delete the product from the master.

### Capacity values appear lower after N/A assignments

This is expected. Each resource-month containing N/A deducts `18.33` Workdays once from that resource's annual Workdays for capacity calculations.

---

## License and deployment

No explicit open-source license is included in this project. Treat the source code, database, seed data, and business rules as private unless the project owner specifies otherwise.

For deployment:

- use a private `DASHBOARD_PASSWORD`;
- set a strong `DASHBOARD_AUTH_SECRET`;
- place the application behind HTTPS;
- back up `workforce.db` regularly;
- restrict filesystem access to the application account;
- avoid exposing seed/reset commands to untrusted operators.
