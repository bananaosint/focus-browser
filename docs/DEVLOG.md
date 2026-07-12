# Focus Browser — Dev Log (Milestones 1–10)

This is the build log: implementation notes, design rationale, deviations
from the original plan, known limitations, and testing notes for every
milestone. For the user-facing overview, see the top-level
[README.md](../README.md).

Minimal Electron browser: tabs (multi-window via Ctrl+N), address bar with
history-based autocomplete and keyboard shortcuts, back/forward/reload,
lightweight tab groups, a site blocker with a friction-based override, a
Pomodoro timer with a system tray icon, a Focus Mode with a distraction-free
reader view, Pomodoro ↔ Focus Mode/blocking auto-integration, a local-folder
workspace sidebar with a file tree/editor, an AI chat sidebar (UI shell,
bring-your-own-API-key), Launch Profiles that open a set of tabs and spawn
local apps together, zero-resource tab deep-freezing, a local usage-stats
dashboard, and packaging groundwork. Strictly local — no accounts, no sync,
nothing leaves the machine except the local commands you explicitly configure
(see Launch Profiles below) and whatever AI provider you configure once chat
is actually wired up.

## Requirements

- Windows 10/11
- Node.js 18+ (LTS recommended) — needed for `npm`, Electron bundles its own runtime

## Setup

```powershell
npm install
npm start
```

`npm install` will download Electron itself (~100MB+), so the first run takes
a minute. `electron-builder` is also a devDependency now (for `npm run dist`,
see Packaging below) but isn't needed for everyday `npm start` use.

## What's here

- Tabbed browsing via `WebContentsView` — one real Chromium view per tab, not a simulation
- Address bar: paste/type a URL, or type anything else and it searches Google.
  Autocomplete against your own browsing history as you type — see below.
- Back / forward / reload, with buttons correctly disabled when there's nowhere to go
- Lightweight tab groups: right-click a tab → "New group from tab", or use
  the "Group" toolbar button — both put the active tab in a new group
  immediately. To add more tabs to an existing group, right-click one and
  pick "Add to ...". Grouped tabs show a colored strip on top.
- No default Electron menu bar (stripped for a cleaner window); DevTools are
  still reachable via F12 or Ctrl+Shift+I, rewired by hand since removing the
  menu also removes its accelerators
- Native Windows title bar kept as-is for v1 — a custom frameless titlebar is
  a reasonable later polish item but adds real risk (drag regions, custom
  min/max/close buttons) for no functional gain right now

## Site blocking (Milestone 2)

- Domain blocklist + allowlist, edited from the Settings window (gear icon in
  the toolbar). Ships with a starter blocklist of major social/video sites.
- Plain domains (`facebook.com`) auto-match subdomains; entries with `*` are
  treated as simple glob wildcards (`*.tumblr.com`), not full regex — see
  "Known limitations" for why.
