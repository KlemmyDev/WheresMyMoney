# WheresMyMoney

<img src="brand/wmm-logo-dark.svg" alt="WheresMyMoney" width="340">

A self-hosted money app for a household: the accounts that offset the home loan, quick balance check-ins, statement
imports, bills and spending. It runs on your own home server in Docker, keeps everything in a small SQLite database, and
serves a web app for desktop and phone.

It's built around a common Australian setup: a home loan with an offset, and a handful of accounts that each have a job
(an offset that grows until it covers the loan, a bills account holding a few months of bills, a spending account topped
up each month, savings split into goals), all of them offsetting the loan. There's no bank connection: you copy your
balances in at each payday (about 30 seconds) and, when you like, import a statement CSV for every transaction.

## Alpha

WheresMyMoney is in **alpha**. It runs one household's money; expect rough edges, keep the backups it makes, and tell us
what goes wrong. Net worth, investments and retirement are on their way: see [docs/plan.md](docs/plan.md).

**Australia first.** Money is AUD, dates are Australian, and the words are Australian English. uBank's statement export
is recognised as it is; any other bank's CSV works once you've matched its columns.

**Known limitations:**

- No bank feed, on purpose: balances come from check-ins and statement imports.
- Served over plain HTTP with household sign-in. Keep it on your home network (use a VPN to reach it from outside);
  don't port-forward it.
