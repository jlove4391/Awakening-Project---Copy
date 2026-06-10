# Legacy Archive

Archived code in this directory is reference-only. It preserves the original implementation so useful patterns can be recovered later, but files here should not be imported directly into the new visual shell without review, cleanup, and intentional integration.

## Active shell entrypoint exception

`Elora-System/src/index.js` is intentionally retained outside the archive as the minimal React entrypoint required by the current `react-scripts` build. It should stay small, import only the shell app and visual styles, and must not reconnect legacy providers, bridge services, voice runtimes, memory engines, or archived implementation modules without review.
