Respond with implementation only. No preamble, no explanations, no recaps, no postamble. Output code and direct answers only.

# Slugline — Claude Instructions

## Stack
- Electron + React 18 + SQLite (better-sqlite3) + Zustand
- Build system: electron-vite
- Styling: Tailwind CSS
- Anthropic SDK: @anthropic-ai/sdk

## Project Layout
```
electron/
  main/
    index.js       — app entry, window creation, all ipcMain registrations
    db.js          — all SQLite CRUD (never touch the db from the renderer)
    schema.js      — db schema, run once on startup
    config.js      — AES-256-GCM encrypted config (API key, preferences)
    ipc-claude.js  — all Anthropic API calls; model routing per feature
    ipc-backup.js  — snapshots, panic export, ZIP via archiver
    ipc-export.js  — export to .fountain .md .fdx .pdf .docx; import same
  preload/
    index.js       — contextBridge — the ONLY way renderer talks to main
src/
  store.js         — Zustand global state; all app state lives here
  components/      — React components, one file per screen/modal
  styles/          — global CSS
```

## Architecture Rules
- All SQLite access lives in `electron/main/db.js`. Never query the DB from the renderer.
- All Claude API calls live in `electron/main/ipc-claude.js`. API key never touches the renderer process.
- Renderer ↔ Main communication is exclusively through the contextBridge in `electron/preload/index.js`.
- State management is Zustand (`src/store.js`). No Redux, no Context API for app state.
- No cloud sync. No telemetry. No accounts. Everything is local.

## Model Routing (ipc-claude.js)
| Feature | Model |
|---|---|
| Inline suggest, auto-tag, writing prompt, idle nudge | claude-haiku-* |
| Chat panel, scene analysis, dialogue coach, brainstorm | claude-sonnet-* |
| Development questionnaire, story bible gen, full rewrite | claude-opus-* or claude-sonnet-* |

Always use the latest available model string from `@anthropic-ai/sdk`. Check `CLAUDE_MODELS` constant at top of `ipc-claude.js`.

## Database Tables
projects, documents, scenes, characters, world_building, beat_sheets, chat_history, brainstorm_entries, snapshots, research, writing_sessions, token_usage

Schema source of truth: `electron/main/schema.js`

## IPC Channel Naming Convention
`channel:action` — e.g. `claude:suggest`, `db:getProject`, `backup:panic`, `export:fountain`

## Key Shortcuts
- `Cmd+Shift+P` — Panic export (registered globally in main/index.js)
- `Tab` — Cycle screenplay element type (Scene Heading → Action → Character → Dialogue → Parenthetical → Transition)

## Screenplay Element Order (Tab cycle)
scene_heading → action → character → dialogue → parenthetical → transition → scene_heading

## Backup / Snapshot Logic
- Auto-save: debounced 800ms after last keystroke
- Snapshots: daily, thinned to weekly after 30 days
- Panic export: ZIP → two destinations (Documents + Desktop), no dialogs, instant
- Source: `electron/main/ipc-backup.js`

## Export Formats
.fountain, .fdx (Final Draft XML), .pdf (pdf-lib), .docx (docx package), .md
Source: `electron/main/ipc-export.js`

## Styling
- Dark/light switchable via `data-theme` on `<html>`
- Screenplay editor font: Courier Prime
- UI font: system-ui
- Accent color: amber (#F59E0B)
- Do not add new CSS frameworks. Tailwind + existing global styles only.

## Adding a New Feature
1. Add IPC handler in the appropriate `ipc-*.js` file
2. Register the handler in `electron/main/index.js`
3. Expose it in `electron/preload/index.js` via contextBridge
4. Add the Zustand action/state in `src/store.js` if stateful
5. Build the React component in `src/components/`

## Do Not
- Do not add any analytics, tracking, or network calls except to `api.anthropic.com`
- Do not store the API key anywhere except the encrypted config via `config.js`
- Do not add accounts, auth, or cloud sync
- Do not use `require` in the renderer — use the contextBridge API only
- Do not add action without user confirmation for destructive operations
