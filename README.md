# Focus Browser

A minimalist Windows browser built to make procrastination *harder*, not just
theoretically possible to resist. Real tabs, a Pomodoro timer, a site blocker
with a deliberate friction override, and a distraction-stripped Focus Mode —
strictly local, no accounts, no sync, nothing leaves your machine.

## Why this exists

Most site blockers fail for the same reason: turning them off takes one
click, and one click is nothing when you're already procrastinating. Focus
Browser's blocker instead makes unblocking a blocked site cost a **60-second
forced wait plus typing a fixed phrase** — enough friction that the impulsive
click doesn't win, but a genuine need still gets through.

## Download

Grab the latest build from the [Releases page](../../releases/latest):

- **`Focus Browser Setup <version>.exe`** — standard installer (Start Menu
  shortcut, installs to Program Files)
- **`Focus Browser <version>.exe`** (portable) — no install, just run it from
  anywhere (USB drive, no admin rights needed)

Windows SmartScreen may warn that this is from an unrecognized publisher
(the build isn't code-signed yet) — click **More info → Run anyway**.

## Features

- **Real tabbed browsing** — one genuine Chromium view per tab, multi-window
  support (Ctrl+N), tab groups, back/forward/reload
- **Site blocker** — domain block/allow lists with a starter blocklist of
  major social/video sites, plus the 60-second friction override described
  above instead of an instant toggle
- **Pomodoro timer** — configurable work/break durations, system tray icon,
  desktop notifications, and optional auto-enable of blocking + Focus Mode
  during work sessions
- **Focus Mode** — strips toolbar clutter, optional tab limit with a gentle
  nudge, and a distraction-free reader view for articles
- **Usage dashboard** — local-only time-per-site tracking, today + 7-day view
- **Workspace sidebar** — a mini file tree + editor for local project files,
  right alongside your tabs
- **Launch Profiles** — one click opens a set of tabs and spawns local apps
  (VS Code, a terminal, etc.) together
- **Tab deep-freezing** — fully tears down background tabs' renderer
  processes to reclaim memory, restoring them instantly on click
- **AI chat sidebar** — bring-your-own-API-key chat panel (UI shell today;
  wiring up a live provider is a planned follow-up)
- **Address bar autocomplete** — ranked by your own browsing history, nothing
  sent anywhere

Full keyboard shortcuts: Ctrl+T (new tab), Ctrl+W (close tab), Ctrl+Shift+T
(reopen closed tab), Ctrl+Tab (next tab), Ctrl+1–8 (jump to tab), Ctrl+N (new
window).

## Requirements

- Windows 10/11

## For developers

```powershell
git clone https://github.com/bananaosint/focus-browser.git
cd focus-browser
npm install
npm start
```

`npm install` also pulls in Electron itself (~100MB+), so the first run takes
a minute.

To build your own installer/portable exe:

```powershell
npm run dist
```

Output lands in `dist/`.

See [docs/DEVLOG.md](docs/DEVLOG.md) for the full build log — implementation
notes, design rationale, and known limitations for every feature.

## License

[MIT](LICENSE)
