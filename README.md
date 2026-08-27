# Lithium

Lithium is a lightweight, Chromebook-friendly student hub. The first MVP is
offline-capable and intentionally excludes the media, browser, Minecraft, and
AI modules planned for later phases.

## Development

```bash
npm install
npm run dev
```

Run `npm run build`, `npm run lint`, and `npm test` before submitting changes.

## Hosting

Lithium is configured for common static hosting providers:

- **Vercel:** import the repository; `vercel.json` configures the build and SPA
  fallback.
- **Netlify:** import the repository; `netlify.toml` configures the build,
  publish directory, and client-side route fallback.
- **Replit:** open the repository as a Repl; `.replit` starts Vite on the
  externally reachable host and port.

For production deployments, run `npm run build` and serve the generated
`dist/` directory with SPA fallback routing to `index.html`.

## MVP

The current Phase 11 build includes consent and local authentication, protected
routing, a dashboard, settings, accessibility preferences, calculator, unit
converter, whiteboard, keyboard navigation, and Escape-key panic mode.
`src/config.ts` is the central phase and feature gate; browser persistence is
provided by `src/storage.ts`.

Phase 3 adds the independent study module: IndexedDB-backed notes and
flashcards, an offline dictionary and formula sheet, Pomodoro focus timer, and
scientific calculator.

Phase 4 adds a curated Games & media page with searchable categories, sandboxed
iframe launches, retry handling, local audio/video selection, and panic-mode
media pausing. No large game libraries are bundled.

Phase 5 adds a separately scoped embedded browser with persisted tabs,
`about:blank` startup, HTTPS navigation, loading/error states, retry handling,
and a popup-blocker fallback.

Phases 6–8 are intentionally skipped. Phase 9 adds an opt-in experimental
Risk Insights page with local outcome learning, simple pre-launch signals,
feedback, export, and deletion controls. Predictive features are disabled until
the user explicitly consents.

Phase 10 hardens the application with safe recovery boundaries, resilient
storage writes, focusable main content, and the existing reduced-motion and
high-contrast preferences.

Phase 11 establishes the first stable release boundary: Phases 1–2 are stable,
later modules remain independently releasable, and experimental features stay
disabled unless explicitly opted into. See `CHANGELOG.md` for phase history.
