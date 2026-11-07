# Developers: API keys

Other apps on your home network can read your household's figures with an **API key**. The first one is the Home Hub
(a family dashboard on the fridge). You choose what each key may do: every permission only reads, except one that lets
an app send a rough balance check-in. A key never opens the app itself.

## Making a key

Open **Settings, then Developers** (you need to be signed in). Name the key, switch on what it may do, and choose
**Make a key**. The whole key (`wmm_…`) is shown once. Only a SHA-256 hash is kept, with the key's first characters to
tell keys apart, its name, when it was made and when it was last used. Removing a key stops it working at once.

| Permission | What it lets the key do |
| --- | --- |
| `accounts:read` | Each account's balance, role and target, the offsetting total, savings goals and the latest check-in (`accounts`). |
| `bills:read` | Every bill, when it's next due, the next 30 days and the bills buffer against its target (`bills`). |
| `spending:read` | This spending month: what's left, safe to spend a day, the pace and each category against its budget (`spending`). |
| `loan:read` | The loan's balance, rate, coverage, interest avoided and when it's fully offset (`loan`). |
| `retirement:read` | The retirement plan (`retirement`; empty until the retirement phase ships). Off by default. |
| `checkin:write` | Send a rough balance check-in (`checkin`). It never sets an exact balance or adds an adjustment. Off by default. |

Any valid key can call `ping`.

## Using a key

Send it as `Authorization: Bearer wmm_…`. Errors are `{"detail": "…"}`: **401** for no key, a wrong one or a removed
one, **403** for a key without the permission for that route.

```bash
curl -H "Authorization: Bearer wmm_…" http://<this machine>:8080/api/v1/accounts
```

The key replaces sign-in for these routes only. A key never opens the app's own `/api` routes (which still need a
signed-in browser), and sign-in being turned off (`AUTH=false`) doesn't open `/api/v1`: it always wants a key.

Money is in **cents** (whole numbers), signed where it moves; dates are `YYYY-MM-DD`.

## Routes

All under `/api/v1`:

- `GET ping`: the app, the household's name, the key's name and permissions, and the time.
- `GET accounts`: `{accounts, offsetting, total, last_checkin, goals}`. Each account has `id`, `name`, `role`
  (`offset`, `bills`, `spending`, `savings`, `track`), `balance`, `offsets_loan`, `change_30d`, `known` (when its
  balance was last known, and whether exactly) and `target` (for a bills buffer: `months`, `per_month`, `amount` and
  `held`, the months it holds).
- `GET bills`: `{bills, per_year, per_month, next30, by_month, account}`.
- `GET spending`: `{month}`: `start`, `end`, `day`, `days`, `remaining`, `allowance`, `left`, `spent`,
  `safe_per_day`, `vs_pace`, `projected`, `daily` and `categories`.
- `GET loan`: `{loan}`: the loan, `offsetting`, `coverage`, `interest_per_day`, `fully_offset` (YYYY-MM at the recent
  pace) and `fully_offset_planned` (at the rules' planned saving), and `scenarios`.
- `GET retirement`: `{plan}` (null for now).
- `GET checkin` (`checkin:write`): what a check-in expects of each account now.
- `POST checkin` (`checkin:write`): `{"balances": {"1": 10005000, "2": 871900}}`, account id to cents. Saved as a rough
  check-in; the answer says how each account compared with what the rules expected, and any flags.

The keys themselves are made and removed through `GET /api/keys`, `POST /api/keys` (`{"name": "Home Hub", "scopes":
["accounts:read"]}`; leave `scopes` out for the defaults) and `DELETE /api/keys/{id}`, which need a signed-in browser.

Changes are made in `app/features/keys/`; the tests are in `tests/test_auth_keys.py`.
