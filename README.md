# Slugline

An AI-powered screenplay writing app that runs entirely on your computer. No accounts, no cloud sync, no subscriptions — just you, your script, and Claude.

---

## What you need before starting

- **A Mac** (macOS 12 or later)
- **Node.js** (version 18 or later) — [download here](https://nodejs.org)
- **An Anthropic API key** — [get one here](https://console.anthropic.com)
- **VS Code** (optional, but recommended) — [download here](https://code.visualstudio.com)

To check if Node.js is installed, open Terminal and type:
```
node --version
```
You should see something like `v20.0.0`. If you get an error, install Node.js first.

---

## Setup (one time only)

### Step 1: Get the project files

Save the `slugline` folder somewhere permanent (like your Documents folder). Don't move it after this.

### Step 2: Open Terminal in the project folder

**Option A — VS Code:**
1. Open VS Code
2. File → Open Folder → select the `slugline` folder
3. Press `` Ctrl+` `` (backtick) to open the terminal

**Option B — Mac Terminal:**
1. Open Terminal (in Applications → Utilities)
2. Type `cd ` (with a space after), then drag the `slugline` folder into the window
3. Press Enter

### Step 3: Install dependencies

Type this and press Enter:
```
npm install
```

This downloads all the code Slugline needs to run. It will take 2–5 minutes the first time. You'll see a lot of text — that's normal. Wait for it to finish (you'll get your prompt back).

---

## Running the app

Every time you want to use Slugline:

```
npm run dev
```

The app window will open. First time, it will ask for your API key.

To stop the app: close the window, or press `Ctrl+C` in the terminal.

---

## First launch

1. **Enter your API key** — paste it in and click Connect. It's encrypted and stored only on your computer.
2. **Create a new project** — give it a name.
3. **Development Mode** — you'll be guided through 10 questions to develop your story before writing. This takes 20–30 minutes and is worth it.
4. **Beat Sheet** — fill in your structure beats. Lock them in when ready.
5. **Write** — the script editor opens automatically.

---

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `Tab` | Cycle element type (Scene Heading → Action → Character → etc.) |
| `Enter` | New block (smart type detection) |
| `⌘1–6` | Set element type directly |
| `⌘⇧P` | **Panic Export** — saves everything to backup folder, no dialogs |
| `⌘⇧S` | Manual backup |
| `⌘⇧C` | Toggle Claude chat panel |
| `⌘⇧B` | Toggle Story Bible |
| `⌘⇧F` | Distraction-free mode |
| `⌘⇧A` | Scene Analysis |
| `⌘⇧D` | Dialogue Coach |
| `⌘E` | Export |
| `⌘,` | Settings |

---

## What Claude can do

Slugline uses three Claude models for different tasks:

- **Haiku** (fast, cheap) — summarising research, auto-tagging scenes, token counting
- **Sonnet** (smart, balanced) — chat, inline suggestions, development questions, writing prompts
- **Opus** (most capable) — full rewrites, story bible generation, beat sheet analysis, TV vs. feature recommendation

**Every Claude call shows you the estimated token cost before sending anything.**

---

## Your data

Everything is stored locally on your Mac:

- **Scripts and story bible** → `~/Library/Application Support/slugline/slugline.db` (SQLite database)
- **API key** → `~/Library/Application Support/slugline/slugline.config.enc` (encrypted)
- **Backups** → wherever you set in Settings (default: `~/Documents/Slugline Backups`)

### Backup system

- **Auto-save** — your script saves automatically every 1.5 seconds
- **Panic Export** (`⌘⇧P`) — saves a ZIP of everything to your backup folder immediately, no prompts
- **Manual Backup** — same as panic export but also confirms success
- **Snapshots** — point-in-time saves you can restore from anytime. Daily snapshots are kept for 30 days, then thinned to weekly. Manual snapshots are kept forever.

---

## Exporting your script

Go to File → Export or press `⌘E`. Supported formats:

- `.fountain` — plain text screenplay format (works with Highland, Fade In, Final Draft)
- `.fdx` — Final Draft native format
- `.pdf` — print-ready PDF
- `.docx` — Microsoft Word
- `.md` — Markdown

---

## Troubleshooting

**App won't start / "command not found"**
→ Make sure Node.js is installed: `node --version`

**"Could not find module" errors**
→ Run `npm install` again

**API key error**
→ Go to Settings → API Key → Change Key. Make sure you're pasting the full key starting with `sk-ant-`

**App starts but shows blank screen**
→ Close and reopen. If it persists, open VS Code terminal and look for error messages.

**Fonts look wrong**
→ Make sure you have an internet connection on first launch (fonts load from Google Fonts).

---

## Notes for technical users

- Built with Electron + React + SQLite (better-sqlite3)
- Uses electron-vite for the build system
- State management with Zustand
- All Claude API calls go through the main process — the API key never touches the renderer process
- The database is a standard SQLite file; you can open it with any SQLite browser

---

*Slugline is a local-first tool. Nothing you write ever leaves your computer except the specific text you send to Claude for analysis.*
