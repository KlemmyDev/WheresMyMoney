# Contributing

Thanks for helping. Bug reports, other banks' statement formats and pull requests are all welcome. For anything bigger
than a small fix, open an issue first so we can agree on the approach.

## Running it locally

You need [uv](https://docs.astral.sh/uv/) (Python 3.13) and Node 22 or later.

```bash
uv sync                 # the app and the dev tools, from uv.lock
npm --prefix web ci     # the web app, from web/package-lock.json
```

Then run it with the demo household (keep it in its own database so it never mixes with real money):

```bash
DEMO=1 AUTH=false DB_PATH=data/demo.db uv run uvicorn app.main:app --reload --port 8080
npm --prefix web run dev   # http://localhost:5174, with /api proxied to :8080
```

## Before a pull request

```bash
uv run ruff check . && uv run ruff format --check . && uv run mypy && uv run pytest
npm --prefix web run typecheck && npm --prefix web run lint && npm --prefix web run format:check && npm --prefix web run build
```

CI runs the same, and builds the Docker image for amd64 and arm64.

## How it's laid out

- `app/core`: configuration, the database and its migrations (`schema.py`), dates and schedules, security headers.
- `app/features/<feature>`: one folder per feature, each with its `service.py` (the logic, plain functions over
  SQLite) and `router.py` (its `/api` routes). `app/container.py` builds them all.
- `web/src/features/<feature>`: the pages, and `web/src/features/common` for the tiles, gauges, dialogs and motion.
- `tests/`: one file per feature, run against a fresh database each time. Today is fixed at Thursday 12 November 2026
  (the designs' payday), so expectations read like the designs.

## Adding a bank's statement format

uBank's export is recognised as it is (`app/features/imports/statement.py`). Any other bank's CSV can be read once its
columns are matched in the app, which remembers them. To have a format recognised out of the box, add its header and
columns next to `UBANK`, with a test that reads a real (anonymised) file.

## Writing

- Words people read are plain, friendly Australian English without jargon. Say what something is for and what to do.
- Money is cents everywhere until it's shown. Figures are in IBM Plex Mono, tabular.
- Never recommend a financial product. Anything that projects the future says it's general information, not advice.
