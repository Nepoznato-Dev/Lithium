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

The current Phase 3 build includes consent and local authentication, protected
routing, a dashboard, settings, accessibility preferences, calculator, unit
converter, whiteboard, keyboard navigation, and Escape-key panic mode.
`src/config.ts` is the central phase and feature gate; browser persistence is
provided by `src/storage.ts`.

Phase 3 adds the independent study module: IndexedDB-backed notes and
flashcards, an offline dictionary and formula sheet, Pomodoro focus timer, and
scientific calculator.
