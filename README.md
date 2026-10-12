# EquiNote — EMI & Loan Tracker (Android, Offline-First)

> ✅ **Stable version: v3.2.0** — [download the stable APK](../../releases/tag/v3.2.0).
> The `stable` branch and `stable` tag point to v3.2.0 (spends folders + accurate
> AI + saved SMS per record). They never move except for a deliberate stable release.
> 🧪 **Beta line: v3.1.0-beta.x** — daily spends + SMS scan, published as
> pre-releases so Latest/stable never moves.

Offline-first personal EMI and loan management companion with upcoming payment radar,
smart notification reminders, one-time pay notes, **PDF Extract & Statement export**
(portfolio statement / single-loan dossier, landscape or portrait, with payment ledger),
and CSV bulk upload for payment history.

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

Prerequisites: Node.js 20+, Java 21, Android SDK + Gradle

```bash
npm install
npm run build
npx cap add android      # first time only (generates android/)
npx capacitor-assets generate --android   # brand launcher icon + splash from assets/
npx cap sync
cd android && ./gradlew assembleDebug
# APK: android/app/build/outputs/apk/debug/app-debug.apk
```

## v3.2.0 changelog (STABLE — folders + accurate AI + saved SMS)

- **Sent / Received folders** — Daily Spends now has All · Sent · Received tabs
  with per-month counts, plus Sent-today / Sent-month / Received-month hero
  cards and a net line. Sent amounts show rose, received show green with +.
- **Accurate AI analysis** — few-shot prompt with real Indian SMS shapes,
  temperature 0 + JSON mode, chunked batches, and every AI row cross-checked
  against the SMS text: hallucinated names are replaced by the on-device
  extraction, direction falls back to keyword detection, reasons/categories
  never come back blank (offline fallback included). Hand-edited titles are
  never overwritten by a later AI run.
- **Full SMS saved per record** — imports store the whole original message;
  every spend has the same expandable Original SMS viewer as the import step,
  plus an AI ✓ badge and an edit pencil to fix name/reason/direction/category
  after import. Import rows add per-row category + AI badges.

## v3.1.0 changelog (STABLE — spends + AI reasoning)

- **Daily spends + accounts** — Spends tab with mandatory reasons, categories,
  source accounts and balances; this-month IST scan window; promo/ad SMS excluded.
- **Your-banks SMS filter** — 60+ bank/wallet directory, sender-ID auto-suggest,
  header normalization, per-row account auto-match.
- **AI reads full bank-matched messages** — one batched Groq call per scan
  (free key in Settings) decides paid-to vs received-from, exact name as written,
  and the reason (person → paid to a person, Zomato → bought food). Only
  bank-matched messages, only on your tap; manual adds keep an AI suggest button.
- **Received money tracked** — credits import as Received records with
  badges, month in-totals and per-account in/out; manual adds have Paid/Received toggle.

## v3.1.0-beta.4 changelog (scan you asked for)

- **This month only** — scan covers the 1st → today (e.g. Oct 1 – Oct 11 =
  11 days), with today computed in India time instead of UTC.
- **No ad noise** — promo/offer/recharge-ad SMS are excluded; amount-only
  messages without any transaction signal are skipped too.
- **Bank directory (60+ Indian banks & wallets)** — typing a bank name
  auto-fills its sender IDs (IDFC → IDFCFB/111101, Canara → CANBNK/CNRB,
  Amazon Pay → AMAZON/AMZNPAY, …); sender headers are normalized
  (`JD-HDFCBK-S` → `HDFCBK`) before matching your accounts.

## v3.1.0-beta.3 changelog (SMS format hardening)

- **More bank formats** — `Dr.`/`Cr.` direction markers, payee names after
  `to`/`at`/`towards` (first words, e.g. `to Mr V GOKUL P:` → `Mr V GOKUL`),
  and OTP/verification messages are skipped instead of listed as spends.
- **Reason only where it matters** — bulk 45-day SMS imports no longer block
  on missing reasons (auto-notes the SMS source); manual new spends still
  require one.

## v3.1.0-beta.2 changelog (your-banks SMS filter)

- **SMS scan shows only your banks** — accounts now carry bank name, last-4
  digits and sender IDs (e.g. HDFCBK, SBIINB). The scan hides every non-bank
  message and auto-selects the matching account per spend. With no bank info
  configured, everything still shows with a nudge to add it.

## v3.1.0-beta.1 changelog (daily spends beta)

- **Daily expenses tab (Spends)** — record everyday outflows with a mandatory
  reason, category, date and source account; today/month totals, category
  breakdown, per-account outflow + remaining balance.
- **Accounts** — cash / bank / card / wallet accounts with optional balances;
  every spend debits an account so outflows are tracked per account.
- **Auto SMS read (on-device)** — new `SmsReader` native plugin (`READ_SMS`,
  inbox only, nothing leaves the phone) + "Scan SMS" review screen: debit
  candidates with merchant/account/last-4 detection, per-row reason input
  (required), duplicate skipping, credit SMS ignored.
- **Backup v3** — JSON export/restore now also carries accounts + expenses.

## v3.0.5 changelog (readability + backup)

- **Next-month card rebuilt for readability** — dark slate card, gold border +
  gold pill badge + gold total (white supporting text). Same special-attention
  identity, none of the washed-out bright-background text.
- **JSON backup carries pay notes** — export now includes `reminders` alongside
  loans, payments and settings (backup version 2.0); restore brings them back.
  Older backups without reminders still restore fine.

## v3.0.4 changelog (feedback + attention fixes)

