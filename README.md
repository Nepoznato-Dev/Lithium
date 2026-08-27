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

## MVP

The current Phase 2 build includes consent and local authentication, protected
routing, a dashboard, settings, accessibility preferences, calculator, unit
converter, whiteboard, keyboard navigation, and Escape-key panic mode.
`src/config.ts` is the central phase and feature gate; browser persistence is
provided by `src/storage.ts`.