- Blocking happens at `session.webRequest.onBeforeRequest`, main-frame
  navigations only (so an unrelated site embedding something from a blocked
  domain isn't affected) — matches redirect to `src/pages/blocked.html`
  instead of a bare cancelled load.
- **Friction override:** the blocked page requires a 60-second forced wait
  *and* typing a fixed phrase before "Continue anyway" unlocks — a 10-minute,
  domain-scoped, memory-only unlock (not persisted, doesn't survive a
  restart). Tabs have no preload/Node access by design, so the blocked page
  talks back to the main process through a custom `focus-action://` protocol
  instead of IPC.

## Pomodoro timer (Milestone 3)

- Standard 25/5, long break every 4 cycles by default — all four durations
  configurable from Settings → Pomodoro.
- System tray icon (Windows) shows phase via color (idle/work/short
  break/long break) and remaining time in the tooltip; right-click for
  start/pause/reset/skip and quick links to the timer window and Settings.
  The icon itself is generated at runtime (`src/main/trayIcon.js` hand-rolls a
  PNG) rather than shipping an image asset.
- A small timer window (toolbar pill, or click the tray icon) shows the
  countdown, phase, and cycle-progress dots, with start/pause/reset/skip.
  Closing it hides rather than destroys it, so the timer keeps running in
  the background.
- Desktop notification fires on every phase transition (work → break, break →
  work), not on manual skips.
- Milestone 3 shipped the timer itself; the auto-toggle described below is
  Milestone 5.

## Focus Mode + reader view (Milestone 4)

- Toolbar "Focus" button (also in Settings → Focus Mode) toggles Focus Mode
  on/off. The only toolbar chrome it currently strips is the "Group" button —
  this browser never had a bookmarks bar or extensions row for it to hide, so
  that part of the plan's bullet doesn't apply here; said so explicitly rather
  than inventing UI just to have something to hide.
- Optional tab limit (Settings → Focus Mode, 0 = no limit). Crossing it pops a
  dismissible toast ("N tabs open — past your limit of N") once, right as you
  cross the threshold — it never blocks opening more tabs.
- Reader button (book icon) in the toolbar strips ads/nav/sidebars from the
  current page and re-renders just the article in a serif, single-column
  view. Works independently of the Focus Mode toggle — it's useful any time,
  so it isn't gated behind it. Click again (or navigate away) to exit.
  Extraction is a small hand-rolled heuristic (paragraph text density minus
  link density) run via `webContents.executeJavaScript` — not Mozilla
  Readability, see "Known limitations."
- New-tab page is unchanged from Milestone 1 (already blank/plain, which is
  what the plan asked for) — not wired to Focus Mode state, since doing that
  would mean giving tabs IPC access they deliberately don't have.

## Pomodoro integration (Milestone 5)

- Settings → Pomodoro → "Auto-enable Focus Mode + blocking during work
  sessions" (on by default). When a work session begins, it snapshots
  whatever blocker/Focus Mode state you already had and forces both on; when
  the break begins, it restores that exact snapshot — so if you already had
  blocking on permanently, breaks don't turn it off, and if you didn't, breaks
  correctly turn it back off rather than just always flipping to "off."
- Deliberately does **not** trigger on pause/resume, only on real phase
  transitions (natural completion, Skip, or a Reset that crosses out of a work
  phase) — otherwise hitting Pause would be an instant, silent way to lift
  site blocking, defeating the whole point of Milestone 2's friction design.

## Workspace sidebar (Milestone 6)

- Toolbar folder icon toggles a sidebar (📁) with a local file tree on top and
  a plain `<textarea>` code/markdown editor below, wired to Ctrl+S. "Open
  Folder" uses the native folder picker; the last-opened folder and the
  sidebar's shown/hidden state persist across restarts.
- No Monaco/CodeMirror — a plain monospace `<textarea>`, deliberately. Pulling
  in a real code-editor component means a bundler step this project doesn't
  have; a textarea is honest about what v1 actually is (view + edit text
  files), not dressed up as a code editor it isn't
- Every read/write is funneled through `src/main/workspace.js` in the main
  process and validated to stay inside the currently-open folder (a path-
  traversal guard), even though the sidebar UI is trusted app chrome, not
  arbitrary web content — defense-in-depth against a bug in the sidebar JS
  requesting an out-of-scope path, not against malice
- `node_modules` and `.git` are filtered out of the tree; files over 2MB
  refuse to open (error banner instead) to keep the textarea responsive
- Sidebar width: drag the handle at the sidebar's right edge, or use the
  "−"/"+" header buttons (40px steps) for precise/incremental changes. Both
  clamp to 220–600px and persist across restarts.
- **How the drag works, since it's not the obvious approach:** tracking is
  done by *polling `screen.getCursorScreenPoint()` from the main process*
  (`startSidebarResize()` in `src/main/main.js`, ~60fps), not by listening to
  the sidebar's own `mousemove` events. A renderer's mouse events stop once
  the cursor leaves that `WebContentsView`'s bounds — and a resize drag needs
  to keep tracking exactly as the boundary moves out from under the cursor,
  which a single view watching its own `mousemove` can't do once the cursor
  has crossed into the tab view next door. Polling OS cursor position
  directly sidesteps that: it doesn't care which view (if any) is currently
  hit-testing the cursor. The sidebar's own `mouseup` listener still ends the
  drag — reliable because the view's bounds are kept a few pixels past the
  live cursor position on every poll tick (`RESIZE_EDGE_BUFFER`), so the
  release always lands inside the workspace view's hit region. A window-blur
  listener and a 15s timeout both force-end a drag that never gets a clean
  stop signal (e.g. the cursor released off-screen). The live width itself is
  only pushed to the tab layout during the drag — the settings file is
  written once, at drag end, not on every poll tick (that would mean ~60
  synchronous disk writes per second).
- Explorer (file tree) can be collapsed independently of the whole sidebar —
  originally a small text label above the tree that turned out to be easy to
  miss; now a proper icon button in the header, same visual weight as Open
  Folder. State persists across restarts.

## Launch Profiles (Milestone 7)

- The plan calls these "Workspace Profiles"; renamed to "Launch Profiles" in
  code/UI so they don't read as the same feature as Milestone 6's unrelated
  "workspace" (the file panel above) — same idea as the plan describes, just
  a different word to keep the two apart.
- Settings → Launcher: create a profile with a name, a list of URLs, a list of
  local commands (e.g. `code .`, `wt.exe`), and an optional working directory.
  Clicking "Launch" opens every URL as a new tab and runs every command. A 🚀
  toolbar button gives one-click access to any saved profile without opening
  Settings — it's a native OS popup menu (see "Bug fixes" below for why).
- **Working directory fix:** commands now run with `cwd` set to the profile's
  configured folder (a "Browse…" picker in the form), falling back to
  `os.homedir()` if unset. Previously commands ran with no explicit `cwd` at
  all, which meant Node's `child_process.exec` inherited the *Electron
  process's own* working directory — wherever `npm start`/the packaged app
  happened to launch from, i.e. this app's own install folder. That's why
  `code .` was opening the Focus Browser source tree instead of the user's
  project: it genuinely had none of their files or apps in it, because it was
  never pointed at any of their folders to begin with.
- **Security note, read before adding commands:** commands run through
  `child_process.exec` — the same as typing them into a terminal, including
  shell features like `&&` chains and quoted paths. This is intentionally
  unrestricted, the same trust boundary as a user's own `tasks.json` or
  Makefile: every command is typed by you into your own local Settings
  window, stored in your own local settings.json, and only ever triggered by
  your own click. Nothing reachable from a web page or the blocked-page
  friction flow can touch this — tabs have no preload/IPC at all, so there's
  no path from untrusted content to `child_process`. Still, don't paste in a
  command you wouldn't run yourself.
- A failed command surfaces as a toast in the main window ("`<profile>` —
  command failed: `<command>` (`<error>`)") rather than failing silently.

## Bug fixes (post-Milestone 7)

- **Launcher menu showing nothing:** the tab right-click menu and the 🚀
  launcher dropdown were originally custom HTML popovers rendered inside the
  chrome UI's own `WebContentsView` — which is only `CHROME_HEIGHT` (76px)
  tall. A `WebContentsView`'s content is physically clipped to its own
  bounds rectangle no matter what CSS says (`position: fixed`, z-index,
  none of it escapes the view, the same way an iframe's content can't render
  outside its box). The launcher menu, opening below the toolbar, was
  rendering entirely outside that 76px strip — invisible, not broken. Fixed
  by rebuilding both menus as native `Menu.buildFromTemplate(...).popup()`
  calls (see `showTabContextMenu`/`showLauncherMenu` in `src/main/main.js`),
  which aren't web content and aren't bound by any view's rectangle. This is
  also just a more idiomatic Electron pattern than the custom popovers were
  — it's the same API already used for the tray's context menu.
- **Launch Profile commands running in the wrong folder:** see the working
  directory fix under Launch Profiles above.
- **Workspace sidebar resize/collapse:** first pass added "−"/"+" buttons
  only, no live drag, out of (unfounded, in hindsight) concern about mouse
  capture crossing `WebContentsView` boundaries during a drag. A follow-up
  added a real drag handle once `screen.getCursorScreenPoint()` polling
  turned out to sidestep that concern entirely (see Milestone 6 above for
  how), and moved the explorer-collapse toggle from an easy-to-miss text
  label into a proper header button.
- **Toolbar "Group" button appearing to do nothing:** it was creating an
  *empty* group and leaving the user to discover "Add to ..." in a tab's
  right-click menu on their own — since only tabs that belong to a group get
  any visual change (the colored top strip), an empty group produces zero
  feedback that anything happened. It now groups the active tab immediately,
  the same action as the right-click "New group from tab" item, so clicking
  it does something visible right away instead of requiring a second step
  the button gave no hint was necessary.

## Tab deep-freezing (Milestone 8)

- Right-click any background tab → "Freeze tab" to manually destroy its
  `WebContentsView` and underlying Chromium renderer process immediately, or
  let it happen automatically — Settings → Tabs → "Freeze inactive tabs to
  save memory" (on by default, configurable freeze-after time, default 10
  minutes). The active tab is never frozen.
- This is a real teardown, not Milestone 1's existing "inactive tabs get
  zero-sized" trick — a zero-sized `WebContentsView` still has a live
  renderer process behind it holding onto everything the page allocated. A
  frozen tab has none of that; `tab.view` is `null` until you click it again.
- Thawing (clicking a frozen tab) recreates the view, reloads the URL, and
  restores scroll position via an injected `window.scrollTo` once the page
  finishes loading. Scroll position is captured via
  `executeJavaScript('window.scrollY...')` right before teardown, with a
  1.5s timeout so a hung/unresponsive page can't block freezing indefinitely.
- Frozen tabs show at reduced opacity with a ❄ prefix in the tab strip.
- Deliberately touches nothing about how the *active* tab or Milestone 1's
  existing inactive-tab bounds-zeroing works — freezing only ever applies to
  tabs that are already backgrounded. Every method in `tabManager.js` that
  reads `tab.view` (`reflow`, `closeTab`, `navigate`, `goBack`/`goForward`,
  `reload`, `toggleReaderMode`) was audited and updated to treat a `null`
  view as "nothing to do" rather than assuming it's always live — this was
  the actual risk flagged when this milestone was originally deferred, and
  it's why freeze/thaw got a dedicated pass instead of being bolted on
  alongside the workspace/launcher work.

## Usage dashboard (Milestone 9)

- 📊 toolbar button opens a Usage Dashboard window: today's time-per-site as a
  horizontal bar list, and the last 7 days as a bar-chart trend. Both
  hand-rolled with plain divs/CSS.
- **Deviated from the plan on purpose:** the plan calls for SQLite
  (`better-sqlite3`) and `recharts`. `better-sqlite3` is a native Node addon
  that needs rebuilding against Electron's own Node ABI — real
  install/build-toolchain risk for a feature that's one number per
  (day, hostname). `recharts` is a React charting library, and this codebase
  has never used React or any bundler — pulling in a component library for a
  handful of bars would mean standing up a build step for the first time,
  for two small charts. Both got replaced with the same flat-JSON-store +
  hand-rolled-UI approach every other feature here already uses.
- **What counts as "usage":** attention time, not "a tab was open" time.
  Tracking only runs while a site's tab is the *active* tab and the *window
  has focus* — background tabs, a backgrounded app, and non-http(s) pages
  (new tab, the blocked page, reader mode's `data:` URL) don't accrue time.
  Reader mode is a deliberate exception to that last part: entering/exiting
  reader mode doesn't interrupt tracking, since you're still reading the same
  site's content (see `tabManager.js`'s `did-navigate` handler).
- No idle detection — leaving the window focused on a tab while away from the
  keyboard still counts, the same way most simple time trackers without an
  OS-level idle hook behave. Checkpointed to disk every 60s so a long session
  isn't lost if the app closes uncleanly, plus a flush on window blur and
  `before-quit`.
- "Clear usage data" and "Clear browsing history" buttons live in the
  dashboard — both fully local, both erasable any time.

## Address bar history + autocomplete

- Every real navigation (any tab, not just the active one) gets recorded —
  URL, title, last-visited time, visit count — capped at 5000 entries
  (oldest pruned first). As you type in the address bar, matching history
  (substring match on URL/title, weighted by recency and visit frequency)
  shows as a dropdown; arrow keys to move through it, Enter to go, Escape to
  dismiss, click to select.
- **How the dropdown avoids the clipping problem:** it can't be a plain
  in-page element positioned below the address bar, for the same reason the
  launcher/context menus couldn't (see "Bug fixes" above) — the chrome UI's
  `WebContentsView` is only 76px tall, and content is clipped to a view's own
  bounds regardless of CSS. Rather than route this through a native menu too
  (which doesn't suit a "keep typing, list updates live" interaction — a
  native `Menu.popup()` isn't something you can silently repopulate while
  the user's still got focus in a text field), the chrome view's own height
  grows to fit the dropdown (`setChromeHeight()` in `tabManager.js`) and
  shrinks back when it's dismissed.
- **The real UX tradeoff worth knowing about:** growing the chrome view
  pushes the tab content area down by the same amount, so the page you're
  looking at visibly shrinks and shifts while you type and springs back when
  you stop — unlike a real browser, where suggestions float over the page
  without moving it. A floating overlay (a separate positioned window layered
  on top) would look more normal, but needs cross-window position math that
  couldn't be visually verified in this environment; this is the version
  that's actually been checked to behave the way the code says it does.

## Toolbar polish (Milestone 10)

- The "+" new-tab button now sits flush against the last tab instead of
  pinned to the far right of the strip with a big gap when there's only a
  few tabs — `#tabs` was `flex: 1` (always fills available width regardless
  of content), changed to `flex: 0 1 auto` (shrink-wraps to its tabs, still
  scrolls internally once there are enough to overflow).
- New tabs auto-focus the address bar, selected and ready to type — no more
  clicking into it first. Detected client-side in `chrome.js` (a set of
  known tab ids; a newly-active id we haven't seen before means "this is a
  fresh tab, not a switch to an existing one") rather than a dedicated IPC
  event, and deliberately doesn't fire on the very first render so app
  launch doesn't yank focus away from nothing in particular.
- Settings → Toolbar: per-button show/hide toggles for every *optional*
  toolbar button (Reader, Group, Focus Mode, Pomodoro, Launcher, Dashboard,
  AI Chat). Settings and Workspace are excluded on purpose — Settings is how
  you'd get back into this list if everything else were hidden, and
  Workspace was asked to stay put by name. Core navigation (back/forward/
  reload/address bar) was never a candidate either; those aren't optional
  features to declutter, they're the browser.

## AI Chat sidebar (shell only)

- 🤖 toolbar button opens a right-side sidebar — same architecture as the
  workspace sidebar (own `WebContentsView`, own preload, resizable via
  header buttons), just on the opposite edge so both can be open at once.
  Settings → AI Chat holds the provider (Anthropic/OpenAI/other), API key,
  and optional model name, stored locally like everything else here.
- **This is UI only — nothing calls a real API yet.** Typing a message and
  hitting Send appends it to the chat pane and gets a canned placeholder
  reply back ("this is a UI shell — sending isn't wired up to your provider
  yet"). That's deliberate, not a bug: the actual API integration was
  explicitly deferred to a follow-up rather than guessed at here. What *is*
  done: the sidebar, the resize controls, the Settings form, the API-key-set
  banner, and the send/receive interaction loop — everything the real
  integration will plug into.

## Keyboard shortcuts

Ctrl+T (new tab), Ctrl+W (close tab), Ctrl+Shift+T (reopen last closed tab,
up to 10 deep), Ctrl+Tab (next tab, wraps around), Ctrl+1 through Ctrl+8
(jump to tab by position), Ctrl+N (new window — see Multi-window below).
Wired via `before-input-event` on *every* webContents the app creates —
chrome, both primary-only sidebars, and every tab in every window — rather
than Electron menu accelerators, since the app menu is stripped entirely.
That's also why they work regardless of whether a page itself or the chrome
toolbar currently has keyboard focus, tab pages included, even though tabs
have no preload/IPC of their own.

## Multi-window support (Ctrl+N)

- Opens a genuinely independent second (third, ...) browser window with its
  own tab strip, its own tabs, its own keyboard shortcuts — not a dialog,
  not a duplicate of the first window.
- **Why this took a real refactor, not just a new `BrowserWindow` call:** the
  app was built around single module-level `win`/`chromeView`/`tabManager`
  variables — fine when only one window could ever exist, but calling
  `createWindow()` a second time the naive way would *reassign* those
  variables to the new window, silently orphaning the first one (its IPC
  handlers, its tray/blocker/pomodoro integration, everything) rather than
  adding a second window alongside it. Every window now gets tracked in a
  `windows` array as `{ win, chromeView, tabManager, isPrimary }`, and IPC
  handlers that act on tabs/groups/menus resolve *which* window sent the
  request via `contextForSender(event.sender)` instead of assuming there's
  only one.
- **Scoped deliberately — secondary windows get tabs and chrome only.** The
  workspace sidebar and the AI chat sidebar stay exclusive to the first
  (primary) window; Settings, the Pomodoro timer window, and the Usage
  Dashboard were already single global utility windows and are unaffected
  either way. Giving every window its own independent open folder or its own
  chat sidebar/history would mean real product decisions (does opening a
  folder in one window show it in both? one shared chat history or separate
  ones per window?) that are genuinely yours to make, not something to
  presume an answer to. Ask for it directly and it's a reasonable follow-up.
- Site blocking, the Pomodoro timer, Focus Mode, and usage-time tracking are
  all still single, truly app-wide state shared across every window, exactly
  as you'd want — blocking applies session-wide regardless of which window's
  tab navigates, and usage tracking follows whichever window currently has
  OS focus.
- **Known rough edge:** if the *first* window specifically is closed while a
  secondary window remains open, features tied to "the primary window"
  (workspace/AI sidebars, sidebar drag-resize) don't get promoted to the
  remaining window — they just become unavailable until a window that was
  primary reopens. Not a crash, just a gap; fully solving it (promoting a
  surviving window to primary) wasn't attempted this round.

## Packaging groundwork (Milestone 10)

- `npm run build:icon` generates `build/icon.ico` — a hand-rolled
  multi-resolution (16/32/48/256px) icon using the exact same PNG-encoding
  technique as the tray icon (`src/main/trayIcon.js`), wrapped in a
  hand-built ICO container (`scripts/build-icon.js`), rather than shipping a
  binary asset or pulling in an image-conversion package. Already generated
  and committed, so `npm start` picks it up immediately — every
  `BrowserWindow` this app creates now uses it instead of Electron's default.
- `npm run dist` runs `electron-builder` with a Windows NSIS-installer config
  in `package.json`'s `build` field. Not run as part of building this
  feature — packaging is a meaningfully heavier, slower operation than
  anything else in this pass, worth running deliberately when you're ready,
  not as a side effect of a "polish" request.
- **`electron-updater` (auto-update) is intentionally not wired up.** It
  needs a release-hosting decision — GitHub Releases is the path of least
  resistance if you want it (that's what `electron-updater`'s built-in
  provider expects), but this project isn't in a git repo yet, let alone
  pushed anywhere, so there's nowhere for it to check against. Worth doing
  once that's settled, not before.

## What's NOT here yet (later milestones from the original plan)

- `electron-updater` auto-update wiring (see Packaging groundwork above for why)

## Where things live

- `src/main/main.js` — window creation (multi-window aware), chrome view
  setup, IPC wiring, tray, custom-protocol registration, settings/pomodoro
  window management, native popup menus, global keyboard shortcut dispatch
- `src/main/tabManager.js` — all tab/group state and view lifecycle,
  including freeze/thaw (Milestone 8), the right-side AI chat sidebar slot,
  and the closed-tab stack (Ctrl+Shift+T)
- `src/main/store.js` — single JSON settings file under
  `app.getPath('userData')`, namespaced per feature
- `src/main/blocker.js` — blocklist/allowlist matching + the `webRequest` hook
- `src/main/pomodoro.js` — timer state machine (work/short break/long break),
  notifications
- `src/main/trayIcon.js` — runtime PNG generation for the tray dot icon
- `src/main/focusMode.js` — Focus Mode enabled/tab-limit state
- `src/main/reader.js` — the content-extraction script and reader HTML template
- `src/main/workspace.js` — folder picker + scoped fs read/write for the sidebar
- `src/main/profiles.js` — Launch Profiles CRUD + `child_process.exec` launching
- `src/main/usageStats.js` — attention-time tracking + day/week query helpers
- `src/main/history.js` — visit recording + search ranking for autocomplete
- `src/chrome/` — the browser's own UI (tab strip + toolbar). Plain HTML/CSS/JS,
  no framework — kept that way deliberately for a UI this small
- `src/preload/chrome-preload.js` — the only bridge between the chrome UI and
  Electron/Node. Regular tabs get no preload and no Node access at all
  (`contextIsolation` + `sandbox`), since they load arbitrary untrusted sites
- `src/pages/newtab.html` — blank/plain new-tab page (kept as-is since
  Milestone 4, see above)
- `src/pages/blocked.html` — the blocked-site page and friction override
- `src/settings/` — Settings window (blocklist/allowlist editor, Focus Mode,
  Pomodoro durations + auto-focus, Launch Profiles), its own preload with
  full IPC access (trusted app UI, not untrusted web content)
- `src/pomodoro/` — the mini timer window, same trusted-preload pattern
- `src/workspace/` — the sidebar UI (file tree + editor), same trusted-preload
  pattern, its fs calls funneled through `src/main/workspace.js`
- `src/dashboard/` — the Usage Dashboard window, same trusted-preload pattern
- `src/aiChat/` — the AI chat sidebar UI shell, same trusted-preload pattern
- `scripts/build-icon.js` — generates `build/icon.ico` (see Packaging
  groundwork above); standalone, doesn't touch anything under `src/`

## Known limitations (fine for v2/v3, not oversights)

- Tab groups: create/assign/remove/close only — no drag-to-reorder, no
  collapse/expand
- Keyboard shortcuts cover the list asked for (Ctrl+T/W/Shift+T/Tab/1-8/N) —
  no Ctrl+L (focus address bar), no Ctrl+9 (jump to last tab), no
  Ctrl+Shift+W (close window); reasonable next adds, not attempted here
- Nothing persists between launches except settings/usage-stats/history data —
  tabs, groups, and which window is "primary" all still reset every start
- Blocklist wildcards are glob (`*`), not real regex — deliberate, to avoid
  letting a user-typed pattern cause catastrophic backtracking against every
  navigation. Covers the common cases (`*.example.com`) without that risk
- Temporary unlocks from the friction override are in-memory only — restarting
  the app re-blocks everything you'd unlocked, which is arguably a feature
- Pomodoro state (phase, time remaining, cycle count) doesn't persist across
  restarts — only the configured durations do
- Reader view's extraction is a simple density heuristic, not Mozilla
  Readability — it'll miss multi-column layouts, JS-rendered content that
  hasn't finished loading, and comment sections that happen to score high on
  text density. Good enough for typical blog/news article pages, not a
  general-purpose Readability replacement
- Focus Mode's "strip visual noise" only hides the Group button — this
  browser has no bookmarks bar or extensions row for it to hide, since those
  were never built (not a Milestone 4 gap, a Milestone 1 scope choice)
- The tab-limit nudge is a one-shot toast at the moment you cross the
  threshold, not a persistent banner — if you miss it, there's no other
  indicator that you're over the limit until you open one more tab
- Workspace sidebar's editor is a plain textarea — no syntax highlighting, no
  line numbers, no multi-file tabs (opening a new file replaces the current
  one, with a confirm prompt if unsaved)
- Sidebar drag-resize has a hard 15s cutoff and ends on window blur as safety
  nets for detecting mouse-release — in the pathological case where neither
  fires (e.g. releasing the button while the window still has focus and the
  cursor lands exactly on the boundary pixel), the drag would keep tracking
  until one of those nets catches it rather than ending instantly. Not
  something a normal drag gesture should trigger, but worth knowing it's a
  possibility rather than a guarantee of instant release
- Launch Profiles run commands with zero validation or sandboxing beyond "you
  typed it yourself" — there's no dry-run, no confirmation dialog before
  launch, and a typo'd destructive command would run exactly as typed. Same
  trust model as a terminal, not a safety net on top of one
- Tab freezing has no exception list — a frozen tab that was playing audio,
  mid-upload, or holding a websocket open loses all of that the instant it's
  frozen, same as closing and reopening the tab would. There's no "don't
  freeze tabs that are doing something" heuristic; it's purely idle-time-based
- Frozen-tab state (which tabs are frozen, their captured scroll position)
  doesn't persist across app restarts — every tab starts fresh (unfrozen) on
  launch, same as the rest of the tab/group state
- Usage tracking has no idle detection — a focused, untouched window keeps
  accruing time on whatever tab is active, same as most simple time trackers
  without an OS-level idle hook (see Usage dashboard above)
- History search is plain substring + recency/frequency weighting, not a real
  fuzzy-match engine — a typo won't find the right page the way a browser's
  URL bar with proper fuzzy matching might
- Autocomplete's dropdown pushes the page content down/back rather than
  floating over it (see Address bar history + autocomplete above for the
  reasoning) — a real floating overlay is a reasonable next step but wasn't
  attempted this round given the inability to visually verify cross-window
  positioning here
- AI Chat is a UI shell — no real provider call happens yet, see AI Chat
  sidebar above. Chat history is session-only too (in-memory, resets when
  the sidebar closes or the app restarts) — no reason to persist placeholder
  conversations
- Multi-window (Ctrl+N) scoping: secondary windows can't open the workspace
  or AI chat sidebars, and closing the original primary window while a
  secondary one remains open leaves those primary-only features unavailable
  rather than migrating to the survivor — see Multi-window support above
- Toolbar visibility settings only cover the 7 optional feature buttons —
  core navigation (back/forward/reload/address bar), Settings, and Workspace
  were never candidates for hiding, so there's no toggle for them
- `npm run dist` config is untested end-to-end in this environment (running
  a real `electron-builder` packaging pass is a meaningfully heavier
  operation than anything else here, and wasn't run as a side effect of
  writing the config) — the `build/icon.ico` generation *was* run and its
  container format verified byte-by-byte, but the NSIS installer step itself
  hasn't actually been produced and inspected

## Honesty check on testing

Every new/changed file passed `node --check` (syntax-clean), and `electron .`
was launched from this environment to confirm the main process doesn't throw
on startup (no require errors, no uncaught exceptions) — the only console
output was Chromium disk-cache/GPU-sandbox warnings, a byproduct of running
Electron in this non-interactive shell (no real desktop session) and unrelated
to the app code. Milestones 2 and 3 were confirmed working end-to-end by
manual testing in a real session; the bug reports that led to earlier fixes
(launcher menu, profile cwd) came from that same kind of real-session
testing, so those root causes are solid. `build/icon.ico`'s container format
was independently verified (parsed the header/entry table back out of the
generated file and confirmed every offset/size lines up, including the file's
total length matching exactly). Everything else from the native-menu fixes
onward — including this round's multi-window refactor, which is the largest
and riskiest change in this pass — has only had the startup-level check, not
a click-through. Worth a real pass, roughly in order of "most likely to
actually be broken":

- **Multi-window (Ctrl+N) specifically:** open a second window, confirm it
  has its own working tab strip and its own keyboard shortcuts; confirm the
  *first* window keeps working normally afterward (this is exactly the
  regression the refactor exists to prevent — the naive approach would have
  broken the first window's IPC silently the moment a second window opened);
  confirm tab-limit/toast/freeze/reader-mode toasts appear in the window that
  triggered them, not always the first one; confirm blocking/Pomodoro state
  stays shared and consistent across both windows; close the second window
  and confirm the first is unaffected
- **Keyboard shortcuts:** Ctrl+T/W/Shift+T/Tab/1-8 from both the chrome
  toolbar *and* while focus is inside a page (e.g. a text field on a real
  site) — confirm they still fire and don't also type into that field
- **AI Chat sidebar:** open it, confirm it resizes independently of the
  workspace sidebar (both open at once shouldn't visually collide under
  normal window widths), confirm the Settings form persists provider/key/
  model, confirm the placeholder send/receive loop works
- **Toolbar visibility settings:** hide a few buttons, confirm they actually
  disappear and Settings/Workspace never do, confirm the choice survives a
  restart
- **New-tab auto-focus + "+" button position:** open a new tab and confirm
  you can start typing immediately without clicking; confirm the "+" button
  sits right next to the last tab with 1-2 tabs open, not stranded at the
  far right
- **Address bar autocomplete:** type a few characters of a site you've
  actually visited, confirm suggestions appear, confirm the chrome strip
  visibly grows to fit them and shrinks back on Escape/blur/selection,
  confirm arrow keys move the highlight and Enter/click both navigate
  correctly
- **Usage dashboard:** browse a couple of real sites for a minute or two,
  open the 📊 dashboard, confirm today's bar list and the 7-day chart show
  something plausible; switch away from the app window (blur) and confirm
  time stops accruing while it's unfocused; try both "Clear" buttons
- **Sidebar drag-resize:** grab the handle at the sidebar's right edge and
  drag both wider and narrower; confirm it tracks smoothly and releasing the
  mouse actually stops the drag
- Explorer toggle: confirm it's actually noticeable now, and that collapsing
  it gives the editor the full height
- Rocket menu: confirm it now actually shows saved profiles and launches them;
  right-click a tab and confirm the context menu (groups, freeze, close) shows
  up fully instead of getting clipped
- Launch a profile with a working directory set and confirm `code .` (or
  similar) opens *that* folder, not the Focus Browser source tree
- Tab freezing: right-click a background tab → "Freeze tab", confirm it goes
  dim with a ❄, click it and confirm it reloads with scroll position restored;
  confirm the active tab is never frozen
- Reader button on an actual article page (extraction quality, exit via
  button/back/address-bar all correctly leave reader mode); separately,
  confirm reader mode doesn't reset the usage-tracking clock or show up as a
  history entry
- Pomodoro auto-focus: turn on the Settings checkbox, start a work session,
  confirm blocking/Focus Mode turn on; let (or skip to) a break and confirm
  they revert correctly; confirm pausing mid-session does *not* lift blocking
