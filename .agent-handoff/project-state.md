# Project state (2026-10-10)
- Repo: https://github.com/cjn119-ui/flagler-fishing-report ; canonical = origin/main c331db7
- Working tree: /Users/christiannunez/flagler-fishing-ios (git worktree, branch feature/capacitor-ios). Stale clones NOT used: ~/flagler-fishing-report (v5-wip-glass-supabase), ~/flagler-fishing-report-1 (main, behind 12), staging c101.
- App: static PWA in site/ (root app = main.js + shared/*.js; V5 prototype at site/v5/proto/). No npm deps, no build step. Deployed by .github/workflows/pages.yml to https://cjn119-ui.github.io/flagler-fishing-report/ ; site/api/*.json is generated at deploy (gitignored) and served with CORS *.
- Backend = GitHub Actions data job + NWS/NOAA/NDBC public feeds (browser fetches NOAA/NWS directly). No Oracle/Supabase in live path.
- Toolchain: Xcode 27.0, node 26.8.1 (CI uses 22), npm 11.19.0, codex-cli 0.160.0, claude 2.1.291.
- BLOCKER: no iOS simulator runtime installed (only unavailable iOS-26-5). Download needs owner approval.
- Rules: AGENTS.md. Root / and /v1-/v3 must not change behaviour. No Sol. Codex = gpt-6-luna.
