import { randomInt, randomUUID } from "node:crypto";
import type {
  PublicMember,
  RejoinRequest,
  StudentSnapshot,
  TeamMode,
  TeacherSnapshot,
  TeamPhase,
  TopicInput,
} from "../shared/types";
import {
  chooseLiar,
  createTeamSizes,
  normalizeGuess,
  shuffle,
  tallyVotes,
} from "./domain";

interface Player {
  id: string;
  name: string;
  resumeToken: string;
  connected: boolean;
  socketId?: string;
  teamId?: string;
  liarCount: number;
}

interface TeamRound {
  phase: TeamPhase;
  phaseStartedAt: number;
  liarId: string;
  topic: TopicInput;
  confirmed: Set<string>;
  votes: Map<string, string>;
  runoffCandidates: string[];
  runoffVotes: Map<string, string>;
  accusedId?: string;
  winner?: "liar" | "detectives";
}

interface Team {
  id: string;
  name: string;
  memberIds: string[];
  usedTopicIndexes: Set<number>;
  round?: TeamRound;
}

interface PendingRejoinRequest extends RejoinRequest {
  socketId: string;
}

interface Room {
  code: string;
  teacherToken: string;
  teacherSocketId?: string;
  category: string;
  topics: TopicInput[];
  preferredTeamSize: number;
  teamMode: TeamMode;
  roundCount: number;
  roundNumber: number;
  status: "lobby" | "teamSetup" | "playing" | "ended";
  players: Map<string, Player>;
  teams: Map<string, Team>;
  rejoinRequests: Map<string, PendingRejoinRequest>;
}

export interface RoomSettings {
  category: string;
  topics: TopicInput[];
  preferredTeamSize: number;
  roundCount: number;
  teamMode: TeamMode;
}

export class GameError extends Error {}

function assertText(value: string, label: string, maxLength = 40): string {
  const normalized = value.trim();
  if (!normalized) throw new GameError(`${label}을(를) 입력해 주세요.`);
  if (normalized.length > maxLength) throw new GameError(`${label}은(는) ${maxLength}자 이하여야 합니다.`);
  return normalized;
}

export class ClassroomLiarStore {
  private readonly rooms = new Map<string, Room>();

  createRoom(settings: RoomSettings, socketId?: string): {
    roomCode: string;
    teacherToken: string;
    snapshot: TeacherSnapshot;
  } {
    const category = assertText(settings.category, "주제 범주", 30);
    const topics = settings.topics
      .map((topic) => ({
        word: assertText(topic.word, "주제어", 40),
        explanation: topic.explanation?.trim().slice(0, 120) || undefined,
      }))
      .filter((topic, index, values) =>
        values.findIndex((candidate) => normalizeGuess(candidate.word) === normalizeGuess(topic.word)) === index,
      );
    if (topics.length < 2) throw new GameError("서로 다른 주제어를 2개 이상 입력해 주세요.");

    let code = "";
    do code = String(randomInt(100000, 1000000));
    while (this.rooms.has(code));

    const room: Room = {
      code,
      teacherToken: randomUUID(),
      teacherSocketId: socketId,
      category,
      topics,
      preferredTeamSize: Math.min(32, Math.max(3, Math.round(settings.preferredTeamSize || 5))),
      teamMode: settings.teamMode === "rotate" ? "rotate" : "fixed",
      roundCount: Math.min(10, Math.max(1, Math.round(settings.roundCount || 3))),
      roundNumber: 0,
      status: "lobby",
      players: new Map(),
      teams: new Map(),
      rejoinRequests: new Map(),
    };
    this.rooms.set(code, room);
    return { roomCode: code, teacherToken: room.teacherToken, snapshot: this.teacherSnapshot(room) };
  }

  attachTeacher(roomCode: string, teacherToken: string, socketId?: string): TeacherSnapshot {
    const room = this.requireRoom(roomCode);
    if (room.teacherToken !== teacherToken) throw new GameError("교사 연결 정보가 올바르지 않습니다.");
    room.teacherSocketId = socketId;
    return this.teacherSnapshot(room);
  }

