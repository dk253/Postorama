# Postorama — macOS Menubar App

## Overview

Build **Postorama** — a new macOS menubar app that replicates and extends the functionality of an existing CLI tool called "Posty." Posty automatically sends physical photo postcards via the Lob API. Postorama replaces the CLI workflow with a polished native-feeling GUI using **Electron + React + TypeScript**. The app lives in the macOS menubar, shows a popover panel on click, and handles all scheduling, sending, and configuration through a beautiful interface.

The existing Posty CLI will continue to exist as a separate project. Postorama should point at the same SQLite database file (`~/Library/Application Support/Postorama/postorama.db`) and be fully self-contained.

---

## Tech Stack

- **Electron** with the `menubar` npm package (handles menubar icon + popover window)
- **React 18** with TypeScript for the frontend UI
- **Tailwind CSS** for styling — aim for a native macOS aesthetic (use `@headlessui/react` for accessible dropdowns/dialogs)
- **better-sqlite3** for the SQLite database (keep the existing schema)
- **electron-store** for persistent non-sensitive app settings (return address, scheduler config, defaults)
- **Electron `safeStorage`** for encrypting the Lob API key at rest — never store it in plain JSON or electron-store
- **sharp** for image processing
- **React Query** (`@tanstack/react-query`) for data fetching between renderer and main process
- **electron IPC** with typed channels for all renderer ↔ main communication
- **tsx / esbuild / tailwind --watch** for development; **electron-builder** for packaging
- **yarn** (classic v1) as the package manager (`"packageManager": "yarn@1.22.22"`)
- Dev entry point: `dist/renderer/index.html` (copied from `src/renderer/` by `dev:setup`); always compiled to `dist/renderer/`
- **ESLint 9** (flat config, `eslint.config.js`) with `@typescript-eslint`, `eslint-plugin-react`, `eslint-plugin-react-hooks`
- **Prettier 3** (`.prettierrc.json`): single quotes, trailing commas, 100 char print width
- All backend logic (Photos JXA, Contacts Swift, Lob client, DB queries, scheduling) is authored directly in Postorama — do not import from the Posty CLI project

---

## Existing Functionality to Preserve Exactly

### Recipient Discovery (from Photos.app)
Albums named `"Postorama: <Name>"` are auto-discovered via JXA. Examples:
- `"Postorama: Hannah Montana"` → id: `hannah_kearney`
- Sent album auto-named `<album> - Sent`
- Recipient ID is a stable slug used as the SQLite primary key
- Greeting is set per-recipient in the app UI (`recipient_settings.greeting_override`), not encoded in the album name

