# Focus Browser redesign — master specification

Status: BLUEPRINT. No implementation code exists yet for anything in this document.
This file is self-contained — written to be handed to a fresh session/model with no
memory of the conversation that produced it. Where a decision was made for a reason,
the reason is included; don't relitigate decisions marked final.

This spec covers three initiatives that share infrastructure and must ship in the
order given in "Implementation phases" — do not parallelize Phase 1 with the others,
everything downstream depends on it.

1. **Visual theme system** — Japanese-minimalist/lofi redesign, 3 palettes × light/dark
2. **Settings overhaul** — 11 flat tabs → 7 organized categories, with search
3. **First-run onboarding tour** — 5-slide modal, shown once ever

---

## 0. Ground rules (apply to all three initiatives)

- **No bundler.** This project has never used webpack/vite/esbuild/React and isn't
  starting now. Multi-file JS is loaded via multiple `<script>` tags in load order,
  each file attaching to a shared global namespace object. Do not introduce a build step.
- **No telemetry.** Nothing phones home, ever. Onboarding "completed" state is a local
  boolean, not an analytics event. This app's whole pitch is strictly-local.
- **Preserve the tab-content security boundary.** Regular browser tabs (arbitrary web
  content) get zero preload/IPC access, by design — this is a deliberate, already-shipped
  security invariant, not an oversight to "fix." `newtab.html` and `blocked.html` are
  loaded as regular tab content and must stay that way. Theming reaches them only via
  (a) a URL query string set by the main process at navigation time, and (b)
  `webContents.executeJavaScript()` pushed from the main process on theme change — the
  same mechanism reader mode already uses to reach into tab content. Do not add a
  preload to these two pages to make theming easier.
- **The chrome `WebContentsView` is height-clipped to ~76px.** Any floating UI (menus,
  dropdowns, modals) rendered as HTML inside the chrome view gets invisibly clipped —
  this already caused two real bugs (the launcher menu, the history autocomplete
  dropdown), both fixed by moving to either a native `Menu.popup()` or a real
  `BrowserWindow`. The onboarding tour uses a real `BrowserWindow` for this exact reason.
- **Every pop-up must make the background genuinely unclickable, not just dimmed.**
  This applies to the onboarding window and to every confirm dialog introduced in this
  spec (§2.3's destructive-action confirms, §2.3's agentic-tools confirm). Two
  mechanisms depending on whether the pop-up is a separate window or rendered inside
  an existing one — see §1.7/§3.2 for the window case and §2.3 for the in-window case.
  A scrim with no click-capture (opacity change alone) does not satisfy this rule.
- **Out of scope for this pass:** no bundler, no telemetry/analytics, no native
  title-bar theming (stays OS-drawn), no tray icon retheme (keeps its existing
  phase-encoded colors), no auto-update, no code signing. Do not invent work here.

---

## 1. Visual theme system

### 1.1 Scope

Everything: main chrome, every satellite window (Settings, Usage Dashboard, Pomodoro
timer, Workspace sidebar, AI Chat sidebar), the blocked-site page, and the new-tab page.

### 1.2 Palettes

Three named palettes, each with a light and dark variant (6 total token sets). User
picks a palette plus a **mode** via Settings → Browser → Appearance (see §2). Mode is a
3-way choice — **Light / Dark / System** — not just light/dark; System follows Windows'
own theme setting live (see §1.7). Default on first launch remains **Night lofi, dark**
(unchanged from the original decision) — System is an available option, not the default.

| Palette | Mode | bg | surface | text | muted | border | accent |
|---|---|---|---|---|---|---|---|
| Night lofi | dark | `#211d1a` | `#2a2521` | `#ece6df` | `#a89f92` | `#3a332c` | `#d98b6b` |
| Night lofi | light | `#f2ece2` | `#ffffff` | `#2a221c` | `#8a7f70` | `#e2d8c8` | `#c1734f` |
| Washi and ink | dark | `#1c1a17` | `#262320` | `#ece5d8` | `#9b9082` | `#37322b` | `#d9584a` |
| Washi and ink | light | `#f4ede1` | `#fbf7f0` | `#221f1a` | `#857c6d` | `#e3d8c4` | `#b23a2e` |
| Zen garden | dark | `#1b1f1c` | `#232723` | `#e2e6e2` | `#8b968e` | `#333833` | `#8fb894` |
| Zen garden | light | `#eceeec` | `#f7f8f6` | `#262a27` | `#7c847d` | `#d7dbd6` | `#6f8f74` |