  joinStudent(roomCode: string, name: string, socketId?: string): {
    playerId: string;
    resumeToken: string;
    snapshot: StudentSnapshot;
  } {
    const room = this.requireRoom(roomCode);
    if (room.status !== "lobby") throw new GameError("입장이 마감된 방입니다.");
    if (room.players.size >= 32) throw new GameError("이 방은 최대 32명까지 참여할 수 있습니다.");
    const playerName = assertText(name, "별명", 12);
    if ([...room.players.values()].some((player) => player.name === playerName)) {
      throw new GameError("이미 사용 중인 별명입니다.");
    }
    const player: Player = {
      id: randomUUID(),
      name: playerName,
      resumeToken: randomUUID(),
      connected: true,
      socketId,
      liarCount: 0,
    };
    room.players.set(player.id, player);
    return {
      playerId: player.id,
      resumeToken: player.resumeToken,
      snapshot: this.studentSnapshot(room, player),
    };
  }

  resumeStudent(roomCode: string, playerId: string, resumeToken: string, socketId?: string): StudentSnapshot {
    const room = this.requireRoom(roomCode);
    const player = this.requirePlayer(room, playerId);
    if (player.resumeToken !== resumeToken) throw new GameError("재접속 정보가 올바르지 않습니다.");
    player.connected = true;
    player.socketId = socketId;
    return this.studentSnapshot(room, player);
  }

  requestRejoin(roomCode: string, name: string, socketId: string): { requestId: string } {
    const room = this.requireRoom(roomCode);
    if (room.status === "lobby") throw new GameError("입장 대기 중에는 위의 입장하기 버튼을 사용해 주세요.");
    if (room.status === "ended") throw new GameError("이미 종료된 게임입니다.");
    if (![...room.players.values()].some((player) => !player.connected)) {
      throw new GameError("현재 재입장할 수 있는 연결 끊긴 학생이 없습니다.");
    }
    const requestName = assertText(name, "이름", 12);
    const existing = [...room.rejoinRequests.values()].find((request) => request.socketId === socketId);
    if (existing) return { requestId: existing.id };
    const request: PendingRejoinRequest = {
      id: randomUUID(),
      name: requestName,
      requestedAt: Date.now(),
      socketId,
    };
    room.rejoinRequests.set(request.id, request);
    return { requestId: request.id };
  }

  approveRejoin(roomCode: string, teacherToken: string, requestId: string, playerId: string): {
    socketId: string;
    playerId: string;
    resumeToken: string;
    snapshot: StudentSnapshot;
  } {
    const room = this.requireTeacher(roomCode, teacherToken);
    const request = room.rejoinRequests.get(requestId);
    if (!request) throw new GameError("재입장 요청을 찾을 수 없습니다.");
    const player = this.requirePlayer(room, playerId);
    if (player.connected) throw new GameError("이미 연결된 학생에게는 재입장을 승인할 수 없습니다.");
    player.resumeToken = randomUUID();
    player.connected = true;
    player.socketId = request.socketId;
    room.rejoinRequests.delete(requestId);
    return {
      socketId: request.socketId,
      playerId: player.id,
      resumeToken: player.resumeToken,
      snapshot: this.studentSnapshot(room, player),
    };
  }

  rejectRejoin(roomCode: string, teacherToken: string, requestId: string): { socketId: string } {
    const room = this.requireTeacher(roomCode, teacherToken);
    const request = room.rejoinRequests.get(requestId);
    if (!request) throw new GameError("재입장 요청을 찾을 수 없습니다.");
    room.rejoinRequests.delete(requestId);
    return { socketId: request.socketId };
  }

