# Classlation Agent Instructions

## Product goal

Build a local-network classroom web game that gives students different information so they must speak and collaborate offline.

`Classlation` is a temporary working name. Keep product naming isolated from domain logic so the repository can be renamed later.

## Source of truth

- Execution plan: `/Users/jonyeock/Documents/LifeOS/Domains/Development/Plans/Classlation-MVP-개발-계획.md`
- Product concept: `/Users/jonyeock/Documents/LifeOS/Projects/교실 협업 게임(테셀레이션 프로젝트 기획).md`

Read only the sections needed for the current task.

## Current scope

Research and design games before building a platform or hub. Start each selected game as an independent app. Extract shared code only after the same need appears in at least two or three implemented games.

The current first-game hypothesis is `Classroom Liar`, a communication-first classroom adaptation of the liar/impostor pattern. Its active brief is `docs/features/classroom-liar-game.md`. Keep teacher authoring to a category and newline-separated topic words.

If selected, prioritize this flow:

1. Teacher starts a server on a MacBook.
2. Students on the same network join by QR or room code without accounts.
3. The teacher closes entry and assigns teams before the game starts.
4. Students see their team and teammates, then physically move together before any secret is revealed.
5. Each team receives one liar; other students receive the team's topic word.
6. Students put devices down and handle clue-giving and questions face to face without per-turn completion buttons.
7. One student or the teacher starts secret voting for the whole team.
8. A caught liar says one final topic guess aloud, then reveals the answer without elimination or individual rankings.
9. The teacher controls assignment, start, recovery, next round, and end.

## Engineering rules

- Keep the server authoritative for session and game state.
- Validate every client payload at the server boundary.
- Never send one student's private clue to another student's client.
- Store MVP session data in memory and delete it when the session ends.
- Do not add cloud services, authentication, analytics, or persistent student profiles without an explicit scope change.
- Separate replaceable content from game mechanics.
- Add tests for state transitions, team/topic assignment, authorization, reconnection, and hidden-information boundaries.
- Verify LAN behavior with real devices; browser tests alone are not enough.
- Document meaningful architectural decisions in `docs/decisions/`.
- Record classroom observations in `docs/classroom-tests/` without personally identifying students.

## Quality gate

Before declaring a feature complete, run the relevant type checks and tests and verify the teacher/student flow affected by the change.
