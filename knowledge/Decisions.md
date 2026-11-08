# Decisions

## 2026-11-07
- Name: **Connected**, chosen by the project owner.
- Platform: mobile-friendly web app, NYC sample data, chosen by the owner.
- GitHub owner: `samavedamravi3-jpg`; repository `Connected`; private by default.
- New dedicated Obsidian vault inside the repository (`knowledge/`).
- Claude Code supports development; Claude API supports editable introductions.
- No precise live tracking. Discovery requires explicit opt-in, approximate location, and a one-hour expiry.
- Show real reasons for a match, not invented percentages or fabricated referral paths.
- Demo content is always labeled; live mode starts empty until real members participate.
- Hosted app is private by default. Team/public access is a separate explicit choice.
- Map tiles are third-party requests, so those providers can observe the map viewport. No app GPS is sent to Claude.

## 2026-11-08
- **Mobile app = installable web app (PWA)**, chosen by the owner over an App Store wrapper: no store accounts or Xcode, ships with the site, works on iPhone and Android. A Capacitor wrapper stays possible later. See [[Mobile App]].
- The service worker never caches API responses, sign-in routes, HTML, tiles, photos or other sites' content; only static files and a generic offline page.
- Phones open straight to search, place, map and people; the marketing hero is desktop-only. One place menu replaces two duplicate city pickers.
- The approach coach is optional and collapsed in the person sheet so the main action (introduction and request) stays near the top.
- The default AI model stays `claude-sonnet-5-5` (existing configured default); replies are plain text, clipped at a sentence.
- Codex ran out of credits; the owner directed Claude to finish the UI and publish through a feature branch and pull request (`claude/mobile-app`), not directly to `main`.