  disconnect(socketId: string): string | undefined {
    for (const room of this.rooms.values()) {
      if (room.teacherSocketId === socketId) room.teacherSocketId = undefined;
      for (const [requestId, request] of room.rejoinRequests) {
        if (request.socketId === socketId) {
          room.rejoinRequests.delete(requestId);
          return room.code;
        }
      }
      for (const player of room.players.values()) {
        if (player.socketId === socketId) {
          player.connected = false;
          player.socketId = undefined;
          return room.code;
        }
      }
    }
    return undefined;
  }

  assignTeams(roomCode: string, teacherToken: string): void {
    const room = this.requireTeacher(roomCode, teacherToken);
    if (room.status !== "lobby") throw new GameError("입장 대기 중일 때만 팀을 배정할 수 있습니다.");
    this.replaceTeams(room, false);
    room.status = "teamSetup";
  }

  reshuffleTeams(roomCode: string, teacherToken: string): void {
    const room = this.requireTeacher(roomCode, teacherToken);
    this.requireTeamSetup(room);
    this.replaceTeams(room, true, room.teams.size);
  }

  addTeam(roomCode: string, teacherToken: string): void {
    const room = this.requireTeacher(roomCode, teacherToken);
    this.requireTeamSetup(room);
    const maxTeams = Math.floor(room.players.size / 3);
    if (room.teams.size >= maxTeams) throw new GameError("팀마다 3명 이상 두려면 팀을 더 추가할 수 없습니다.");
    const index = room.teams.size + 1;
    const teamId = `team-${index}`;
    room.teams.set(teamId, { id: teamId, name: `${index}팀`, memberIds: [], usedTopicIndexes: new Set() });
  }

  removeTeam(roomCode: string, teacherToken: string, teamId: string): void {
    const room = this.requireTeacher(roomCode, teacherToken);
    this.requireTeamSetup(room);
    const team = this.requireTeam(room, teamId);
    if (team.memberIds.length > 0) throw new GameError("학생을 다른 팀으로 옮긴 뒤 빈 팀을 제거해 주세요.");
    if (room.teams.size <= 1) throw new GameError("팀은 한 개 이상 있어야 합니다.");
    room.teams.delete(teamId);
    this.normalizeTeams(room);
  }

  movePlayer(roomCode: string, teacherToken: string, playerId: string, teamId: string): void {
    const room = this.requireTeacher(roomCode, teacherToken);
    this.requireTeamSetup(room);
    const player = this.requirePlayer(room, playerId);
    const targetTeam = this.requireTeam(room, teamId);
    if (player.teamId === targetTeam.id) return;
    if (player.teamId) {
      const sourceTeam = this.requireTeam(room, player.teamId);
      sourceTeam.memberIds = sourceTeam.memberIds.filter((id) => id !== player.id);
    }
    targetTeam.memberIds.push(player.id);
    player.teamId = targetTeam.id;
  }

  startGame(roomCode: string, teacherToken: string): void {
    const room = this.requireTeacher(roomCode, teacherToken);
    if (room.status !== "teamSetup") throw new GameError("팀 배정과 자리 이동을 먼저 마쳐 주세요.");
    if ([...room.teams.values()].some((team) => team.memberIds.length < 3)) {
      throw new GameError("모든 팀에 학생을 3명 이상 배정해 주세요.");
    }
    room.status = "playing";
    if (room.roundNumber === 0) room.roundNumber = 1;
    for (const team of room.teams.values()) team.round = this.createRound(room, team);
  }

  confirmSecret(roomCode: string, playerId: string): void {
    const { team, round } = this.requirePlayerTurn(roomCode, playerId, "secret");
    round.confirmed.add(playerId);
    if (round.confirmed.size === team.memberIds.length) this.transition(round, "discussion");
  }

  startTeamVote(roomCode: string, playerId: string): void {
    const { round } = this.requirePlayerRound(roomCode, playerId);
    if (round.phase === "vote") return;
    if (round.phase !== "discussion") throw new GameError("대면 대화 단계에서만 투표를 시작할 수 있습니다.");
    this.transition(round, "vote");
  }

