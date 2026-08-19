# ADR 0001: Single-process local-network MVP

- Status: accepted
- Date: 2026-08-18

## Context

The first classroom test needs one teacher MacBook to serve teacher and student browser interfaces on the same local network. The game requires room/team broadcasts, private clues, fast state updates, and recovery from brief Wi-Fi interruptions. It does not yet require cloud hosting or persistent student data.

## Decision

- Use Node.js 24 LTS and TypeScript.
- Build the teacher and student interface with React and Vite.
- Serve the production web build and Socket.IO endpoint from one Node process.
- Keep the server authoritative and session state in memory.
- Accept the teacher's category and newline-separated topic words in the game screen, validate them at the server boundary, and keep them in memory for the MVP.
- Test pure rules with Vitest and browser flows with Playwright.
- Defer the HTTP routing framework decision until the LAN spike shows what routes are actually needed.

## Implementation note — 2026-08-19

The first vertical slice selected Express 5 for two JSON diagnostics (`/api/health`, `/api/local-ip`), static production assets, and the single-page fallback. Socket.IO remains attached to the same HTTP server and production still uses one process and one port. This is a game-local dependency, not a shared platform decision.

## Consequences

- The teacher has one server process to start and troubleshoot.
- Room and team updates map directly to Socket.IO rooms.
- Restarting the process ends active sessions; this is acceptable for the MVP.
- No cloud dependency or external student-data transfer is introduced.
- File import, a packaged desktop app, SQLite, or a multi-game plugin architecture can be added later only if classroom evidence justifies it.

## Revisit when

- A session must survive a server restart.
- Teachers cannot reliably run the Node-based start flow.
- A second validated game reveals stable shared interfaces.
- Multiple simultaneous classes must run on one host.
