# Git history scripts

Rebuild a readable timeline from **real project files** (not a synthetic log folder).

```powershell
.\scripts\replay-history.ps1
git push --force-with-lease origin main
```

- Replays `app/`, `docs/`, config, and assets in build order
- Large files are split across several incremental commits
- Messages live in `scripts/commit-messages.txt`
- Dates spread **2026-04-01** through **2026-06-20**

Respread dates only:

```powershell
.\scripts\rewrite-commit-dates.ps1
```
