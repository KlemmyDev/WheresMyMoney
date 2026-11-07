# Security

WheresMyMoney holds a household's balances, transactions and plans, so security problems matter even though it runs on
your own network.

## Reporting a problem

Please don't open a public issue. Use GitHub's **Report a vulnerability** (the repository's Security tab), with what
you found, how to reproduce it, and the version (Settings → Updates and backups).

## In scope

- **Getting past sign-in** to the app or its API, or using an API key beyond the permissions it was given.
- **Reading or changing the household's money** (balances, transactions, rules) without signing in.
- **Running anything on the server**, or reaching its files, through the app, `install.sh` or `updater.sh`.
- A page elsewhere getting a signed-in browser to change something (cross-site request forgery).

Not in scope: the app being served over plain HTTP on your own network (it's documented, and it isn't meant to face the
internet: use a VPN or a reverse proxy with HTTPS to reach it from outside).

## What leaves the server

Nothing about your money. The app asks GitHub whether there's a newer version (Settings → Updates turns it off), and
sends the notifications you set up (web push, ntfy, a webhook). Statement files are read on the server and kept there.