  startRunoffVote(roomCode: string, playerId: string): void {
    const { round } = this.requirePlayerRound(roomCode, playerId);
    if (round.phase === "runoffVote") return;
    if (round.phase !== "runoffDiscussion") throw new GameError("결선 대화 단계에서만 투표를 시작할 수 있습니다.");
    this.transition(round, "runoffVote");
  }

  vote(roomCode: string, playerId: string, targetId: string): void {
    const { room, team, round } = this.requirePlayerTurn(roomCode, playerId, "vote");
    this.validateVote(team, playerId, targetId);
    if (round.votes.has(playerId)) throw new GameError("투표는 한 번만 제출할 수 있습니다.");
    round.votes.set(playerId, targetId);
    if (round.votes.size < team.memberIds.length) return;
    const result = tallyVotes(round.votes);
    if (!result.accusedId) {
      round.runoffCandidates = result.tiedIds;
      this.transition(round, "runoffDiscussion");
      return;
    }
    this.resolveAccusation(room, round, result.accusedId);
  }

  runoffVote(roomCode: string, playerId: string, targetId: string): void {
    const { room, team, round } = this.requirePlayerTurn(roomCode, playerId, "runoffVote");
    this.validateVote(team, playerId, targetId);
    if (!round.runoffCandidates.includes(targetId)) throw new GameError("결선 후보에게만 투표할 수 있습니다.");
    if (round.runoffVotes.has(playerId)) throw new GameError("결선 투표는 한 번만 제출할 수 있습니다.");
    round.runoffVotes.set(playerId, targetId);
    if (round.runoffVotes.size < team.memberIds.length) return;
    const result = tallyVotes(round.runoffVotes);
    if (!result.accusedId) {
      round.winner = "liar";
      this.transition(round, "reveal");
      return;
    }
    this.resolveAccusation(room, round, result.accusedId);
  }

  revealAnswer(roomCode: string, playerId: string): void {
    const { round } = this.requirePlayerTurn(roomCode, playerId, "finalGuess");
    if (round.liarId !== playerId) throw new GameError("라이어만 정답을 공개할 수 있습니다.");
    this.transition(round, "reveal");
  }

  advanceTeamDiscussion(roomCode: string, teacherToken: string, teamId: string): void {
    const room = this.requireTeacher(roomCode, teacherToken);
    const team = this.requireTeam(room, teamId);
    const round = this.requireRound(team);
    if (round.phase === "discussion") {
      this.transition(round, "vote");
      return;
    }
    if (round.phase === "runoffDiscussion") {
      this.transition(round, "runoffVote");
      return;
    }
    throw new GameError("대면 대화 단계에서만 투표를 시작할 수 있습니다.");
  }

  nextRound(roomCode: string, teacherToken: string): void {
    const room = this.requireTeacher(roomCode, teacherToken);
    if (room.status !== "playing") throw new GameError("진행 중인 게임이 아닙니다.");
    if ([...room.teams.values()].some((team) => this.requireRound(team).phase !== "reveal")) {
      throw new GameError("모든 팀이 결과 공개 단계에 도착해야 합니다.");
    }
    if (room.roundNumber >= room.roundCount) throw new GameError("계획한 모든 라운드를 마쳤습니다.");
    room.roundNumber += 1;
    if (room.teamMode === "rotate") {
      this.replaceTeams(room, true, room.teams.size);
      room.status = "teamSetup";
      return;
    }
    for (const team of room.teams.values()) team.round = this.createRound(room, team);
  }

  endGame(roomCode: string, teacherToken: string): void {
    const room = this.requireTeacher(roomCode, teacherToken);
    room.status = "ended";
    for (const team of room.teams.values()) {
      if (team.round) this.transition(team.round, "ended");
    }
  }

  deleteRoom(roomCode: string): void {
    this.rooms.delete(roomCode);
  }

