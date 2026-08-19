# ADR 0002: Reuse the proven local-network baseline

- Status: accepted
- Date: 2026-08-18

## Context

The `school-quiz-game` project at `/Users/jonyeock/Desktop/Programming/anti/school-quiz-game` has already been used with student devices connecting to a teacher MacBook by local IP on the same Wi-Fi network. A separate feasibility spike would repeat a proven result.

The reference implementation demonstrates:

- Vite listening on local interfaces with `server.host: true`
- browser clients deriving the server host from `window.location.hostname`
- Node discovering a non-loopback IPv4 address through `os.networkInterfaces()`
- the teacher UI generating a QR URL containing the LAN IP and room PIN
- Socket.IO communication between teacher and student browsers

## Decision

- Mark general LAN feasibility as verified and, after the selected game's one-page design is complete, start with its MVP vertical slice.
- Reuse the behavior and operational lessons, not copy the reference code wholesale.
- During development, allow separate web/server ports with a proxy if useful.
- In the classroom production path, prefer one Node process, one port, and same-origin HTTP and Socket.IO.
- Keep one Classlation-specific real-device check in the vertical-slice acceptance criteria because QR paths, ports, and reconnect behavior can regress independently.

## Consequences

- Development proceeds from game design to room creation and gameplay without a separate Hello-world network spike.
- Same-origin production serving reduces hard-coded port and CORS configuration.
- The known reference app provides a working comparison point when LAN discovery or QR entry fails.
