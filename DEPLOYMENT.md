Deployment checklist

- Rotate leaked storage keys immediately after cleanup.
- Set application settings / environment variables:
  - `KOGB_STORAGE_CONNECTION_STRING` (required)
  - `GET_PRICES_TTL_SECONDS` (optional, default 30)
  - `GET_HISTORY_TTL_SECONDS` (optional, default 180)
  - `DISABLE_HISTORY_CACHE` (optional, `1` to disable in-memory history cache)
- For Azure Functions, configure the above in the Function App Configuration (not in source).
- Restart the Functions app after changing settings.
- Instruct team to reclone the repository after history rewrite:
  - `git clone <repo>`
  - or existing users: `git fetch origin && git reset --hard origin/main`
- Add `local.settings.json` to `.gitignore` for local development.

Quick local test:

```powershell
# start static server
npx http-server -p 8080 -c-1
# start functions with DISABLE_HISTORY_CACHE temporarily
$env:DISABLE_HISTORY_CACHE='1'; func start --script-root api --port 7071
```