  getTeacherSnapshot(roomCode: string, teacherToken: string): TeacherSnapshot {
    return this.teacherSnapshot(this.requireTeacher(roomCode, teacherToken));
  }

  getStudentSnapshot(roomCode: string, playerId: string, resumeToken?: string): StudentSnapshot {
    const room = this.requireRoom(roomCode);
    const player = this.requirePlayer(room, playerId);
    if (resumeToken && player.resumeToken !== resumeToken) throw new GameError("학생 연결 정보가 올바르지 않습니다.");
    return this.studentSnapshot(room, player);
  }

  roomAudience(roomCode: string): { teacherSocketId?: string; students: Array<{ socketId?: string; playerId: string }> } {
    const room = this.requireRoom(roomCode);
    return {
      teacherSocketId: room.teacherSocketId,
      students: [...room.players.values()].map((player) => ({ socketId: player.socketId, playerId: player.id })),
    };
  }

  private replaceTeams(room: Room, avoidCurrentTeams: boolean, desiredTeamCount?: number): void {
    const players = [...room.players.values()];
    const teamSizes = desiredTeamCount
      ? this.teamSizesForCount(players.length, desiredTeamCount)
      : createTeamSizes(players.length, room.preferredTeamSize);
    const previousPairs = avoidCurrentTeams ? this.teamPairs(room.teams.values()) : new Set<string>();
    let bestGroups: Player[][] | undefined;
    let bestScore = Number.POSITIVE_INFINITY;

    for (let attempt = 0; attempt < (previousPairs.size > 0 ? 24 : 1); attempt += 1) {
      const order = shuffle(players);
      let offset = 0;
      const groups = teamSizes.map((size) => {
        const group = order.slice(offset, offset + size);
        offset += size;
        return group;
      });
      const score = this.repeatedPairScore(groups, previousPairs);
      if (score < bestScore) {
        bestGroups = groups;
        bestScore = score;
      }
      if (score === 0) break;
    }

    room.teams.clear();
    for (const player of players) player.teamId = undefined;
    for (const [index, members] of (bestGroups ?? []).entries()) {
      const teamId = `team-${index + 1}`;
      for (const player of members) player.teamId = teamId;
      room.teams.set(teamId, {
        id: teamId,
        name: `${index + 1}팀`,
        memberIds: members.map((player) => player.id),
        usedTopicIndexes: new Set(),
      });
    }
  }

  private teamSizesForCount(playerCount: number, teamCount: number): number[] {
    const normalizedCount = Math.min(Math.max(1, teamCount), Math.floor(playerCount / 3));
    const baseSize = Math.floor(playerCount / normalizedCount);
    const largerTeamCount = playerCount % normalizedCount;
    return Array.from({ length: normalizedCount }, (_, index) => index < largerTeamCount ? baseSize + 1 : baseSize);
  }

  private teamPairs(teams: Iterable<Team>): Set<string> {
    const pairs = new Set<string>();
    for (const team of teams) {
      for (let left = 0; left < team.memberIds.length; left += 1) {
        for (let right = left + 1; right < team.memberIds.length; right += 1) {
          pairs.add([team.memberIds[left], team.memberIds[right]].sort().join(":"));
        }
      }
    }
    return pairs;
  }

  private repeatedPairScore(groups: Player[][], previousPairs: Set<string>): number {
    let score = 0;
    for (const group of groups) {
      for (let left = 0; left < group.length; left += 1) {
        for (let right = left + 1; right < group.length; right += 1) {
          if (previousPairs.has([group[left].id, group[right].id].sort().join(":"))) score += 1;
        }
      }
    }
    return score;
  }

  private normalizeTeams(room: Room): void {
    const teams = [...room.teams.values()];
    room.teams.clear();
    for (const [index, team] of teams.entries()) {
      const teamId = `team-${index + 1}`;
      team.id = teamId;
      team.name = `${index + 1}팀`;
      for (const playerId of team.memberIds) this.requirePlayer(room, playerId).teamId = teamId;
      room.teams.set(teamId, team);
    }
  }

