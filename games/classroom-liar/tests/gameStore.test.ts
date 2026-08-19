import { describe, expect, it } from "vitest";
import { ClassroomLiarStore } from "../src/server/gameStore";

function makeLobby(playerCount = 5, roundCount = 2) {
  const store = new ClassroomLiarStore();
  const room = store.createRoom({
    category: "음식",
    topics: [{ word: "김치찌개" }, { word: "떡볶이" }, { word: "비빔밥" }],
    preferredTeamSize: 5,
    roundCount,
  });
  const players = Array.from({ length: playerCount }, (_, index) =>
    store.joinStudent(room.roomCode, `학생${index + 1}`),
  );
  return { store, room, players };
}

function makeGame(playerCount = 5, roundCount = 2) {
  const setup = makeLobby(playerCount, roundCount);
  setup.store.assignTeams(setup.room.roomCode, setup.room.teacherToken);
  setup.store.startGame(setup.room.roomCode, setup.room.teacherToken);
  return setup;
}

function confirmAll(store: ClassroomLiarStore, roomCode: string, players: ReturnType<typeof makeGame>["players"]) {
  for (const player of players) store.confirmSecret(roomCode, player.playerId);
}

describe("ClassroomLiarStore", () => {
  it("shows team assignment before roles and locks late entry", () => {
    const { store, room, players } = makeLobby();
    expect(() => store.startGame(room.roomCode, room.teacherToken)).toThrow("팀 배정과 자리 이동");

    store.assignTeams(room.roomCode, room.teacherToken);
    const teacher = store.getTeacherSnapshot(room.roomCode, room.teacherToken);
    const student = store.getStudentSnapshot(room.roomCode, players[0].playerId);

    expect(teacher.status).toBe("teamSetup");
    expect(teacher.teams).toHaveLength(1);
    expect(teacher.teams[0].members).toHaveLength(5);
    expect(student.status).toBe("teamSetup");
    expect(student.phase).toBe("teamSetup");
    expect(student.teamName).toBe("1팀");
    expect(student.members).toHaveLength(5);
    expect(student.role).toBeUndefined();
    expect(student.topic).toBeUndefined();
    expect(() => store.joinStudent(room.roomCode, "늦은학생")).toThrow("입장이 마감된 방입니다");

    store.startGame(room.roomCode, room.teacherToken);
    expect(store.getStudentSnapshot(room.roomCode, players[0].playerId).phase).toBe("secret");
  });

  it("runs a face-to-face round without individual speech controls", () => {
    const { store, room, players } = makeGame();
    const opening = players.map((player) => store.getStudentSnapshot(room.roomCode, player.playerId));
    const liar = opening.find((snapshot) => snapshot.role === "liar")!;
    const citizens = opening.filter((snapshot) => snapshot.role === "member");

    expect(opening.filter((snapshot) => snapshot.role === "liar")).toHaveLength(1);
    expect(liar.topic).toBeUndefined();
    expect(citizens.every((snapshot) => Boolean(snapshot.topic))).toBe(true);

    confirmAll(store, room.roomCode, players);
    expect(store.getStudentSnapshot(room.roomCode, players[0].playerId).phase).toBe("discussion");

    store.startTeamVote(room.roomCode, players[0].playerId);
    store.startTeamVote(room.roomCode, players[1].playerId);
    expect(store.getStudentSnapshot(room.roomCode, players[0].playerId).phase).toBe("vote");

    for (const player of players) {
      const target = player.playerId === liar.playerId ? citizens[0].playerId : liar.playerId;
      store.vote(room.roomCode, player.playerId, target);
    }
    expect(store.getStudentSnapshot(room.roomCode, liar.playerId).phase).toBe("finalGuess");

    store.revealAnswer(room.roomCode, liar.playerId);
    const result = store.getStudentSnapshot(room.roomCode, players[0].playerId);
    expect(result.phase).toBe("reveal");
    expect(result.winner).toBeUndefined();
    expect(result.liarName).toBe(liar.playerName);
    expect(result.topic).toBeTruthy();
  });

  it("lets the teacher start a vote when a team needs help", () => {
    const { store, room, players } = makeGame();
    confirmAll(store, room.roomCode, players);
    const teamId = store.getStudentSnapshot(room.roomCode, players[0].playerId).teamId!;
    store.advanceTeamDiscussion(room.roomCode, room.teacherToken, teamId);
    expect(store.getStudentSnapshot(room.roomCode, players[0].playerId).phase).toBe("vote");
  });

  it("restores the same student with a resume token", () => {
    const { store, room, players } = makeGame();
    const player = players[0];
    const restored = store.resumeStudent(room.roomCode, player.playerId, player.resumeToken, "new-socket");
    expect(restored.playerId).toBe(player.playerId);
    expect(restored.playerName).toBe("학생1");
    expect(() => store.resumeStudent(room.roomCode, player.playerId, "wrong-token")).toThrow();
  });

  it("runs one runoff and lets the liar escape when the runoff ties again", () => {
    const { store, room, players } = makeGame(4, 1);
    confirmAll(store, room.roomCode, players);
    store.startTeamVote(room.roomCode, players[0].playerId);

    const [a, b, c, d] = players;
    store.vote(room.roomCode, a.playerId, b.playerId);
    store.vote(room.roomCode, b.playerId, a.playerId);
    store.vote(room.roomCode, c.playerId, a.playerId);
    store.vote(room.roomCode, d.playerId, b.playerId);
    expect(store.getStudentSnapshot(room.roomCode, a.playerId).phase).toBe("runoffDiscussion");

    store.startRunoffVote(room.roomCode, c.playerId);
    store.startRunoffVote(room.roomCode, d.playerId);
    store.runoffVote(room.roomCode, a.playerId, b.playerId);
    store.runoffVote(room.roomCode, b.playerId, a.playerId);
    store.runoffVote(room.roomCode, c.playerId, a.playerId);
    store.runoffVote(room.roomCode, d.playerId, b.playerId);
    const result = store.getStudentSnapshot(room.roomCode, a.playerId);
    expect(result.phase).toBe("reveal");
    expect(result.winner).toBe("liar");
  });

  it("rotates the liar fairly on the next round", () => {
    const { store, room, players } = makeGame();
    const firstLiar = players.find((player) => store.getStudentSnapshot(room.roomCode, player.playerId).role === "liar")!;
    const citizens = players.filter((player) => player.playerId !== firstLiar.playerId);
    confirmAll(store, room.roomCode, players);
    store.startTeamVote(room.roomCode, players[0].playerId);
    for (const player of players) {
      store.vote(room.roomCode, player.playerId, player.playerId === firstLiar.playerId ? citizens[0].playerId : firstLiar.playerId);
    }
    store.revealAnswer(room.roomCode, firstLiar.playerId);
    store.nextRound(room.roomCode, room.teacherToken);
    const secondLiar = players.find((player) => store.getStudentSnapshot(room.roomCode, player.playerId).role === "liar")!;
    expect(secondLiar.playerId).not.toBe(firstLiar.playerId);
  });

  it("does not expose role, topic, or votes on the teacher progress board", () => {
    const { store, room } = makeGame(10);
    const teacher = store.getTeacherSnapshot(room.roomCode, room.teacherToken);
    expect(teacher.teams).toHaveLength(2);
    expect(JSON.stringify(teacher)).not.toContain("liarId");
    expect(JSON.stringify(teacher)).not.toContain("topic");
    expect(JSON.stringify(teacher)).not.toContain("votes");
  });

  it("removes all room state after session cleanup", () => {
    const { store, room } = makeGame();
    store.endGame(room.roomCode, room.teacherToken);
    store.deleteRoom(room.roomCode);
    expect(() => store.getTeacherSnapshot(room.roomCode, room.teacherToken)).toThrow("방을 찾을 수 없습니다");
  });
});
