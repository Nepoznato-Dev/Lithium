# Lithium File Tree Refactor

Tracking document for breaking large flat files into organized directory trees.

## Tasks

### 1. core.js — Data-driven WASM facades
- [x] Extract shared helpers into `src/lib/coreHelpers.js`
- [x] Rewrite `src/lib/core.js` with one-liner facade pattern
- [x] Gate `console.log` behind `import.meta.env.DEV`
- [x] Build verification

### 2. web.py — Extract runtime_override_script()
- [x] Create `backend/app/routers/runtime_override.js` template
- [x] Replace inline JS string in `web.py` with template loader
- [x] Build verification

### 3. ModelHubApp.jsx (1,014 lines) → `src/Components/Desktop/Apps/ModelHubApp/`
- [x] Extract `index.jsx` (main shell + routing)
- [x] Extract `PlaygroundView.jsx`
- [x] Extract `Sidebar.jsx`
- [x] Extract `ModelsView.jsx` + `LocalServerModels.jsx`
- [x] Extract `ConnectionsView.jsx`
- [x] Extract `MemoryView.jsx`
- [x] Extract `HistoryView.jsx`
- [x] Extract `WidgetApiChips.jsx`
- [x] Extract `prompts.js`
- [x] Update imports + build verification

### 4. Settings.jsx (1,193 lines) → `src/pages/Settings/`
- [x] Extract `index.jsx` (main shell)
- [x] Extract `controls.jsx` (shared UI controls)
- [x] Extract section components into `sections/`
- [x] Update imports + build verification

### 5. Music.jsx (804 lines) → `src/pages/Music/`
- [x] Extract `index.jsx` (main shell)
- [x] Extract `useMusicState.js` (state + effects)
- [x] Extract `useSoloist.js` (Soloist device logic)
- [x] Extract UI panels: Toolbar, Library, Player, NowPlaying, Settings
- [x] Extract `musicUtils.js`
- [x] Update imports + build verification

### 6. NotesApp.jsx (1,302 lines) → `src/Components/Desktop/Apps/NotesApp/`
- [x] Extract `index.jsx` (main shell)
- [x] Extract `frontmatter.js` + `templates.js`
- [x] Extract `useNotesState.js` + `useNotesActions.js`
- [x] Extract panels: Sidebar, Editor, Toolbar, Graph, Outline, Backlinks, Tags, Search, CmdPalette, Switcher
- [x] Update imports + build verification

### 7. DesktopView.jsx (1,852 lines) → `src/Components/Desktop/DesktopView/`
- [x] Extract `index.jsx` (main shell)
- [x] Extract `wallpapers.js` + `appRegistry.js`
- [x] Extract components: DesktopIcons, NotificationCenter, QuickActionsPanel, WeatherFlyout, StartMenu, Taskbar, TaskbarSettings
- [x] Extract hooks: useDesktopState, useWeather, useDeviceDetection, useKeyboardShortcuts, useContextMenus
- [x] Update imports + build verification

## Notes
- All existing import paths must continue to work (directory `index.jsx` resolves automatically)
- Run `npm run build` after each extraction to verify no breakage
- Dynamic imports (lazy loading) must also be checked