  private createRound(room: Room, team: Team): TeamRound {
    if (team.usedTopicIndexes.size >= room.topics.length) team.usedTopicIndexes.clear();
    const available = room.topics.map((_, index) => index).filter((index) => !team.usedTopicIndexes.has(index));
    const topicIndex = available[randomInt(0, available.length)];
    team.usedTopicIndexes.add(topicIndex);
    const liarCounts = new Map(team.memberIds.map((id) => [id, this.requirePlayer(room, id).liarCount]));
    const liarId = chooseLiar(team.memberIds, liarCounts);
    this.requirePlayer(room, liarId).liarCount += 1;
    return {
      phase: "secret",
      phaseStartedAt: Date.now(),
      liarId,
      topic: room.topics[topicIndex],
      confirmed: new Set(),
      votes: new Map(),
      runoffCandidates: [],
      runoffVotes: new Map(),
    };
  }

  private resolveAccusation(room: Room, round: TeamRound, accusedId: string): void {
    round.accusedId = accusedId;
    if (accusedId === round.liarId) {
      this.transition(round, "finalGuess");
    } else {
      round.winner = "liar";
      this.transition(round, "reveal");
    }
  }

  private validateVote(team: Team, voterId: string, targetId: string): void {
    if (!team.memberIds.includes(targetId)) throw new GameError("같은 팀원에게만 투표할 수 있습니다.");
    if (voterId === targetId) throw new GameError("자기 자신에게는 투표할 수 없습니다.");
  }

  private transition(round: TeamRound, phase: TeamPhase): void {
    round.phase = phase;
    round.phaseStartedAt = Date.now();
  }

  private requireTeamSetup(room: Room): void {
    if (room.status !== "teamSetup") throw new GameError("팀 이동 준비 단계에서만 팀을 수정할 수 있습니다.");
  }

  private requirePlayerTurn(roomCode: string, playerId: string, phase: TeamPhase): {
    room: Room;
    player: Player;
    team: Team;
    round: TeamRound;
  } {
    const { room, player, team, round } = this.requirePlayerRound(roomCode, playerId);
    if (round.phase !== phase) throw new GameError("현재 단계에서는 이 동작을 할 수 없습니다.");
    return { room, player, team, round };
  }

  private requirePlayerRound(roomCode: string, playerId: string): {
    room: Room;
    player: Player;
    team: Team;
    round: TeamRound;
  } {
    const room = this.requireRoom(roomCode);
    const player = this.requirePlayer(room, playerId);
    if (room.status !== "playing") throw new GameError("진행 중인 게임이 아닙니다.");
    if (!player.teamId) throw new GameError("아직 팀이 정해지지 않았습니다.");
    const team = this.requireTeam(room, player.teamId);
    const round = this.requireRound(team);
    return { room, player, team, round };
  }

  private requireRoom(roomCode: string): Room {
    const room = this.rooms.get(roomCode.trim());
    if (!room) throw new GameError("방을 찾을 수 없습니다.");
    return room;
  }

  private requireTeacher(roomCode: string, teacherToken: string): Room {
    const room = this.requireRoom(roomCode);
    if (room.teacherToken !== teacherToken) throw new GameError("교사 권한을 확인할 수 없습니다.");
    return room;
  }

  private requirePlayer(room: Room, playerId: string): Player {
    const player = room.players.get(playerId);
    if (!player) throw new GameError("참가자를 찾을 수 없습니다.");
    return player;
  }

  private requireTeam(room: Room, teamId: string): Team {
    const team = room.teams.get(teamId);
    if (!team) throw new GameError("팀을 찾을 수 없습니다.");
    return team;
  }

  private requireRound(team: Team): TeamRound {
    if (!team.round) throw new GameError("아직 게임이 시작되지 않았습니다.");
    return team.round;
  }

  private publicMember(room: Room, playerId: string): PublicMember {
    const player = this.requirePlayer(room, playerId);
    return { id: player.id, name: player.name, connected: player.connected };
  }

