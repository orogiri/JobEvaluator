# JobEvaluator

A local app that helps you decide which jobs are worth applying to. Paste a job description, select your resume, and an LLM evaluates how well your resume matches the role across six scoring dimensions. Results are stored in a local SQLite database and surfaced through a suite of analysis views.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + TypeScript + Vite |
| Styling | Tailwind CSS |
| Charts | Recharts |
| Backend | Node.js + Express |
| Database | SQLite via sql.js (persisted to `server/data.db`) |
| LLM Providers | Anthropic, OpenAI, Qwen (Alibaba Cloud) |

---

## Setup

### Prerequisites
- Node.js 18+

### Install
```bash
npm run install:all
```

This installs dependencies for the root, server, and client in one command.

### Run
```bash
npm run dev
```

Starts both the Express server (port 3001) and the Vite dev server (port 5173) concurrently. Open [http://localhost:5173](http://localhost:5173).

---

## First-time Configuration

1. Go to **Settings → API Keys** and enter at least one provider key:
   - **Anthropic** — from [console.anthropic.com](https://console.anthropic.com)
   - **OpenAI** — from [platform.openai.com](https://platform.openai.com)
   - **Qwen (Alibaba Cloud)** — from the Alibaba Cloud Model Studio console (international endpoint: `dashscope-intl.aliyuncs.com`)

2. Go to **Settings → Resume Categories** and create a category (e.g. `FP&A`, `IR`).

3. Go to **Settings → Resumes**, paste your resume text, and assign it to a category.

You're now ready to evaluate jobs.

---

## Tabs

### Evaluate
Paste a job description, select a resume, choose a provider and model, and click **Evaluate**. Before submitting, a cost estimate is shown based on the prompt size.

The LLM:
- Extracts job metadata (company, title, salary, level, remote, industry, reports-to, years required, meets requirements/preferences)
- Maps the JD to a dynamic set of fields per resume category, creating new fields as needed
- Scores the resume against the JD on six dimensions

**Scoring dimensions (default weights):**
| Dimension | Weight |
|---|---|
| Duties Match | 20% |
| Requirements Match | 20% |
| Preferences Match | 10% |
| Years of Experience Match | 15% |
| Skill / Keyword Match | 15% |
| Industry / Business Model Fit | 20% |

Each score (0–10) includes rationale, JD evidence, resume evidence, gaps, and confidence level. Weights are fully configurable in Settings and all Archive scores recompute automatically when changed.

---

### Archive
A scrollable table of all evaluated jobs with sticky column headers and sticky Date + Company columns.

**Columns:** Date, Company, Sector, Title, Category, Level, Reports To, Remote, Yrs Req, Meets Reqs, Meets Prefs, Overall, Duties, Req, Prefs, Exp, Skills, Industry, Salary, Applied, 1st Round, 2nd Round, 3rd Round, Offer Made, Model, Actions

**Sortable by:** Date, Overall, Duties, Req, Exp, Skills, Industry, Salary

**Filterable by:** Category, minimum overall score, field keyword

**Application tracking:** Five checkboxes per row (Applied → 1st Round → 2nd Round → 3rd Round → Offer) update immediately and persist to the database.

**Per-row actions:**
- **↻ Refresh Metadata** — re-runs a lightweight LLM prompt to update remote, level, salary, years, reports-to, meets requirements/preferences, and industry. Does not re-score.
- **↺ Recalculate Scores** — re-runs the full scoring prompt and updates all six dimensions plus the model column.
- **🗑 Delete** — removes the evaluation and orphaned job description.

**Sidebar (right):** Filters panel + LLM Operations panel with provider/model selector, Refresh All and Recalculate All buttons, and per-job cost estimates.

Click any row to expand a full evaluation detail view inline.

---

### Field Comparison
A pivot-table view showing every dynamic field as a row and each job as a column.

- **Left sticky column:** field name
- **Second sticky column (blue):** your resume's evidence for that field
- **Remaining columns:** one per job, showing the JD's value (N/A if not mentioned)

Fields are sorted by relevance — those mentioned by the most jobs appear first. Filterable by category and field keyword. Resume column can be toggled.

---

### Benchmarking
A scatter plot of years-of-experience required (X axis) vs salary midpoint (Y axis) with a linear regression trend line and R² value.

- **Trendline @ 10 years** — model-predicted salary for a candidate with 10 years of experience
- **Salary range by level** — P10 / median / P90 salary midpoints for each job level present in the data, shown as proportional bars
- Filterable by level and resume category

---

### Analytics
Funnel-style analysis of how your scores relate to application outcomes.

**Stage score cards:** Average overall score (and job count) at each stage — All Jobs → Applied → 1st Round → 2nd Round → 3rd Round → Offer.

**Bar chart:** Visual comparison of average score across stages.

**Score breakdown table:** All six scoring dimensions averaged per stage, color-coded by value.

**Industry pie chart:** Donut chart showing job count by company industry, with percentage and count legend.

Filterable by resume category.

---

### AI Chat
A persistent chat interface where an LLM answers questions about your job evaluation data.

Every message includes a system prompt with your full evaluation archive — scores, rationale, gaps, field comparisons, salary, metadata, and tracking status. The LLM can identify patterns, compare jobs, flag consistent gaps, and give strategic advice.

**Features:**
- Past conversations saved and listed in the left sidebar
- Auto-loads most recent conversation on page open
- Provider/model selector and per-message cost estimate
- Suggested starter questions shown when conversation is empty
- Enter to send, Shift+Enter for new line

---

### Settings

| Section | Description |
|---|---|
| API Keys | Enter and save keys for Anthropic, OpenAI, and Qwen |
| Model Pricing | Read-only table of input/output cost per 1M tokens for all available models |
| Score Weights | Adjust the six scoring dimension weights (must sum to 100%). Archive scores recompute immediately on save. |
| Resume Categories | Add or delete categories (e.g. FP&A, IR) |
| Resumes | Add, edit, or delete resumes. Each resume belongs to a category. |

---

## LLM Providers

| Provider | Models | Notes |
|---|---|---|
| Anthropic | Claude Opus 4.8, Sonnet 5, Haiku 4.5 | Best for nuanced analysis |
| OpenAI | GPT-5.6 Sol/Terra/Luna, 5.4-mini, 5.4-nano | — |
| DeepSeek | V4 Flash, V4 Pro | — |
| Qwen | Qwen3.7-Max, Qwen3.7-Plus, Qwen3.6-Flash | Uses Alibaba Cloud international endpoint |

**Recommended for evaluation:** Claude Sonnet 5 or Qwen3.7-Plus (best performance-per-cost).

The last-used provider and model are remembered and set as defaults on the Evaluate tab.

---

## Dynamic Field System

Fields are extracted from job descriptions per resume category and grow over time. When the LLM encounters a component in a JD that doesn't match any existing field, it creates a new one with a name and description. All prior evaluations show `N/A` for fields that didn't exist when they were evaluated. This can be populated by running **Refresh Metadata** on older evaluations.

---

## Data Storage

In local dev (`npm run dev`), everything is stored in `server/data.db` (SQLite). This file is written to disk after every mutation — including checkbox changes — so data survives server restarts.

**Tables:** `categories`, `resumes`, `fields`, `job_descriptions`, `evaluations`, `settings`, `chat_sessions`

To back up your data, copy `server/data.db`.

In the packaged desktop app, the database instead lives per-install under the OS user-data folder (see below) — never inside the app's own install directory — so each person who installs the app keeps entirely separate data (resumes, job history, API keys) even though they're all running the same code.

---

## Desktop App (Electron)

The client + server are also packaged as a real installable desktop app — a double-clickable icon, no terminal, no Node install required on the end user's machine. This is how you'd hand a working copy to someone else (e.g. a partner) who should have their own resumes/job data and their own API keys, isolated from yours.

### How isolation works
- Each install stores its SQLite file in `app.getPath('userData')` (on Windows: `%APPDATA%\job-evaluator\data.db`), set via the `JOBEVAL_DATA_DIR` env var in [electron/main.cjs](electron/main.cjs).
- API keys live in that same per-install database (the `settings` table), so they're isolated too — each person enters their own keys in Settings after install.
- The app code itself ships with no data or keys baked in.

### Dev mode
```bash
npm run electron:dev
```
Runs the Express server, Vite dev server, and an Electron window together, same live-reload behavior as `npm run dev`.

### Building an installer locally (no publish)
```bash
npm run electron:build
```
Builds the client and produces a Windows installer under `release/`.

### Publishing an update
Auto-update is wired via `electron-updater`, pointed at GitHub Releases. One-time setup:
1. Push this repo to GitHub.
2. Edit the `build.publish` block in [package.json](package.json) — replace `REPLACE_WITH_GITHUB_USERNAME` and `REPLACE_WITH_REPO_NAME` with your actual GitHub owner/repo.
3. Generate a GitHub personal access token with `repo` scope (needed to upload release assets).

Then, each time you want to ship a new version to installed copies:
```bash
# bump "version" in package.json first
GH_TOKEN=<your token> npm run electron:release
```
This builds the installer and uploads it as a GitHub Release. Every installed copy checks for updates on launch; when one is found, it downloads in the background and prompts "Restart now?" to apply it. No action needed on the other person's end beyond clicking that prompt.

### First-time install for someone else
1. Build (or download, once releases exist) the installer and send it to them.
2. They run it — creates a desktop shortcut, no Node/git required.
3. On first launch they go to Settings and enter their own API keys and set up their own resume categories/resumes.
4. Future updates arrive automatically per the flow above.
