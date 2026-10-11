# EquiNote — EMI & Loan Tracker (Android, Offline-First)

Offline-first personal EMI and loan management companion with upcoming payment radar,
prepayment simulator, and smart notification reminders.

This repo wraps the EquiNote web app (React + Vite + Tailwind + PWA) in
[Capacitor](https://capacitorjs.com/) so it runs as a **fully local Android app**.
All data stays on-device via `localStorage` — no server, no account, works offline.

- App ID: `com.equinote.tracker`
- Web assets: `dist/` (built with `vite build`, `base: './'`)
- Native shell: Capacitor Android (`android/` generated on CI)

## Download (easy)

Go to [**Releases**](../../releases) and download the latest APK:

- `EquiNote-vX.X.X-debug.apk` — installable debug build for local use
  (Android may ask to “Allow install from unknown sources” — this is a local-only build, no data leaves the device).

No secrets / API keys needed. The Android build is 100% offline.

## Run web version locally

Prerequisites: Node.js 20+

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # outputs dist/
npm run preview
```

## Build Android locally

Prerequisites: Node.js 20+, Java 17, Android SDK + Gradle

```bash
npm install
npm run build
npx cap add android      # first time only (generates android/)
npx cap sync
cd android && ./gradlew assembleDebug
# APK: android/app/build/outputs/apk/debug/app-debug.apk
```

## How releases are made

`.github/workflows/android-build.yml`:

- On every push to `main` / PR: builds web + debug APK, uploads as workflow artifact.
- On version tags `v*` (e.g. `v1.0.0`): builds APK and publishes a GitHub Release
  with `EquiNote-<tag>-debug.apk` attached for one-click download.

To ship a new version:

```bash
npm version patch   # or minor/major
git push origin main --tags
# CI publishes the Release automatically (uses built-in GITHUB_TOKEN, no extra secrets)
```

## Secrets / privacy

- Public repo contains **no secrets**: only `.env.example` with placeholder values.
- `.gitignore` excludes `.env*` (except `.env.example`), keystores, and local Android build output.
- No `GEMINI_API_KEY` / `APP_URL` needed for Android — the app never calls the network for data.

## Project structure

```
index.html
src/                 # React app (Dashboard, Loans, Simulator, Ledger, Settings, …)
public/              # PWA icons
capacitor.config.ts  # Capacitor appId/appName/webDir
android/             # generated on CI via `npx cap add android` (not committed by default)
.github/workflows/  # CI: web build + assembleDebug + Release
```

Original prototype credit: AI Studio app `34c78de2-04a2-4303-b632-d75e4098fbdc` (web/PWA source adapted for offline Android).