  private teacherSnapshot(room: Room): TeacherSnapshot {
    return {
      roomCode: room.code,
      status: room.status,
      category: room.category,
      roundNumber: room.roundNumber,
      roundCount: room.roundCount,
      teamMode: room.teamMode,
      participants: [...room.players.values()].map((player) => this.publicMember(room, player.id)),
      rejoinRequests: [...room.rejoinRequests.values()].map(({ id, name, requestedAt }) => ({ id, name, requestedAt })),
      teams: [...room.teams.values()].map((team) => {
        if (room.status === "teamSetup") {
          return {
            id: team.id,
            name: team.name,
            phase: "teamSetup" as const,
            completed: 0,
            total: team.memberIds.length,
            members: team.memberIds.map((id) => this.publicMember(room, id)),
            phaseStartedAt: 0,
          };
        }
        const round = this.requireRound(team);
        let completed = 0;
        let total = team.memberIds.length;
        if (round.phase === "secret") completed = round.confirmed.size;
        if (round.phase === "discussion" || round.phase === "runoffDiscussion") total = 1;
        if (round.phase === "vote") completed = round.votes.size;
        if (round.phase === "runoffVote") completed = round.runoffVotes.size;
        if (round.phase === "finalGuess") {
          completed = 0;
          total = 1;
        }
        if (["reveal", "ended"].includes(round.phase)) {
          completed = 1;
          total = 1;
        }
        return {
          id: team.id,
          name: team.name,
          phase: round.phase,
          completed,
          total,
          members: team.memberIds.map((id) => this.publicMember(room, id)),
          phaseStartedAt: round.phaseStartedAt,
        };
      }),
    };
  }

  private studentSnapshot(room: Room, player: Player): StudentSnapshot {
    const base: StudentSnapshot = {
      roomCode: room.code,
      status: room.status,
      playerId: player.id,
      playerName: player.name,
      members: [...room.players.values()].map((member) => this.publicMember(room, member.id)),
      roundNumber: room.roundNumber,
      roundCount: room.roundCount,
      phase: room.status === "ended" ? "ended" : "lobby",
      canAct: false,
    };
    if (!player.teamId || room.status === "lobby") return base;
    const team = this.requireTeam(room, player.teamId);
    const members = team.memberIds.map((id) => this.publicMember(room, id));
    if (room.status === "teamSetup") {
      return {
        ...base,
        status: "teamSetup",
        teamId: team.id,
        teamName: team.name,
        members,
        phase: "teamSetup",
      };
    }
    const round = this.requireRound(team);
    return {
      ...base,
      teamId: team.id,
      teamName: team.name,
      members,
      roundNumber: room.roundNumber,
      phase: round.phase,
      category: room.category,
      role: round.liarId === player.id ? "liar" : "member",
      topic: round.liarId === player.id && round.phase !== "reveal" ? undefined : round.topic.word,
      explanation: round.liarId === player.id && round.phase !== "reveal" ? undefined : round.topic.explanation,
      confirmed: round.confirmed.has(player.id),
      voteSubmitted: round.phase === "runoffVote" ? round.runoffVotes.has(player.id) : round.votes.has(player.id),
      runoffCandidates: round.runoffCandidates,
      accusedName: round.accusedId ? this.requirePlayer(room, round.accusedId).name : undefined,
      liarName: round.phase === "reveal" || round.phase === "ended" ? this.requirePlayer(room, round.liarId).name : undefined,
      winner: round.winner,
      canAct:
        (round.phase === "secret" && !round.confirmed.has(player.id)) ||
        round.phase === "discussion" ||
        (round.phase === "vote" && !round.votes.has(player.id)) ||
        round.phase === "runoffDiscussion" ||
        (round.phase === "runoffVote" && !round.runoffVotes.has(player.id)) ||
        (round.phase === "finalGuess" && round.liarId === player.id),
    };
  }
}
