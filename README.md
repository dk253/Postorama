# Postorama

A macOS menubar app that automatically sends physical photo postcards to the people you love, on a schedule, using your own Photos library and the [Lob](https://lob.com) API.

Postorama lives in your menu bar. It watches your Photos.app albums, picks the oldest unsent photo for each recipient, pairs it with a rotating message from your personal library, looks up the mailing address from Contacts.app, and mails a real postcard — hands-free.

---

## How it works

1. You create a Photos.app album named `Postorama: <Name>` for each person you want to send postcards to.
2. You add photos to that album over time.
3. Postorama checks every 5 minutes. When a recipient is due (based on their send frequency), it picks the oldest unsent photo, selects a message from your library, looks up the address in Contacts.app, and sends a postcard via Lob.
4. The sent photo is moved to a `Postorama: <Name> - Sent` album in Photos.app so you always know what was sent.
5. Delivery tracking, proof images, and full history are stored locally in a SQLite database.

---

## Requirements

- **macOS 13 Ventura or later** (uses `safeStorage` for keychain-backed API key encryption)
- **Node.js 20+** — install via [nvm](https://github.com/nvm-sh/nvm) or [Homebrew](https://brew.sh): `brew install node`
- **Yarn 1 (classic)** — `npm install -g yarn`
- **Swift** — bundled with Xcode Command Line Tools: `xcode-select --install`
- **A [Lob](https://lob.com) account** with a test API key (free) and optionally a live API key (paid, for real mail)
- **Photos.app** albums set up as described below
- **Contacts.app** with mailing addresses for your recipients

---

## Setup: Photos.app

For each person you want to send postcards to, create an album in Photos.app named exactly:

```
Postorama: First Last
```

For example:
- `Postorama: Hannah Kearney`
- `Postorama: John Smith`

Add photos to these albums. Postorama sends the oldest photo (by capture date) that hasn't been sent yet. There is no minimum — but the app will warn you when a recipient's album is running low.

Postorama will automatically create a companion album named `Postorama: First Last - Sent` to track what has been mailed.

---

## Setup: Contacts.app

Each recipient must have an entry in Contacts.app with a mailing address. The name in the album (`Postorama: Hannah Kearney`) must match the contact name closely enough for macOS's contact search to find it.

Make sure the **City**, **State**, and **ZIP** fields are filled in separately in the address card — not typed as a single block in the street field. Postorama handles the single-block case as a fallback, but Contacts.app native fields are more reliable.

---

## Building from source

### 1. Clone the repository

```bash
git clone https://github.com/davidkearney/postorama.git
cd postorama
```

### 2. Install dependencies

```bash
yarn
```

This also runs `electron-builder install-app-deps` automatically via the `postinstall` script.

### 3. Rebuild native modules

`better-sqlite3` and `sharp` are native Node.js modules that must be compiled against the Electron runtime — not the system Node.js. Run this after every `yarn` and after upgrading Electron:

```bash
yarn rebuild
```

This uses `@electron/rebuild` to recompile the modules for the correct Electron ABI.

### 4. Grant permissions (first run)

macOS requires explicit permission for:
- **Contacts** — Postorama asks via a system dialog on first use.
- **Photos** — If prompted, allow access in **System Settings → Privacy & Security → Photos**.
- **Automation (Apple Events)** — Required for JXA to talk to Photos.app. Grant access in **System Settings → Privacy & Security → Automation**.

If Photos or Automation access was previously denied, open System Settings and manually grant it to Postorama (or to `swift` and `electron` in dev mode).

### 5. Run in development mode

```bash
yarn dev
```

This concurrently:
- Compiles the main process TypeScript with `tsc --watch`
- Bundles the renderer with `esbuild --watch`
- Compiles Tailwind CSS with `--watch`
- Launches Electron once all three outputs exist

Click the icon that appears in your menu bar to open the app. Changes to renderer files hot-reload automatically; changes to main process files require restarting Electron (Cmd+R won't work — quit and re-run `yarn dev`).

---

## Configuration (in-app)

Open the app and click the gear icon (or press the Send button on any recipient) to access Settings. Everything is stored locally — nothing is ever sent to any server except Lob.

### Account

**Test mode / Live mode toggle** — Start in Test mode. Test API key calls go to Lob's sandbox; no real postcards are printed or mailed.

**Test API key** — Your Lob test key (starts with `test_`). Get it from [dashboard.lob.com/settings/api-keys](https://dashboard.lob.com/settings/api-keys). Stored encrypted in your macOS keychain via `safeStorage`.

**Live API key** — Your Lob live key (starts with `live_`). Only used when Live mode is active. Also keychain-encrypted.

**Test connection** — Verifies the active API key reaches Lob's API.

### Return Address

Your name and mailing address. This appears as the sender on every postcard. Required before sending.

Your first name is also used as the default signature line ("Love, [FirstName]") unless you override it per-recipient.

### Defaults

**Postcard size** — `4x6` (standard) or `6x9` (large). Can be overridden per recipient.

**Low photo threshold** — How many unsent photos trigger a "running low" warning. Default: 3.

### Scheduler

**Pause all sends** — Emergency stop. No postcards are sent while this is on.

**Send window** — Hours of the day during which the scheduler is allowed to fire (24-hour format). Default: 9–17.

### App

**Launch at login** — Start Postorama automatically when you log in.

---

## Per-recipient settings

Click any recipient card to open the detail panel, where you can configure:

- **Greeting** — Overrides the default `Dear [FirstName],` at the top of the message.
- **Signature** — Overrides the default `Love, [YourFirstName]` at the bottom.
- **Mailing address** — Shows the address that will be used. If the contact has multiple addresses, a dropdown lets you choose which label to use (home, work, etc.).
- **Frequency** — How many days between postcards (default: 30).
- **Postcard size** — Override the global default for this recipient.
- **Notes** — Private notes (never sent, just for your reference).

Click **Save Settings** to persist changes.

You can also click any photo in the grid and use **Send This Next** to queue a specific photo for the next send.

---

## Message library

Postorama rotates through a personal message library so each postcard has a different note. Open the library from **Settings → Messages → Open Message Library**.

Each message has:
- **Text** — The body of the postcard message.
- **Type** — A category (e.g., `reflection`, `memory`, `quote`). The scheduler avoids sending the same type consecutively.
- **Tags** — Optional metadata.

Messages are stored as JSON at `~/Library/Application Support/Postorama/messages.json`. You can export and import from the library window.

A small set of starter messages is seeded on first run.

---

## Database

All send history is stored in a SQLite database at:

```
~/Library/Application Support/Postorama/postorama.db
```

You can open this folder from **Settings → Data → Open Data Folder**.

### Export history

**Settings → Data → Export History CSV** writes a CSV to your Downloads folder with every send: recipient, photo, message, Lob postcard ID, proof URL, expected delivery date, and whether it was a test or live send.

### Clear test data

**Settings → Data → Clear Test Data** deletes all records where `sandbox = 1` (sent while in Test mode). This is a two-click confirmation action.

---

## Packaging a distributable app

```bash
yarn package
```

This runs `yarn build` followed by `electron-builder`, which produces a `.dmg` in `out/`. The build creates universal binaries (x64 + arm64) by default per `electron-builder.yml`.

**Note on code signing:** The app is not signed or notarized in this configuration. Users on macOS will need to right-click → Open the first time, or go to System Settings → Privacy & Security and allow it after seeing the Gatekeeper prompt. If you want to sign and notarize for distribution, add your Apple Developer credentials to `electron-builder.yml` (see [Electron Builder docs](https://www.electron.build/code-signing)).

---

## Project structure

```
postorama/
├── src/
│   ├── main/                   # Electron main process (Node.js / CommonJS)
│   │   ├── index.ts            # App entry: menubar, windows, lifecycle
│   │   ├── runner.ts           # Core send workflow (photos → Lob → DB)
│   │   ├── scheduler.ts        # 5-minute tick, send-window checks
│   │   ├── settings.ts         # electron-store + safeStorage API key
│   │   ├── messages.ts         # Message library load/save
│   │   ├── notifications.ts    # macOS notification wrappers
│   │   ├── db/
│   │   │   ├── index.ts        # SQLite connection (WAL mode)
│   │   │   ├── migrations.ts   # Schema migrations v1–v7
│   │   │   └── queries.ts      # All DB read/write functions
│   │   ├── photos/
│   │   │   ├── adapter.ts      # JXA interface to Photos.app
│   │   │   └── discovery.ts    # Album parsing → recipient list
│   │   ├── contacts/
│   │   │   └── adapter.ts      # Swift CNContactStore wrapper
│   │   ├── lob/
│   │   │   └── client.ts       # Lob REST API client (multipart/form-data)
│   │   └── ipc/
│   │       └── handlers.ts     # All ipcMain.handle registrations
│   ├── preload/
│   │   └── index.ts            # contextBridge → window.api
│   ├── renderer/               # React app (browser / ESNext)
│   │   ├── index.html
│   │   ├── index.tsx           # React root + QueryClientProvider
│   │   ├── App.tsx             # Tab routing + overlay panels
│   │   ├── hooks/
│   │   │   └── useApi.ts       # React Query hooks wrapping window.api
│   │   ├── styles/
│   │   │   └── globals.css     # Tailwind + CSS custom properties
│   │   └── components/
│   │       ├── Dashboard.tsx
│   │       ├── RecipientCard.tsx
│   │       ├── RecipientDetail.tsx
│   │       ├── PhotoBrowser.tsx
│   │       ├── HistoryPanel.tsx
│   │       ├── SettingsPanel.tsx
│   │       ├── MessageLibraryWindow.tsx
│   │       └── shared/         # Toast, Modal, Spinner, EmptyState
│   └── shared/
│       └── ipc-types.ts        # Typed IPC channels + shared interfaces
├── scripts/
│   └── contact-lookup.swift    # Swift CNContactStore lookup (bundled in app)
├── assets/                     # App icon + menubar template images
├── electron-builder.yml
├── entitlements.mac.plist
├── tailwind.config.js
├── tsconfig.main.json
├── tsconfig.renderer.json
└── MENUBAR_APP_PROMPT.md       # Original design specification
```

---

## Tech stack

| Layer | Technology |
|---|---|
| Shell | [Electron](https://electronjs.org) + [menubar](https://github.com/maxogden/menubar) |
| UI | React 18, TypeScript, Tailwind CSS, Headless UI |
| Data fetching | TanStack React Query v5 |
| Database | better-sqlite3 (WAL mode) |
| Settings | electron-store v8 + Electron safeStorage |
| Image processing | sharp |
| Photos integration | JXA (JavaScript for Automation) |
| Contacts integration | Swift + CNContactStore |
| Mail API | [Lob](https://lob.com) |
| Build | esbuild (renderer), tsc (main), electron-builder (packaging) |

---

## Troubleshooting

**Recipient shows a red dot / "not found in Contacts"**
The album name must match the contact name closely. macOS contact search is fuzzy but requires the full name. Check for typos or middle names.

**Address city is missing / Lob rejects with 422**
Open the contact in Contacts.app, edit the address, and make sure City, State, and ZIP are in their own fields — not typed as a single text block in the street line.

**Photos access denied**
System Settings → Privacy & Security → Photos → enable Postorama (or `Electron` in dev mode).

**Apple Events / Automation denied**
System Settings → Privacy & Security → Automation → enable Postorama to control Photos.app.

**`yarn rebuild` fails**
Make sure Xcode Command Line Tools are installed: `xcode-select --install`. Then retry.

**App launches but the menubar icon doesn't appear**
This can happen if the icon file is missing or the wrong size. The menubar icon must be an 18×18 px PNG with a transparent background and black artwork (template image). Check `assets/menubar-idle.png`.

---

## License

MIT — see [LICENSE](LICENSE). You are free to use, modify, and distribute this software for any purpose, including commercially, as long as you include the original copyright notice.

---

## Contributing

Bug reports and pull requests are welcome. For significant changes, open an issue first to discuss what you'd like to change.