- **No more silent failures** — Enable-notifications, PDF save/share, and every
  file download now report what happened. Blocked permissions point to
  Android Settings → Apps → EquiNote → Notifications; a missing native bridge
  says to reinstall the latest APK.
- **PDF both buttons work on Android** — the print button previously called
  `window.print()`, which does nothing in a WebView. On native it now uses the
  same save-to-Documents + Share-sheet flow as the formatted-PDF button.
- **Next-month total, special attention** — the all-paid outlook card is now a
  gold gradient panel (dark text, pill badge, inset total chip), visually
  distinct from the emerald monthly cards.

## v3.0.3 changelog (CSV tolerance)

- **Loans CSV accepts real-world sheets** — Category accepts display names
  ("Peer / Family", "Personal Loan", "Gadgets & Tech", …) as well as keys,
  and a blank Principal is derived from EMI + rate + tenure, so statements
  like the CRED export import directly.
- **Import errors explain themselves** — skipped rows now report the reason
  per row (e.g. which row misses Title/Lender/Tenure) instead of a bare
  "check the format" message.

## v3.0.2 changelog (input + import fix)

- **Keyboard fix (the "text area" bug)** — the generated native shell had no
  `windowSoftInputMode`, so the keyboard covered bottom-sheet forms and typing
  felt broken. `android/` is now committed with
  `android:windowSoftInputMode="adjustResize"`, plus CSS that never blocks text
  selection and removes tap delay on inputs/buttons.
- **Bulk import fallback** — Loans and Ledger import cards keep the file picker
  (wider `accept` types) and add a "Paste CSV text instead" box using the same
  parsers, so bulk import works even when the device file picker won't open.

## v3.0.1 changelog (download fix)

- **Android downloads fixed** — JSON backup export, payment CSV export/example,
  and loans CSV example now save via the native Documents + Share sheet
  (`downloadTextFile`) instead of WebView anchor downloads, which never fire on
  Android. Same files download normally on web.
- **Loans bulk upload (Loans tab)** — import full loan portfolios from CSV with
  in-app format guide + downloadable `EquiNote_Loans_Example.csv`
  (`Title, Lender, Category, Principal, Interest Rate, Tenure Months,
  Paid Months, Monthly EMI (blank = auto), Due Day, Start Date,
  Account Number, Auto-Debit, Notes, Paid This Month (yes/no)`).

## v3.0.0 changelog

- **Simulator removed** — prepayment simulator UI, engine (`simulatePrepayment`),
  tab, and entry points deleted; Radar / Loans / Reminders / Ledger / Settings remain.
- **Pay Reminders (new tab)** — one-time notes for credit-card bills and friend/family
  borrows that are NOT EMIs: title, type, optional amount, pay-by date, person, note.
  Mark done per month; pending notes count toward the next-month outlook.
- **CSV bulk upload (Ledger)** — import payment history from CSV with an in-app
  example format + downloadable `EquiNote_Payments_Example.csv`
  (`Loan Title, Amount, Date, Month-Year, Installment #, Payment Mode, Reference ID, Notes`);
  rows match existing loans by title, loan progress aligns to the highest installment.
- **Notifications fixed** — `@capacitor/local-notifications`: first-run system
  permission prompt, native scheduling of overdue / due-today / due-soon dues at the
  user's reminder time, in-app "Enable" banner when permission is missing, live
  permission status in the Notifications modal (web Notification API kept as fallback).
- **Smarter Add-Loan** — adding a loan after this month's due day asks whether this
  month is already paid, and whether the entered paid-month count includes it;
  "No, add +1" bumps the count, otherwise the month is just marked paid (no double count).
- **Next-month outlook (Radar)** — when everything is paid this month, a card shows
  the next due date and next month's total (EMIs + pending notes); paid rows show
  "Next: date · amount".
- **Clean start** — bundled demo loans/payments removed; v1/v2 demo entries
  (`loan-1..4`, `pay-1..3`) are migrated away once on existing devices. Fresh
  installs start empty.

## v2.0.0 changelog

- **PDF Extract & Statement** (`PdfExportModal` + `pdfGenerator` with `jspdf`):
  full-portfolio EMI statement or single-loan dossier, landscape/portrait,
  optional closed loans + payment ledger, live preview + native print.
  On Android the PDF is saved to Documents and opened via the Share sheet
  (`@capacitor/filesystem` + `@capacitor/share`); on web it downloads normally.
- **Notch / status-bar fix**: `@capacitor/status-bar` with `overlaysWebView: false`
  + dark `#0F172A` bar, `app-header-safe` sticky header and
  `env(safe-area-inset-top)` padding so the top bar never sits under the notch
  and system notifications stay visible.
- **New app icon**: emerald ₹ emblem + “EMI TRACKER” pill + repayment progress,
  fresh PWA icons (`public/`) and native launcher icons generated on CI from
  `assets/icon.png` / `assets/splash.png` via `@capacitor/assets`.

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
src/                 # React app (Dashboard, Loans, Reminders, Ledger, Settings, PdfExportModal, …)
src/utils/capacitorPdf.ts  # native Android PDF save (Documents + Share sheet)
public/              # PWA icons (v2: emerald ₹ emblem)
assets/              # icon.png + splash.png → native launcher via capacitor-assets
capacitor.config.json  # Capacitor appId/appName/webDir + StatusBar (no overlay)
android/             # generated on CI via `npx cap add android` (not committed by default)
.github/workflows/  # CI: web build + icons + assembleDebug + Release
```

Original prototype credit: AI Studio app `34c78de2-04a2-4303-b632-d75e4098fbdc` (web/PWA source adapted for offline Android).