- Projections (when the loan's fully offset, scenarios) are estimates at today's rate, for your own planning. They're
  general information, not advice.

**Backups.** Every update backs up the database to `data/backups/` first, and it's backed up each night at 3am. For a
copy that survives losing the machine, copy `data/` and `.env` somewhere else now and then.

## What it does

- **Dashboard:** loan coverage (all offsetting accounts, and the offset alone) with when it reaches 100% at your pace,
  interest avoided a day, the bills buffer in months against its target, the spending month against an even pace,
  savings goals, cash flow month by month, every account with its trend, your payday rules and the bills due.
- **Accounts:** each account's job sets its target and chart. Balances over time, its transactions, and the gap between
  the transactions and the balance (only about two years of history is imported), which **setting the exact balance**
  closes with a "Balance adjustment": dated as an opening balance before the history starts, or today.
- **Check-ins:** each account's balance, pre-filled with what your payday rules and bills should have done. A figure
  that doesn't add up is flagged with the transfer that would explain it ("The $300 payday transfer from Offset to
  Savings didn't show up"), to check again tomorrow, mark as skipped, or fix the rule. Rough by default; tick "these
  are exact" to make the ledger match.
- **Statement imports:** drop a CSV. Duplicates are skipped (by date, amount and description, so overlapping exports
  are fine), the running balance is checked row by row, rough check-ins are replaced with the statement's figures,
  things you added by hand are merged with the bank's rows (keeping your note) or kept as cash, categories come from
  merchants you've taught it, and uBank's "Transfer" rows are matched to your rules by amount and date.
- **Rules:** your plan for moving money, as you've set it up in your banking app: pay landing, payday transfers, a
  monthly top-up *to* an amount (so what you didn't spend stays offsetting) and a sweep of whatever's over the bills
  buffer. The app never moves money; it checks the rules at each check-in.
- **Loan:** coverage by account, interest charged and avoided, a projection of the loan against the offsets (at the
  recent pace or your planned saving) with your goal, and what extra a month would do.
- **Bills:** each bill once, with how often and when next. What an average month and the next 30 days hold, the months
  ahead, and the buffer's target worked out from them.
- **Spending:** the month from top-up to top-up: what's left, safe to spend a day, the pace, where it'll be at the next
  top-up, each day's spending and each category against its budget. Add spending on your phone in seconds (cash too).
- **Household:** everyone signs in as themselves; who added what is noted.
- **Notifications:** check-in reminders, a transfer that didn't add up, bills you pay by hand coming up, budgets
  nearly used up, spending ahead of the plan, statements to import and the bills buffer under target, as web push to
  each phone or computer turned on.
- **API keys** for other apps on your network, like a family dashboard: see [docs/developers.md](docs/developers.md).

## What you need

A computer on your home network that stays on, with Docker: a Linux box, a Proxmox LXC or VM, a Raspberry Pi (64-bit),
or a Mac with Docker Desktop.

## Install

On Linux, log in to the machine and run:

```bash
curl -fsSL https://raw.githubusercontent.com/KlemmyDev/WheresMyMoney/main/install.sh | bash
```

On a Mac, install [Docker Desktop](https://docs.docker.com/desktop/setup/install/mac-install/), open it once, then run
the same command from your home folder (`cd ~` first).

The installer:

1. downloads WheresMyMoney into `./wheresmymoney` (installing git and Docker first if they're missing, after asking);
2. asks your time zone and the port (8080 unless you choose another);
3. backs up the database if there is one, builds the image and starts it;
4. sets up updates from the app (a cron job that runs `updater.sh` every minute and only acts when you press Update now);
5. prints the address, and the **set-up code** for the first account.

Then open `http://<the machine's address>:8080`, enter the set-up code with a username and password, and the set-up
guide walks you through your accounts, the loan, bills, pay and how often to check in. Add the rest of the household in
**Settings → Household**.

To try it first with a made-up household, set `DEMO=true` in `.env` before the first start (it only ever fills an
empty database).

### Settings

`.env` next to `docker-compose.yml` holds the few settings that live outside the app (everything else is set in it):

| Setting | Default | What it does |
| --- | --- | --- |
| `PORT` | `8080` | The port it's served on. |
| `TZ` | `Australia/Brisbane` | Your time zone: days roll over, and the spending month counts, at midnight here. |
| `AUTH` | `true` | Sign-in. Only turn it off behind a reverse proxy that signs people in. |
| `FORWARDED_ALLOW_IPS` | `127.0.0.1` | Behind a reverse proxy, its address, so sign-in sees each browser's own. |
| `DEMO` | `false` | Fill an empty database with a made-up household. |
| `API_DOCS` | `false` | Serve the API's documentation at `/api/docs` (behind sign-in). |

`bash install.sh --configure` changes the time zone and port and restarts it.

## Everyday use

- **Check in** on payday (the app reminds you): open your banking app, copy the balances in. If something doesn't add
  up, it says which transfer.
- **Add spending** from your phone as it happens (the + button), or don't: a statement import fills it all in.
- **Import a statement** now and then for every transaction and its category.

On a phone, add it to your Home Screen (Share → Add to Home Screen) for an app of its own, and turn on notifications in
**Settings → Notifications** on each person's phone. Browsers only allow notifications over HTTPS, so for those, reach
it through a reverse proxy with a certificate (or Tailscale's HTTPS).

## Importing statements

1. In your banking app, export a month's transactions as CSV, one file per account. From uBank, the file is named like
   `Spending-2241_2026-10.csv`: the account's last four digits and the month are read from the name, so the right
   account is picked for you (give each account its last four digits in **Accounts**).
2. **Import CSV**, drop the file, check the account, and choose **Review**. Before anything's written it tells you how
   many rows are new, already imported (skipped), or match something you added by hand (merged), and whether a rough
   check-in will be replaced with the statement's figure.
3. Sort what needs you. A suggestion is taken unless you choose another; **Always use** remembers a merchant's category
   for next time (and sorts its earlier transactions).
4. **Import**. If it's the account's first statement, the transactions won't add up to the balance (what came before
   isn't there): **Add an opening balance** fixes that, dated the day before the history starts.

Another bank's file asks you to match its columns (date, description, money in and out or a signed amount, and the
balance) once; it's remembered for files with the same header. The file is read on your server and never leaves it.

## Updates

Choose a channel in **Settings → Updates and backups**:

- **Nightly:** every change as it's merged.
- **Beta:** each release and pre-release as it's tagged (a new install's).
- **Stable:** releases only.

**Update now** asks the updater on the machine to run `install.sh`, which backs up the database, builds the new version
and restarts it (the app can only ask; it never controls Docker itself). Or, from the `wheresmymoney` folder:

```bash
bash install.sh                     # update to the channel's newest
bash install.sh --channel stable    # move to another channel (going back if it's behind)
bash install.sh --rollback          # back to the version before the last update, with its database
```

`bash start.sh` starts it (and Docker) without updating; `bash install.sh --uninstall` removes the container and
images and leaves `data/` and `.env` alone.

## Backups and restoring

The database is `data/wheresmymoney.db`. Backups in `data/backups/` are made before every update (the newest 5 are
kept, and the newest from each of the last 5 versions), each night at 3am (the last 14), and whenever you choose
**Back up now**. To restore one: stop it (`docker compose stop`), copy the backup over `data/wheresmymoney.db` (and
delete `data/wheresmymoney.db-wal` if there is one), and start it (`bash start.sh`).

Forgotten every password? `docker compose exec wheresmymoney python -m app reset-account` removes the sign-ins (not the
money) and prints a new set-up code.

## API keys

Other apps on your network can read your figures with a key you make in **Settings → Developers**: shown once, stored
only as a hash, with the permissions you choose (accounts, bills, spending, the loan; the retirement plan and sending
check-ins are off unless you turn them on). See [docs/developers.md](docs/developers.md).

```bash
curl -H "Authorization: Bearer wmm_…" http://<this machine>:8080/api/v1/accounts
```

## How it fits together

One service in Docker Compose: a FastAPI app (`app/`, a folder per feature) with the React web app (`web/`) built into
it, and the household's SQLite database in `data/`. It runs as an ordinary user, not root, and its logs are kept to
30 MB. Nothing about your money leaves it: the only requests out are update checks to GitHub (which you can turn off)
and the notifications you set up.

[CONTRIBUTING.md](CONTRIBUTING.md) explains running it locally and the checks before a pull request;
[docs/plan.md](docs/plan.md) is the plan, phase by phase.

## Licence

MIT. See [LICENSE](LICENSE).
