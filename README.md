# Workforce Allocation Dashboard — Modular Edition

The application has been reorganized into small, feature-focused frontend and backend modules while preserving the existing UI, API paths, authentication, database schema, imports, charts, assignments, and timesheet behavior.

## Run

```bash
npm install
npm start
```

Open `http://localhost:9002`.

The compatibility password remains `Esr!@9122`. For deployment, set your own values:

```bash
DASHBOARD_PASSWORD="your-password" \
DASHBOARD_AUTH_SECRET="a-long-random-secret" \
npm start
```

The port can be changed with `PORT=4000 npm start`.

## Database commands

```bash
npm run seed   # replace current data with the supplied JSON seed data
npm run reset  # reset and re-seed the database
```

The seeder validates both JSON files before deleting existing data.

## Modular structure

```text
Assignment_Dashboard_Modular/
├── server.js                         # Small process entry point
├── db.js                             # Database CLI compatibility entry point
├── sqlite-driver.js                  # Built-in node:sqlite compatibility wrapper
├── server/
│   ├── app.js                        # Express application composition
│   ├── config.js                     # Environment and path configuration
│   ├── auth/                         # Login, cookies and auth middleware
│   ├── database/                     # Connection, schema, migrations and seeding
│   ├── routes/                       # Feature-specific Express routers
│   └── services/                     # Fiscal, import and analytics domain logic
├── public/
│   ├── index.html                    # Lightweight page shell
│   ├── views/                        # Header and dashboard HTML fragments
│   ├── css/                          # Feature-specific stylesheets
│   └── js/
│       ├── app.js                    # Fragment loader and initialization
│       └── modules/                  # Dashboard feature modules
├── historical_seed.json
├── pipeline_seed.json
└── workforce.db
```

## Main changes

- `server.js`: reduced from 1,879 lines to a small startup file.
- `public/js/app.js`: reduced from 3,976 lines to initialization only.
- `public/index.html`: reduced from 1,690 lines to a page shell; dashboard sections are in `public/views`.
- `public/css/style.css`: reduced from 1,201 lines to ordered stylesheet imports.
- Database connection, schema, migrations, seed data and seed execution are separate modules.
- Employee, project, assignment, timesheet and dashboard APIs are separate routers.
- Project analysis, fiscal calculations, import normalization and color assignment are separate services.
- Frontend modules remain classic browser scripts so existing inline handlers and shared functions continue to behave as before.

## Runtime requirement

Use Node.js 22.13 or newer. The application uses Node's built-in synchronous `node:sqlite` implementation and does not install `better-sqlite3`, so Windows does not need a native SQLite addon, Visual Studio Build Tools, or a platform-specific binary.

After replacing an older project copy, remove its existing dependencies before reinstalling:

```powershell
Remove-Item -Recurse -Force node_modules
Remove-Item -Force package-lock.json -ErrorAction SilentlyContinue
npm install
```

## Verification performed

- Individual and combined JavaScript syntax checks
- Database migration startup
- Seed process on an isolated database
- Authentication and protected static assets
- All existing API endpoints
- Employee and project CRUD
- Transactional bulk assignment creation and cleanup
- HTML fragment reconstruction: all 73 original element IDs retained, with no duplicates
