# Azure DevOps Deploy Dashboard

An Angular single-page application that gives you a **real-time view of your multi-stage deployment pipeline**.  For every deployment stage it shows:

- Latest pipeline run status (Succeeded / Failed / In Progress / …)
- Run start & finish times
- The referenced **build pipeline** name and build number
- The **commit SHA** (with one-click copy), branch, repository, and author — sourced from the build artifact pipeline run that the deploy pipeline consumed

---

## Quick start

### Prerequisites

- Node.js 18 or later (Node 20+ recommended)
- npm 9 or later

### Install & run

```bash
npm install
npm start           # serves at http://localhost:4200
```

### Production build

```bash
npm run build       # outputs to dist/deploy-dashboard/browser/
```

Serve the `dist/deploy-dashboard/browser/` folder from any static web host (nginx, Azure Static Web Apps, GitHub Pages, etc.).

---

## Using the dashboard

On first load the app presents a configuration form. Fill in:

| Field | Description |
|-------|-------------|
| **Organization URL** | Full URL of your Azure DevOps organisation, e.g. `https://dev.azure.com/myorg` |
| **Project Name** | The Azure DevOps project that owns the pipeline |
| **Deploy Pipeline ID** | The numeric ID of the **deploy** pipeline (visible in the pipeline URL as `definitionId=…`) |
| **Personal Access Token** | A PAT with at minimum **Build → Read** scope |

Click **Load Dashboard** to fetch data and render the stage cards.

---

## How it works

1. **Fetch recent runs** — up to 100 recent runs of the specified deploy pipeline are retrieved from `_apis/pipelines/{id}/runs`.
2. **Enrich each run** — in parallel (max 10 concurrent requests) both the run detail (`resources.pipelines`) and the build timeline (stage records) are fetched for every run.
3. **Aggregate by stage** — for each unique pipeline stage the most recent run that contained it is kept.
4. **Resolve build artifact** — the `resources.pipelines` map on the deploy run points to the actual build pipeline run that was consumed.  That build's `sourceVersion` (commit SHA), branch, repository, and author are fetched from `_apis/build/builds/{id}`.
5. **Render cards** — one card per stage, sorted by most-recently-started first.

---

## CORS considerations

Azure DevOps REST APIs support cross-origin requests when a **Personal Access Token** is sent in the `Authorization` header (`Basic base64(:pat)`).  In most modern browsers this works without additional configuration.

If your organisation's Azure DevOps instance blocks CORS you can:

1. **Angular dev-server proxy** — add a `proxy.conf.json` and run `ng serve --proxy-config proxy.conf.json`.  See the [Angular documentation](https://angular.dev/tools/cli/serve#proxying-to-a-backend-server) for details.
2. **Reverse proxy in production** — configure nginx (or your hosting platform) to proxy `/ado-api/` → `https://dev.azure.com/`.

---

## Project structure

```
src/
├── app/
│   ├── models/
│   │   └── azure-devops.models.ts   # TypeScript interfaces
│   ├── services/
│   │   └── azure-devops.service.ts  # Azure DevOps REST API calls
│   ├── components/
│   │   ├── config-form/             # Configuration input form
│   │   └── dashboard/               # Stage cards view
│   ├── app.ts                       # Root component
│   ├── app.html                     # Root template
│   ├── app.config.ts                # provideHttpClient, provideRouter
│   └── app.routes.ts
├── styles.scss                      # Global CSS variables & reset
└── index.html
```

---

## Running tests

```bash
npm test
```

Tests use **Vitest** (configured via the Angular CLI's `@angular/build:unit-test` builder).