### Core Send Workflow
1. List photos in recipient's Photos.app album via JXA
2. Get sent photo IDs from SQLite (`send_history` table is authoritative)
3. Pick oldest unsent photo (by `captureDate`)
4. Pick a message from the message library (rotation: avoid repeating used messages; avoid same `type` consecutively)
5. Look up mailing address from Contacts.app via Swift CNContactStore
6. Export photo from Photos.app to a temp directory
7. HEIC → JPEG via `sips` if needed, then resize with Sharp (4×6: 1875×1275px; 6×9: 2775×1875px; JPEG q88; portrait auto-rotated 90° CW; center-crop)
8. POST to Lob API as `multipart/form-data` (bypasses Lob's 10K inline HTML limit)
9. Call `recordSend()` in SQLite **after** Lob success, **before** Photos changes
10. Add photo to sent album in Photos.app; set caption `"Sent to [Name] on [Date]"`
11. Send macOS notification

### Lob API Client
- Auth: Basic auth (API key as username, blank password)
- Endpoint: `POST https://api.lob.com/v1/postcards`
- Front HTML: `<img>` tag with base64 data URI embedded, sized to postcard bleed dimensions
- Back HTML: flex layout — message text (left) | `{{addressBlock}}` (right, 3" wide)
- Merge variables: `{{message}}`, `{{greeting}}`
- `use_type: "operational"`
- Response includes `url` (proof PDF, valid 30 days) and `expected_delivery_date`

### SQLite Schema
```sql
-- send_history
id INTEGER PRIMARY KEY AUTOINCREMENT,
recipient_id TEXT NOT NULL,
photo_asset_id TEXT NOT NULL,
photo_filename_or_uuid TEXT NOT NULL,
album_name TEXT NOT NULL,
message_id_or_hash TEXT NOT NULL,
greeting_used TEXT NOT NULL,
sent_at TEXT NOT NULL,               -- ISO 8601
lob_postcard_id TEXT NOT NULL,
status TEXT NOT NULL,                -- 'sent' | 'failed'
error_message TEXT,
proof_url TEXT,                      -- Lob proof PDF URL (valid 30 days)
expected_delivery_date TEXT,         -- ISO 8601 date from Lob response
UNIQUE(recipient_id, photo_asset_id) WHERE status = 'sent'

-- message_usage
id, recipient_id, message_id_or_hash, message_type, used_at

-- schema_version
version INTEGER
```

### Message Library Format
File path: `~/Library/Application Support/Postorama/messages.json` — copy bundled defaults on first run if file doesn't exist.

Format (`messages.json`)
```json
[
  "Simple string message",
  { "id": "haiku_001", "type": "haiku", "text": ["Line one", "Line two", "Line three"] },
  { "id": "quote_twain", "type": "quote", "text": "\"...\" — Mark Twain" },
  { "id": "limerick_001", "type": "limerick", "text": ["...", "...", "...", "...", "..."] }
]
```
Text can be a string or array (joined with `\n`). Message ID defaults to SHA256(text).slice(0,16) if omitted.

---

## New Features to Add

### Per-Recipient Send Frequency
Each recipient gets their own send frequency setting stored in the app's SQLite DB:
- `weekly` (default) — send once every 7 days
- `biweekly` — every 14 days
- `monthly` — every 30 days
- `custom` — user specifies a number of days (e.g., every 10 days)

The scheduler respects each recipient's individual frequency. A recipient is "due" when `NOW() - last_sent_at >= frequency_days`. If they have never been sent to, they are due immediately.

Add a `recipient_settings` table:
```sql
recipient_id TEXT PRIMARY KEY,
frequency_days INTEGER NOT NULL DEFAULT 7,
active INTEGER NOT NULL DEFAULT 1,        -- 0 = paused
greeting_override TEXT,                   -- if set, overrides album-parsed greeting
next_photo_id TEXT,                       -- if set, send this photo next (cleared after use)
postcard_size TEXT NOT NULL DEFAULT '4x6', -- '4x6' | '6x9' (overrides global default)
notes TEXT                                -- optional free-text note
```

### Global Send Schedule
A global scheduler (using `setInterval`) checks every 5 minutes whether any recipients are due. Configurable send window (e.g., only send between 8am–10am local time). If a recipient is due and it's within the send window, trigger their send automatically in the background. Show a macOS notification on success or failure.

### Greeting & Signature Per Recipient (Editable in UI)
- **Greeting** (top of message): defaults to `"Dear <firstName>,"` derived from the recipient's full name. Overridable per recipient via `recipient_settings.greeting_override`.
- **Signature** (bottom of message): defaults to `"Love, <senderFirstName>"` derived from the first name in the return address. Overridable per recipient via `recipient_settings.signature_override`.
- Both are stored in `recipient_settings` and editable side-by-side in the recipient detail view.
- Album names do not encode greeting — just use `"Postorama: <Name>"`.

### Force Send (Immediate, Override Frequency & Sent History)
Any recipient can be "force sent" from the UI at any time:
- Sends immediately regardless of frequency
- Optionally ignores sent history (`force` flag) so it picks from all photos, including already-sent ones
- After a force send, the frequency timer resets from that moment

### Specific Photo Selection
Within each recipient's detail view, show a photo browser of all photos in their album. Photos that have already been sent are shown with a faint overlay and a "Sent" badge. The user can click any photo to "queue it next" — it becomes the next photo sent to that recipient regardless of date ordering. Store this override in `recipient_settings.next_photo_id`. Clear it after it's used.

### Live Postcard Preview
Before sending (or after), render a visual preview of what the postcard looks like:
- Front: the selected photo, cropped to postcard aspect ratio
- Back: the message text + greeting rendered in the Georgia font layout
- Show this in the "Send Now" confirmation sheet and in the send history

### Send History with Proof Links
Each entry in the send history shows:
- Recipient name
- Photo thumbnail (low-res preview)
- Message snippet
- Sent date + expected delivery date
- A "View Proof PDF" button linking to the Lob proof URL

### Lob API Key Management in UI
- Settings panel has **two separate password fields**: Test API key (`test_…`) and Live API key (`live_…`)
- A **Test/Live mode toggle switch** in the Account section determines which key is used for sends
- `getApiKey()` in settings.ts returns the active key based on `useSandbox`
- Both keys stored encrypted via `safeStorage` as `encryptedTestApiKey` / `encryptedLiveApiKey`; legacy `encryptedApiKey` auto-migrated to test slot on first read
- "Test Connection" button that hits `GET https://api.lob.com/v1/postcards?limit=1` to verify the active key works
- Warn prominently if sandbox mode is on: "⚠ Sandbox mode — no real postcards will be sent"
- **Clear Test Data** button (two-click confirm) deletes all `send_history` rows with `sandbox = 1` and resets `message_usage`
- Each `send_history` row has a `sandbox INTEGER NOT NULL DEFAULT 0` column (schema v6) set from `settings.useSandbox` at send time

### Notifications & Alerts
- macOS notification on every send (success + failure)
- In-app badge/indicator on menubar icon when there's an error or a recipient is low on photos
- In-app alert panel listing all current warnings (low photo counts, stale addresses, paused recipients)

---

## UI Design Direction

### Overall Aesthetic
Aim for a macOS-native feel similar to apps like **Fantastical**, **Lungo**, or **Stats**. Use:
- SF Symbols-style icons (or Heroicons as a web equivalent)
- Subtle frosted-glass appearance where appropriate (blur backdrop on the popover)
- macOS system colors adapted to CSS: blue for actions, red for destructive, gray hierarchy for text
- Clean card-based layout; generous whitespace
- Smooth transitions (100–200ms ease-out) for panel changes
- Respect `prefers-color-scheme` — full dark mode support

### Menubar Icon
- A small postcard/stamp icon (design a minimal SVG)
- States: normal (idle), animated pulse when sending, red dot badge for errors, yellow dot for warnings

### Main Popover Panel
Fixed width ~380px, variable height up to ~600px with scrolling. Organized into tabs at the bottom (or a sidebar):

```
┌────────────────────────────────────────┐
│  📬 Postorama      [Settings gear ⚙]  │
├────────────────────────────────────────┤
│                                        │
│  [Dashboard]  [Recipients]  [History]  │
│                                        │
│  ┌──────────────────────────────────┐  │
│  │  Hannah Montana                  │  │
│  │  ● 4 photos remaining            │  │
│  │  Last sent: Feb 28 · Weekly      │  │
│  │  Next: Mar 7                     │  │
│  │             [Send Now ↗] [···]   │  │
│  └──────────────────────────────────┘  │
│                                        │
│  ┌──────────────────────────────────┐  │
│  │  Bob Smith                 ⚠ 1  │  │
│  │  ● Low photos remaining          │  │
│  │  Last sent: Feb 10 · Monthly     │  │
│  │  Next: Mar 10                    │  │
│  │             [Send Now ↗] [···]   │  │
│  └──────────────────────────────────┘  │
│                                        │
└────────────────────────────────────────┘
```

Each recipient card shows:
- Name + status dot (green = healthy, yellow = low photos ≤3, red = error, gray = paused)
- Photos remaining count
- Last sent date (human-friendly: "Feb 28")
- Frequency label + calculated next send date
- "Send Now" button → opens confirmation sheet
- `···` overflow menu → View Photos, View History, Pause, Force Send, Edit

### Recipient Detail View (full panel slide-in)
Opens when clicking a recipient card or from overflow menu. Contains:

**Header section:**
- Large name + editable greeting field (inline edit on click)
- Active/Paused toggle switch
- Frequency selector (Weekly / Biweekly / Monthly / Custom)
- Postcard size selector ([4×6 ●] / [6×9 ○]) — overrides the global default for this recipient
- "Send Now" button

**Photo Browser:**
- Grid of small thumbnails from the Photos album
- Sent photos have a gray overlay + small "✓" badge
- Unsent photos shown clearly
- Selected "next" photo has a blue ring
- Click any photo → "Send This Next" context action

**Postcard Preview:**
- Side-by-side mini preview of front (photo) and back (message + address layout)
- Renders live as you change the greeting or selected photo

**Notes field:**
- Free-text notes about this recipient (birthday, address quirks, etc.)

### History Panel
A scrollable list of all sends across all recipients, newest first:
```
Mar 4, 2026  •  Hannah Montana
[thumbnail]  haiku_200 · "Leaves drift through..."
             Lob #psc_xyz · Expected Mar 9  [View PDF ↗]

Feb 28, 2026  •  Bob Smith
[thumbnail]  quote_143 · "The secret of getting..."
             Lob #psc_abc · Expected Mar 5  [View PDF ↗]
```

Filter by recipient using a dropdown at the top.

### Settings Panel (full-width overlay)
Organized into sections:

**Account**
- Lob API Key (password field, show/hide toggle)
- Mode: [Sandbox ●] / [Live ○] toggle — sandbox shown in amber banner
- [Test Connection] button with inline status

**Return Address**
- Name, Address Line 1, Line 2 (optional), City, State, ZIP
- Inline form, save on blur or explicit [Save] button

**Defaults**
- Default postcard size: [4×6 ●] / [6×9 ○]
- Low photo warning threshold (number stepper, default 3)

**Scheduler**
- Send window: from [8:00 AM] to [10:00 AM]
- Weekday preference (optional — "prefer Mondays" but will still send on other days if behind)
- [Pause all] master switch

**App**
- Launch at login toggle (uses `app.setLoginItemSettings`)

**Messages**
- [Open message library…] → opens a larger window for message editing

**Data**
- [Open Database Folder]
- [Export Send History as CSV]
- [Reset All Sent History] (destructive, requires confirmation)

### Message Library Window (separate, larger window)
A dedicated window (not popover) for browsing and editing messages:
- Sidebar: filter by type (All, Haiku, Limerick, Quote, Other)
- Main list: each message shows ID, type badge, first line of text
- Detail pane: full text editor, type selector, tags field
- [+ New Message] → inline form
- [Import JSON…] / [Export JSON…]
- Search bar across all messages

---

## Architecture Guidance

### Process Structure
- **Main process**: all backend logic (JXA, Swift, Lob API, SQLite, scheduling, Sharp)
- **Renderer process**: React UI — communicates via typed IPC channels only
- **Preload script**: exposes a typed `window.api` object with `invoke` wrappers

### IPC Channel Design
Define typed channels in a shared `src/shared/ipc-types.ts`:
```typescript
// Examples — define all channels here
type IpcChannels = {
  'recipients:list': { request: void; response: RecipientStatus[] }
  'recipients:sendNow': { request: { id: string; force?: boolean }; response: SendResult }
  'recipients:updateSettings': { request: { id: string; settings: Partial<RecipientSettings> }; response: void }
  'photos:listForRecipient': { request: { albumName: string }; response: PhotoAsset[] }
  'history:list': { request: { recipientId?: string; limit?: number }; response: SendHistoryRow[] }
  'settings:get': { request: void; response: AppSettings }
  'settings:set': { request: Partial<AppSettings>; response: void }
  'lob:testConnection': { request: { apiKey: string; sandbox: boolean }; response: { ok: boolean; error?: string } }
  'messages:list': { request: void; response: Message[] }
  'messages:save': { request: Message[]; response: void }
  'scheduler:status': { request: void; response: SchedulerStatus }
}
```

### Settings Storage
Use `electron-store` for non-sensitive settings (return address, scheduler config, defaults, sandbox mode flag). Store the Lob API key using **Electron's built-in `safeStorage` API** — encrypt with `safeStorage.encryptString()` and persist the encrypted bytes as a base64 string in electron-store. Never store the plaintext key in JSON or electron-store. Do not use `keytar`.

### Scheduler (Main Process)
Run a `setInterval` every 5 minutes in the main process. On each tick:
1. Check if current time is within the configured send window
2. Query all active recipients
3. For each: check `last_sent_at + frequency_days <= now`
4. If due: run the full send workflow (same as CLI `processRecipient`)
5. Emit an IPC event to renderer to refresh the dashboard

### Recipient Status Model (for UI)
```typescript
interface RecipientStatus {
  id: string
  fullName: string
  albumName: string
  sentAlbumName: string
  frequency: FrequencyOption      // 'weekly' | 'biweekly' | 'monthly' | 'custom'
  frequencyDays: number
  active: boolean
  lastSentAt: string | null       // ISO 8601
  nextSendAt: string | null       // calculated
  photoCount: number              // total in album
  unsentCount: number
  postcardSize: '4x6' | '6x9'    // per-recipient override or global default
  isDue: boolean
  hasError: boolean
  errorMessage?: string
  notes?: string
  nextPhotoId?: string            // override for next send
}
```

---

## Important Constraints to Preserve

1. **`recordSend()` is called AFTER Lob confirms success and BEFORE Photos marking.** SQLite is the source of truth for idempotency.
2. **Recipient IDs are stable slugs.** Changing `fullName` breaks DB linkage. Warn users in the UI if they rename a contact.
3. **Photos.app interaction is via JXA** (osascript -l JavaScript, written to temp .js file, never `-e` flag). Parameters embedded via `JSON.stringify()` never string concatenation.
4. **Contacts.app must use Swift CNContactStore** (osascript spawned from Node is silently denied Contacts access on modern macOS).
5. **Sharp requires native compilation** on the target machine — note this in build docs.
6. **Lob multipart upload**: send front/back HTML as `File` objects in `FormData` to bypass the 10K inline HTML character limit.
7. **HEIC → JPEG conversion** must go through `sips` before Sharp processes the file.

---

## Deliverables

1. Complete Electron + React + TypeScript project at `~/Projects/Personal/Postorama/`
2. All IPC channels implemented (main + preload + renderer hooks)
3. Scheduler implemented in main process
4. All Posty CLI behaviors available as IPC calls or replaced by UI equivalents
5. Full settings UI including API key management (keychain)
6. Recipient dashboard with per-recipient cards and detail view
7. Photo browser per recipient with "Send This Next" selection
8. Send history panel with proof URL links
9. Message library window
10. Postcard preview component (front + back)
11. Dark mode support
12. `electron-builder` config for macOS `.dmg` distribution
13. `README.md` with setup instructions, including how to migrate data from the Posty CLI's `db/posty.db`

The app should feel polished, fast, and native. Every interaction should have appropriate feedback (loading states, success/error toasts, skeleton loaders). Aim for zero blank states — every empty state should have a helpful illustration and a clear call to action.