CSS custom property names (namespace `--fb-`, applied to `:root` of each window):
`--fb-bg`, `--fb-surface`, `--fb-text`, `--fb-muted`, `--fb-border`, `--fb-accent`,
`--fb-font-sans`, `--fb-font-serif`, `--fb-font-mono`.

### 1.3 Typography

- **Sans** (UI workhorse, unchanged from today): `-apple-system, "Segoe UI", Roboto, sans-serif`
- **Serif** (headings, new-tab greeting, Settings section titles only): `Georgia, "Iowan Old Style", "Noto Serif", serif`
- **Monospace** (anything numeric that lines up: Pomodoro countdown, new-tab clock,
  Dashboard stats): `ui-monospace, "SF Mono", "Cascadia Code", Consolas, monospace`,
  with `font-variant-numeric: tabular-nums`

### 1.4 Tab strip

Minimal underline style, replacing the current filled rounded-chip tabs:
- No background fill on tabs.
- Inactive tab: `color: var(--fb-muted)`, no underline.
- Active tab: `color: var(--fb-text)`, `border-bottom: 2px solid var(--fb-accent)`.
- Small 6px dot (accent color if active, muted if not) in place of a background swatch
  when no real favicon has loaded yet; swap to the real favicon `<img>` once available
  (reuse existing `.favicon img` handling, don't rebuild it).

### 1.5 Icons

Replace every emoji/HTML-entity glyph app-wide with hand-rolled SVG line icons
(stroke-width 2, round linecaps, 14–15px). **First implementation step is an audit** —
`src/chrome/index.html` is fully inventoried already (see list below), but
`src/main/bookmarksIo.js`, `downloads.js`, `passwords.js`, `privacy.js`, `search.js`
each have associated UI (bookmarks manager, downloads list, etc.) that was not part of
the original milestone documentation and has not been inventoried for glyph usage —
check every HTML file under `src/` before finalizing the icon list.

Known icons needed (chrome toolbar, confirmed from current `index.html`): back,
forward, reload, folder (workspace), bar-chart (dashboard), chat-bubble (AI chat),
gear (settings), leaf (focus mode), rocket (launcher), heart (bookmark), search,
plus (new tab), x (close).

### 1.6 New-tab page ambient content

- **Generative pattern** (replaces a static zigzag/squiggle): a canvas script draws
  3–5 thin curved strokes in `var(--fb-accent)` at 0.12–0.18 opacity. Control points are
  randomized on each page load (new seed every time, not a fixed pattern) and drift
  slowly via sine-offset easing (cheap, no Perlin-noise library — matches this
  project's zero-dependency convention). Animation:
  - Respects `prefers-reduced-motion`: renders one static frame, no `requestAnimationFrame` loop.
  - Pauses via the Page Visibility API when the tab isn't the active/visible one.
  - Capped at 5 strokes — the point is calm, not busy.
- **Time-of-day greeting**, serif, computed client-side from the real `Date` (Still up /
  Good morning / Good afternoon / Good evening / Good night by hour bucket).
- **Monospace clock**, small, below the greeting.
- **Search box**, centered, matches the address-bar visual style.

### 1.7 Architecture — how theme changes propagate

```
Settings -> Appearance (palette swatch click / mode toggle)
   |  IPC: theme:set
   v
src/main/theme.js   (sole owner + mutator of the persisted value)
   |  persists to store.js -> theme: { palette, mode }
   |
   +-> broadcasts theme:changed to every trusted window's webContents
   |     (chrome -- every Ctrl+N window, Settings, Dashboard, Pomodoro,
   |      Workspace, AI Chat, Onboarding if currently open)
   |     each applies new --fb-* vars in place, no reload
   |
   +-> for any tab currently showing newtab.html or blocked.html,
         webContents.executeJavaScript(...) pushes updated theme vars
         directly into that tab (same mechanism reader mode already uses)
```

For **new** navigations to `newtab.html`/`blocked.html`, the main process appends the
current theme as a URL query string (`newtab.html?palette=washi&mode=dark`) at
navigation time. A small inline script in each page reads `location.search` and applies
the tokens locally — no preload, no IPC, per the ground rule in §0.

**"System" mode resolution.** The stored preference (`store.js` `theme.mode`) can be
`'light'`, `'dark'`, or `'system'` — this is the user's *choice*, not the resolved
value. `src/main/theme.js` resolves the actual light/dark to apply at broadcast time:
if `mode === 'system'`, use Electron's `nativeTheme.shouldUseDarkColors`; otherwise use
the stored value directly. `theme.js` also subscribes to `nativeTheme.on('updated', ...)`
and re-runs the broadcast in §1.7 whenever it fires *and* the stored mode is `'system'`
— so toggling Windows' own light/dark setting updates the app live without the user
touching Focus Browser's own Settings at all. When `mode !== 'system'`, the
`nativeTheme` update event is ignored entirely.

### 1.8 File structure

```
src/theme/
  palettes.js      UMD-lite: `if (typeof module !== 'undefined') module.exports = ...`
                   at the bottom, `var FB_PALETTES = {...}` above it. Works as
                   require() in main AND as a plain <script src> global in every
                   renderer. Single source of truth for the 6 token sets in §1.2 --
                   do not duplicate palette values anywhere else, including in the
                   Settings Appearance UI (it must read from this file).
  applyTheme.js    takes {palette, mode} -> sets --fb-* on :root. Used identically
                   by every trusted window and by newtab/blocked's inline scripts.
  icons.js         hand-rolled SVG icon set from the §1.5 audit, same UMD-lite pattern,
                   one named export per icon.

src/main/
  theme.js          get/set current {palette,mode}, wraps store.js's new `theme`
                     namespace, owns the broadcast + executeJavaScript push logic
  store.js           + theme: { palette: 'nightlofi', mode: 'dark' }   (new default)
  main.js             IPC handlers theme:get/theme:set, query-string injection on
                       navigation to newtab/blocked, executeJavaScript push wiring

(every trusted preload -- chrome-preload.js, settings-preload.js, dashboard-preload.js,
 pomodoro-preload.js, workspace-preload.js, aiChat-preload.js, onboarding-preload.js)
  + exposes getTheme() / setTheme() / onThemeChanged(callback) via contextBridge

(every trusted window's own JS + HTML)
  + <script src="../theme/palettes.js"> and <script src="../theme/applyTheme.js">
  + calls applyTheme(await getTheme()) on load, subscribes to onThemeChanged
  + CSS files swap every hardcoded hex value for the matching var(--fb-*)

src/pages/
  newtab.html / newtab.js (new) / newtab.css (new)   greeting, clock, pattern, search
  blocked.html / blocked.js / blocked.css              reskinned only -- the 60s+phrase
                                                          friction-override LOGIC is
                                                          unchanged, do not touch it
```

### 1.9 State management roles

- **Main process (`src/main/theme.js`)** — sole owner and mutator. Persists to the
  existing single JSON settings file (no new storage mechanism). Stores the user's
  chosen mode as `'light' | 'dark' | 'system'` — the *resolved* light/dark value used
  in any given broadcast is computed at broadcast time (see §1.7), never stored
  separately, so there's exactly one source of truth for the preference. Broadcasts
  on change, including OS-driven changes while mode is `'system'`.
- **Trusted renderers** (chrome incl. every Ctrl+N window, Settings, Dashboard,
  Pomodoro, Workspace, AI Chat, Onboarding) — hold no independent state. Fetch once via
  `getTheme()` on load, re-sync via the `theme:changed` push. Never write directly —
  always round-trip through main via `setTheme()`.
- **Sandboxed tab pages** (newtab, blocked) — fully stateless regarding theme. Arrives
  once via URL query params at navigation time; an already-open tab is updated live
  only via the main-process `executeJavaScript` push, never by any state it holds itself.
- **Tray icon** — explicitly out of scope (see §0).

---

## 2. Settings overhaul

### 2.1 Category model (final — 7 categories)

| id | Label | Subsections (id: label) |
|---|---|---|
| `focus` | Focus | `focus-mode`: Focus Mode · `pomodoro`: Pomodoro Timer · `blocking`: Site Blocking |
| `browser` | Browser | `tabs`: Tabs & Memory · `toolbar`: Toolbar · `appearance`: Appearance · `search`: Search Engine · `launcher`: Launch Profiles · `shortcuts`: Keyboard Shortcuts |
| `privacy` | Privacy & Security | `cookies`: Cookies & Site Data · `permissions`: Site Permissions · `clear-data`: Clear Browsing Data *(new)* |
| `passwords` | Passwords | `saved`: Saved Logins · `add`: Add Login |
| `downloads` | Downloads | *(no subsections)* |
| `bookmarks` | Bookmarks | *(no subsections)* |
| `aichat` | AI Chat | `connection`: Connection · `automation`: Automation *(warning tier)* · `checkins`: Check-ins |

Rationale for the two merges (don't re-derive, this was already decided):
- **Focus** groups Focus Mode + Pomodoro + Site Blocking because they already behave as
  one system — the existing "auto-enable Focus Mode + blocking during work sessions"
  toggle proves it. Splitting them across unrelated tabs hides that relationship.
- **Browser** = "how the browser looks and runs day to day": Tabs, Toolbar, the new
  Appearance picker, Search Engine (currently misfiled under Privacy & Data), and
  Launch Profiles (demoted from its own top-level tab — user judged it too niche to
  warrant one, and it fits "browser configuration" as well as anywhere).
- **Passwords, Downloads, Bookmarks** stay standalone — every mainstream browser treats
  these as independently-searched top-level categories; deviating fights users' existing
  muscle memory for no gain.
- **AI Chat** keeps its own category — distinct enough content (3 real subsections)
  to not fit cleanly elsewhere.

**New subsection: Browser → Keyboard Shortcuts.** Pure reference, no toggles, no
controls of any kind — a static two-column list (key combo, action), grouped into
"Tabs & windows," "Page & view," and "Developer" for scanability. Sourced from the
actual dispatch code (`handleGlobalShortcut` in `main.js`, `attachDevToolsToggle` in
`tabManager.js`), not the README (which is missing a few — Ctrl+P print, Ctrl+F find,
Ctrl+=/-/0 zoom, F12/Ctrl+Shift+I DevTools, Ctrl+Shift+N incognito window — all real,
working shortcuts today that just aren't documented anywhere in-app):

| Group | Shortcut | Action |
|---|---|---|
| Tabs & windows | Ctrl+T | New tab |
| Tabs & windows | Ctrl+Shift+T | Reopen closed tab |
| Tabs & windows | Ctrl+W | Close tab |
| Tabs & windows | Ctrl+Tab | Next tab (wraps around) |
| Tabs & windows | Ctrl+1 – Ctrl+8 | Jump to tab by position |
| Tabs & windows | Ctrl+N | New window |
| Tabs & windows | Ctrl+Shift+N | New incognito window |
| Page & view | Ctrl+F | Find in page |
| Page & view | Ctrl+P | Print current tab |
| Page & view | Ctrl+= / Ctrl++ | Zoom in |
| Page & view | Ctrl+- | Zoom out |
| Page & view | Ctrl+0 | Reset zoom |
| Developer | F12 or Ctrl+Shift+I | Toggle DevTools |

This list is display data, kept in `src/main/shortcuts.js` (new, plain UMD-lite data
module — same `require()`-in-main / `<script src>`-in-renderer pattern as
`palettes.js`) as the single source of truth for *display*. It does **not** refactor
`handleGlobalShortcut`'s actual if/else dispatch to read from this table — that's a
reasonable future improvement, not this pass. Whoever edits a shortcut in `main.js` or
`tabManager.js` must update `shortcuts.js` by hand; leave a comment at each dispatch
site pointing to the other, so the two don't quietly drift apart.

### 2.2 Gap found during analysis (not just reorganization)

"Clear Browsing Data" doesn't exist as a unified concept today — per-site cookie
clearing lives in Settings → Privacy & Data, but full browsing **history** clearing
only exists in the Usage Dashboard window (confirmed: `settings-preload.js` only
exposes `clearDownloadHistory`, nothing for browsing history). Add a real
`privacy.clear-data` subsection that clears history + cookies + cache together, wiring
`src/main/privacy.js` + `src/main/history.js`. Decide whether the Dashboard's existing
button becomes a shortcut to this same action or gets removed — either is fine, but the
search index in §2.4 assumes this subsection exists; without it, "delete history" has
nowhere correct to point.

### 2.3 Layout & containment

- **Keep the existing two-column sticky-sidebar shell.** Same paradigm as native
  Windows 11 Settings — users already know it. Do not replace with nested/collapsing
  tree menus; this window has ~30 total controls, not hundreds, a tree adds a
  disclosure step for content that isn't actually that deep.
- **Jump ribbon**: sticky pill row directly under the panel header, present only on
  categories with 3+ subsections (`focus`, `browser`, `privacy`, `aichat`). Absent on
  categories with 1–2 subsections (`downloads`, `bookmarks`, `passwords`) — don't
  manufacture navigation chrome for content that doesn't need it.
- **Card containment, two tiers:**
  - `.card` (existing class, unchanged visual weight) — groups a cohesive set of
    normal controls, e.g. the four Pomodoro duration fields.
  - `.card--warning` (new) — left accent-stripe border in semantic amber/red, a
    persistent (not hover-revealed) inline warning line. Applied to **exactly two**
    controls at launch: AI Chat's "Enable agentic browser tools" toggle (full
    page-script execution) and the Launch Profiles commands textarea (arbitrary shell
    execution). Both are currently presented at the same visual weight as ordinary
    toggles — that mismatch is a real bug in the current design, not a cosmetic gap.
  - `<details>`/accordion, collapsed by default — reserved for rare-path content only
    (bookmarks import/export, the custom search-engine URL field, which already
    conditionally shows/hides today — formalize that as the general pattern). The
    agentic-tools toggle gets **both** treatments: collapsed by default *and* wrapped
    in `.card--warning` once expanded, since it's the single riskiest control in the app.
- **Confirm-before-destructive-action** (new pattern, third alongside cards and the
  jump ribbon): any action that deletes/wipes data without an undo — the new
  `privacy.clear-data` action from §2.2, deleting a saved password, "Clear Download
  History" — requires an explicit confirm step before it fires. Clicking the action
  never executes it directly.
- **Enabling the agentic-tools toggle requires a second explicit step, not just a
  click.** Visual weight (`.card--warning`) signals risk but doesn't prevent an
  accidental click from enabling full page-script execution. Clicking the toggle opens
  a confirm with a checkbox reading "I understand this lets AI run scripts on my open
  tabs" — the toggle only actually switches on if that confirm is accepted. This is the
  single control in the app that gets this treatment; it's proportionate to what it
  grants, not a pattern to reuse elsewhere without similar justification.
- **Confirm UI mechanism, and how it satisfies the §0 modality rule:** confirms
  triggered from within the Settings window (both kinds above) render as an in-window
  modal overlay — a full-panel scrim behind a centered themed confirm card — rather
  than a native `dialog.showMessageBox`, so it stays visually consistent with the rest
  of the redesign instead of popping an unstyled OS dialog. The overlay must actually
  capture pointer events (not just visually dim the background), and the rest of the
  Settings window's content gets the HTML `inert` attribute applied for the confirm's
  duration, so neither clicks nor keyboard/tab focus can reach anything underneath it.
  This is a Settings-window-local mechanism, distinct from the onboarding window's
  OS-level `parent`/`modal: true` (§3.2) — the onboarding case blocks a *different*
  window (the main browser), so it needs real window modality instead.

### 2.4 Search system

**Index shape** — one JSON entry per searchable control, not per panel:

```json
{
  "id": "clear-browsing-data",
  "category": "privacy",
  "section": "Clear Browsing Data",
  "label": "Clear browsing data",
  "keywords": ["delete history", "wipe cache", "clear cookies", "erase data", "reset browser", "remove history", "clear data"],
  "anchor": "panel-privacy#clear-browsing-data",
  "controlId": "privacy-clear-all-btn"
}
```

**Matching algorithm**, priority order (mirrors `history.js`'s existing
substring + recency-style scoring approach for consistency with the rest of the app):

1. Normalize query — lowercase, strip punctuation, collapse whitespace.
2. Score every entry: **+3** exact substring match on `label`, **+2** substring match
   on any `keywords` entry, **+1** fuzzy token match (edit distance ≤ 2, only for
   tokens ≥ 4 characters, to avoid noisy short-word collisions).
3. Sort descending, cap at 6 results, group by category with a breadcrumb under each
   hit (e.g. `Privacy & Security › Clear Browsing Data`).
4. **Zero-result state**: show "No settings found for '{query}'" plus the category
   list — never a blank dead end.

**Alias → destination examples** (behavior spec, not exhaustive):

| User types | Resolves to |
|---|---|
| `delete history`, `wipe cache`, `clear cookies` | Privacy & Security → Clear Browsing Data |
| `block facebook`, `blocklist` | Focus → Site Blocking |
| `api key`, `claude key`, `openai key` | AI Chat → Connection |
| `let ai control my browser` | AI Chat → Automation *(surfaces the warning card and its confirm step, doesn't bypass either)* |
| `generate password`, `strong password` | Passwords → Add Login |
| `dark mode`, `theme`, `colors` | Browser → Appearance |
| `default search`, `change search engine` | Browser → Search Engine |
| `memory`, `freeze tabs`, `ram usage` | Browser → Tabs & Memory |
| `launch profile`, `open vscode` | Browser → Launch Profiles |
| `shortcuts`, `hotkeys`, `keyboard commands`, `reopen closed tab` | Browser → Keyboard Shortcuts *(the last one also flash-highlights that specific row, not just the panel)* |
| `session timeout` *(doesn't exist)* | Zero-result state, not a false match |

**On selecting a result**: switch category, `scrollIntoView` the anchor, and briefly
flash-outline (~1.5s fade) the specific control's nearest `.card` ancestor — landing in
the right category but making the user hunt visually for the toggle defeats the point.

### 2.5 Backend ownership map

Existing main-process modules — reuse, do not recreate:

```
focus.focus-mode    -> src/main/focusMode.js
focus.pomodoro       -> src/main/pomodoro.js
focus.blocking        -> src/main/blocker.js
browser.tabs            -> src/main/tabManager.js (freeze logic)
browser.toolbar          -> src/main/store.js (booleans only, no dedicated module)
browser.appearance         -> src/main/theme.js            [NEW, see Section 1]
browser.search               -> src/main/search.js
browser.launcher                -> src/main/profiles.js
browser.shortcuts                 -> src/main/shortcuts.js   [NEW, static display data only]
privacy.cookies                   -> src/main/privacy.js
privacy.permissions                 -> src/main/privacy.js
privacy.clear-data                    -> src/main/privacy.js + src/main/history.js   [NEW wiring]
passwords.*                             -> src/main/passwords.js
downloads.*                               -> src/main/downloads.js
bookmarks.*                                 -> src/main/bookmarksIo.js
aichat.connection                             -> src/main/aiChat.js
aichat.automation                               -> src/main/aiChat.js
aichat.checkins                                   -> src/main/activityLog.js
```

### 2.6 File structure

```
src/settings/
  index.html         sidebar shell (7 nav buttons + search input) + 7
                      <section id="panel-{category}"> containers
  settings.js          boot/router only: category switching, search-box wiring,
                        lazily calls into panels/*.js -- does not itself contain
                        per-category control logic anymore
  settings.css          shell + shared .card / .card--warning / .jump-ribbon /
                        .confirm-overlay styles
  confirmOverlay.js      shared in-window modal helper (§2.3): show(message, {checkboxLabel?})
                          -> Promise<boolean>, applies/removes `inert` on the rest of
                          the window, traps focus. Used by both the destructive-action
                          confirms and the agentic-tools confirm -- one implementation,
                          not duplicated per call site.
  panels/
    focus.js             registers into window.SettingsPanels.focus
    browser.js             registers into window.SettingsPanels.browser
                              (absorbs the former launcher.js panel as its
                              `launcher` subsection; renders the static
                              `shortcuts` subsection from src/main/shortcuts.js,
                              no controls, no state)
    privacy.js               registers into window.SettingsPanels.privacy
    passwords.js                registers into window.SettingsPanels.passwords
    downloads.js                  registers into window.SettingsPanels.downloads
    bookmarks.js                    registers into window.SettingsPanels.bookmarks
    aichat.js                         registers into window.SettingsPanels.aichat
  searchIndex.js         the JSON array from Section 2.4, plain data, no build step
```

Loading model: `index.html` loads each `panels/*.js` via individual `<script>` tags
(no bundler — see §0). Each panel file attaches an `init(container)` function to
`window.SettingsPanels.<id>`. `settings.js` calls `SettingsPanels[activeCategory].init()`
once, lazily, on first visit to that category — not all 7 eagerly on window load.

### 2.7 UI state rules

- `activeCategory` — one of the 7 category ids. Persisted to `store.js`
  (`settings.lastOpenCategory`) so reopening Settings returns to the last tab, not
  always Focus. Not synced across windows — each Settings window instance is
  independent (matches the existing per-window-instance precedent, e.g. sidebar width).
- `activeSubsection` — string or null. **Not persisted** — always resets to the top of
  a category on fresh open; only set mid-session via jump-ribbon click or search
  navigation.
- `searchQuery` — ephemeral, never persisted, cleared when a result is selected or the
  window closes.
- **Warning-tier controls** (agentic-tools toggle, launcher commands field): render
  collapsed via `<details>` on *every* fresh panel open — this is deliberately not
  "remember if I expanded it last time" state, so it's never enabled by muscle-memory
  scrolling past a previously-expanded section.
- **Search input auto-focuses on window open** (`DOMContentLoaded`) — matches the
  app's existing keyboard-first bias (Ctrl+T/W/Shift+T/Tab/1–8/N); typing should work
  the instant the Settings window appears, no click into the search box required.
  Opening a confirm overlay (above) moves focus into the confirm card instead, and
  restores focus back to search (or wherever it was) when the confirm closes.

---

## 3. First-run onboarding tour

### 3.1 Content (5 slides, each tied to a real shipped feature)

1. **Welcome / thesis** — "A browser built to help you finish things." One line on
   what makes it different: real friction, automatic focus sessions, strictly local.
2. **Site blocking** — "Blocking that's actually hard to click through." Explains the
   60-second-plus-phrase override and why it's deliberate (an instant toggle gets
   clicked past in the exact moment you're trying to resist).
3. **Pomodoro + Focus Mode** — "Work sessions that lock in your blocking automatically."
   Explains the auto-enable/auto-revert integration, points to Settings → Focus.
4. **Workspace, Launch Profiles, AI Chat** — "Your project files and tools, one click
   away." Covers all three "bring your own tools" features together.
5. **Dashboard + wrap-up** — "See where your time actually goes." Mentions the Usage
   Dashboard, closes with "everything else lives in Settings — search finds any
   setting by name." Primary button: **Get started**.

### 3.2 Layout & interaction

- A dedicated small modal `BrowserWindow` (~560×420), `parent`/`modal: true` against
  the primary window — **not** rendered inside the chrome view (see §0's clipping rule).
- Top-right persistent **Skip**. Bottom: 5-dot progress indicator, Back (disabled on
  slide 1), Next → becomes **Get started** on slide 5.
- Keyboard: →/Space = next, ← = back, Esc = skip.
- Renders using the *default* palette (Night lofi, dark) — first run means no theme
  preference exists yet, so it just calls the same `applyTheme()` contract every
  trusted window uses (see §1.9); no special-casing needed.
- Respects `prefers-reduced-motion`: crossfade only between slides, no slide/parallax
  motion, when set.

### 3.3 State rules

- `store.js` gains `onboarding: { completed: boolean, completedAt: string|null }`.
- On app start, after the primary window is created: if `!completed`, create and show
  the onboarding window.
- **Skip and Finish both set `completed = true`** — there is no separate skipped-vs-
  completed tracking (consistent with zero telemetry anywhere else in this app). Once
  dismissed either way, it never auto-shows again.
- Settings sidebar gets a small persistent **"Show welcome tour"** link below the 7
  category buttons — manually replays the same window without touching `completed`.

### 3.4 File structure

```
src/onboarding/
  index.html
  onboarding.js
  onboarding.css
  onboarding-preload.js     exposes dismiss(reason: 'completed'|'skipped') via contextBridge
src/main/onboarding.js       get/set completed flag (store.js), creates the modal window
```

---

## 4. Consolidated directory map

Every new or touched file across all three initiatives, merged into one tree so there's
a single mental model (files appear once even if touched by more than one initiative):

```
src/theme/                     [NEW — Section 1]
  palettes.js
  applyTheme.js
  icons.js

src/main/
  theme.js                      [NEW]
  onboarding.js                  [NEW]
  shortcuts.js                     [NEW — static display data for the Browser →
                                     Keyboard Shortcuts subsection, UMD-lite like
                                     palettes.js; not wired into the actual dispatch
                                     logic in this same file's handleGlobalShortcut]
  store.js                        [MODIFIED: + theme{}, + onboarding{}, + settings.lastOpenCategory]
  main.js                           [MODIFIED: theme IPC, query-string injection, executeJavaScript
                                      push, onboarding startup check + window creation]

src/onboarding/                 [NEW — Section 3]
  index.html / onboarding.js / onboarding.css / onboarding-preload.js

src/settings/
  index.html                     [MODIFIED: 7 nav buttons, search input, panel containers]
  settings.js                      [MODIFIED: becomes boot/router only]
  settings.css                       [MODIFIED: + .card--warning, + .jump-ribbon,
                                        + .confirm-overlay, + var(--fb-*)]
  confirmOverlay.js                    [NEW — shared in-window modal helper, §2.3]
  searchIndex.js                         [NEW]
  panels/                                  [NEW dir — one file per category, 7 total]
    focus.js / browser.js / privacy.js / passwords.js / downloads.js / bookmarks.js / aichat.js

src/chrome/                     [MODIFIED throughout: tab underline style, icons.js,
  chrome.css / chrome.js / index.html    var(--fb-*), remove emoji/entity glyphs]

src/dashboard/  src/pomodoro/  src/workspace/  src/aiChat/
  *.css / *.js / index.html      [MODIFIED: var(--fb-*), icons.js, mono type for numeric readouts,
                                   theme:changed subscription]

src/pages/
  newtab.html / newtab.js (new) / newtab.css (new)    [Section 1.6]
  blocked.html / blocked.js / blocked.css              [reskin only, friction logic untouched]

(every trusted preload)          [MODIFIED: + getTheme/setTheme/onThemeChanged]
  chrome-preload.js, settings-preload.js, dashboard-preload.js, pomodoro-preload.js,
  workspace-preload.js, aiChat-preload.js, onboarding-preload.js
```

---

## 5. Implementation phases (sequencing is load-bearing, not a suggestion)

**Phase 0 — Icon/glyph audit.** Grep every HTML file under `src/` for emoji and HTML
entity glyphs (not just `src/chrome/index.html`, which is already fully inventoried in
§1.5). Produce the final icon list before writing `src/theme/icons.js`.

**Phase 1 — Theme foundation.** `src/theme/palettes.js`, `applyTheme.js`, `icons.js`;
`src/main/theme.js` including the `'system'` mode resolution + `nativeTheme.on('updated', ...)`
subscription (§1.7); `store.js` `theme` namespace; IPC (`theme:get`/`theme:set`/
`theme:changed`); query-string delivery + `executeJavaScript` push for newtab/blocked.
Nothing visual changes yet — this phase is plumbing only, verified by confirming a
manual `setTheme()` call actually updates `--fb-*` on every open window, and that
toggling Windows' own theme updates the app live when mode is `'system'`.

**Phase 2 — Reskin.** Apply the new tokens/typography/tab style/icons to every existing
window and page: chrome, Settings shell (visual only, not yet restructured), Dashboard,
Pomodoro, Workspace, AI Chat, new-tab (incl. the generative pattern), blocked page.
This is the phase where the app visually becomes the new theme.

**Phase 3 — Settings restructure.** Split `settings.js` into `panels/*.js`, rebuild
`index.html`'s nav to 7 categories, implement the jump ribbon, `.card--warning` tier,
`confirmOverlay.js` and its two call sites (destructive-action confirms, the
agentic-tools checkbox-confirm), the Appearance subsection with its 3-way Light/Dark/
System control (wires to the Phase 1 theme IPC), the Launch Profiles subsection (moved
content, not new content), search-input auto-focus, and the search system (§2.4).

**Phase 4 — Onboarding.** Build `src/onboarding/*`, `src/main/onboarding.js`, the
startup check, and the Settings "Show welcome tour" replay link. Last, because its
closing slide references the Settings search system from Phase 3, and it renders using
the Phase 1 theme contract.

Do not start Phase 2 before Phase 1 is verified working, and do not start Phase 4
before Phase 3 — the dependency is real, not procedural caution.

## 6. Acceptance criteria

- Switching palette/mode in Settings → Appearance updates every currently-open window
  (chrome, Settings itself, Dashboard, Pomodoro, Workspace, AI Chat) live, no reload.
- Opening a new tab after a theme change shows the new theme immediately; a new-tab
  page that was *already open* before the change also updates live.
- No emoji or HTML-entity glyphs remain anywhere under `src/` after Phase 0/1's audit
  is fully applied.
- Settings has exactly 7 top-level categories matching §2.1; every control from the
  original 11-tab layout still exists somewhere (nothing silently dropped).
- Typing `delete history`, `dark mode`, and `generate password` into Settings search
  each produce the correct single top result per the §2.4 alias table.
- A fresh install (no existing `store.json`) shows the onboarding window once; closing
  it via Skip or Get Started means it never appears again on subsequent launches.
- The regular-tab security boundary is unchanged: `newtab.html` and `blocked.html`
  still load with zero preload/IPC access.
- With Appearance mode set to **System**, toggling Windows' own light/dark setting
  (Settings → Personalization → Colors) updates Focus Browser live, without reopening
  anything. Switching mode away from System stops it from reacting to further OS changes.
- Clicking "Clear Browsing Data" (or any other newly-added destructive action) always
  shows a confirm first; dismissing/canceling it changes nothing.
- Clicking the AI Chat agentic-tools toggle does not enable it by itself — it only
  switches on after the checkbox-confirm is explicitly accepted.
- While the onboarding window or any confirm overlay is open, clicking anywhere in the
  background (the rest of the Settings panel, or the main browser window behind
  onboarding) has no effect until the pop-up is dismissed — verified by literally
  trying to click a background button while each is open.
- The Settings search input has keyboard focus the instant the window opens, with no
  click required first.
- Browser → Keyboard Shortcuts lists all 13 shortcuts in §2.1's table, correctly
  grouped, with zero interactive controls on the page — it's read-only reference
  content, not a settings form.
