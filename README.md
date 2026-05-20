# Workforce Allocation Dashboard

A full-stack workforce allocation dashboard with a weekly assignment matrix, project pipeline tracking, and utilization analytics.

**Stack:** Node.js + Express + SQLite (better-sqlite3) backend · Vanilla JS + Tailwind + Chart.js frontend.

---

## Features

- **51-column assignment matrix** — SN · Name · Dept · 12 months (Apr 2026 – Mar 2027) × 4 weeks each. Horizontally scrollable. Sticky first 3 columns. Sticky header rows.
- **Six KPI cards** — Active Employees, Active Projects, Avg Utilization, Total Assignments, Productivity, On-Time %.
- **Inline cell editing** — click any cell to add an assignment, click a chip to edit, hover the ✕ to delete.
- **Full CRUD** — Employees, Projects, Assignments. Cascading delete for FK relationships.
- **Charts**
  - Trends (line): monthly assignments + avg utilization.
  - Projects Pipeline (bar): count by stage.
  - Department Workload (horizontal bar).
- **Lists**
  - Top 5 Available (lowest allocation).
  - Top 5 High Workload (highest allocation).
  - Upcoming Deadlines with status (On Track / At Risk / Delayed).
- **Search** employees by name or department.
- **Toasts** for success/error feedback.
- **SQLite** as a single file (`workforce.db`), no server install required.

---

## Setup

You need **Node.js ≥ 18**.

```bash
# 1. install dependencies
npm install

# 2. seed the database (creates workforce.db with ~50 employees, 25 projects, ~6,000 assignments)
npm run seed

# 3. start the server
npm start
```

Then open **http://localhost:3000** in your browser.

To re-seed from scratch:
```bash
npm run reset   # deletes workforce.db
npm run seed
```

---

## Project Structure

```
workforce-dashboard/
├── server.js           # Express API
├── db.js               # SQLite schema + seed + CLI
├── package.json
├── public/
│   └── index.html      # Single-file frontend (Tailwind + Chart.js via CDN)
└── workforce.db        # Created on first run
```

---

## API Reference

All endpoints return JSON. Errors are returned as `{ "error": "message" }` with appropriate HTTP status.

### Employees
| Method | Path                  | Body                                  |
|--------|-----------------------|---------------------------------------|
| GET    | `/api/employees`      | —                                     |
| POST   | `/api/employees`      | `{ name, dept, email }`               |
| PUT    | `/api/employees/:id`  | `{ name?, dept?, email? }`            |
| DELETE | `/api/employees/:id`  | —                                     |

### Projects
| Method | Path                  | Body                                                                                  |
|--------|-----------------------|---------------------------------------------------------------------------------------|
| GET    | `/api/projects`       | —                                                                                     |
| POST   | `/api/projects`       | `{ code, name, client, budget, end_date, stage, progress, color, priority }`          |
| PUT    | `/api/projects/:id`   | any subset of the above                                                               |
| DELETE | `/api/projects/:id`   | —                                                                                     |

### Assignments
| Method | Path                                       | Body                                                                  |
|--------|--------------------------------------------|-----------------------------------------------------------------------|
| GET    | `/api/assignments?fiscalYear=2026`         | —                                                                     |
| POST   | `/api/assignments`                         | `{ employee_id, project_id, year, month, week, percentage }`          |
| PUT    | `/api/assignments/:id`                     | any subset of the above                                               |
| DELETE | `/api/assignments/:id`                     | —                                                                     |

### Dashboard
| Method | Path                                            | Description                              |
|--------|-------------------------------------------------|------------------------------------------|
| GET    | `/api/dashboard/stats?fiscalYear=2026`          | Six KPIs                                 |
| GET    | `/api/dashboard/trends?fiscalYear=2026`         | Monthly assignments + avg utilization    |
| GET    | `/api/dashboard/workload?fiscalYear=2026`       | Assignment count per department          |
| GET    | `/api/dashboard/utilization?fiscalYear=2026`    | All employees + top/bottom 5             |
| GET    | `/api/dashboard/pipeline`                       | Project counts grouped by stage          |
| GET    | `/api/dashboard/deadlines`                      | Upcoming project deadlines               |
| GET    | `/api/fiscal-years`                             | List of fiscal years that have data      |

---

## Data Model

```
employees    (id, name, dept, email, created_at)
projects     (id, code UNIQUE, name, client, budget, spent_pct, end_date,
              stage, progress, color, priority, created_at)
assignments  (id, employee_id FK, project_id FK,
              year, month, week, percentage, created_at)
```

A "fiscal year" `Y` covers months **Apr Y → Mar Y+1**. The current seed is fiscal year **2026** (Apr 2026 – Mar 2027).

---

## Customisation

- **Departments** — edit the `DEPARTMENTS` map in `db.js`, and the `pill-*` CSS classes + the `Add Employee` modal options in `public/index.html`.
- **Project colors** — `PROJECT_COLORS` in both `db.js` and the `PROJECT_COLORS` const inside the `<script>` in `index.html`.
- **Stages** — `STAGES` in `db.js`, and the `stage-*` CSS classes + `STAGES` const in `index.html`.
- **Port** — `PORT=4000 npm start`.
- **Adding history** — change the seed loop in `db.js` (e.g. `for (const fy of [2024, 2025, 2026])`) and re-run `npm run seed`.

---

## License

MIT — do whatever you want with it.
