export type TeamPhase =
  | "lobby"
  | "teamSetup"
  | "secret"
  | "discussion"
  | "vote"
  | "runoffDiscussion"
  | "runoffVote"
  | "finalGuess"
  | "reveal"
  | "ended";

export type RoundWinner = "liar" | "detectives";
export type TeamMode = "fixed" | "rotate";

export interface PublicMember {
  id: string;
  name: string;
  connected: boolean;
}

export interface TopicInput {
  word: string;
  explanation?: string;
}

export interface TeamProgress {
  id: string;
  name: string;
  phase: TeamPhase;
  completed: number;
  total: number;
  members: PublicMember[];
  phaseStartedAt: number;
}

export interface RejoinRequest {
  id: string;
  name: string;
  requestedAt: number;
}

export interface TeacherSnapshot {
  roomCode: string;
  status: "lobby" | "teamSetup" | "playing" | "ended";
  category: string;
  roundNumber: number;
  roundCount: number;
  teamMode: TeamMode;
  participants: PublicMember[];
  teams: TeamProgress[];
  rejoinRequests: RejoinRequest[];
}

export interface StudentSnapshot {
  roomCode: string;
  status: "lobby" | "teamSetup" | "playing" | "ended";
  playerId: string;
  playerName: string;
  teamId?: string;
  teamName?: string;
  members: PublicMember[];
  roundNumber: number;
  roundCount: number;
  phase: TeamPhase;
  category?: string;
  role?: "member" | "liar";
  topic?: string;
  explanation?: string;
  confirmed?: boolean;
  voteSubmitted?: boolean;
  runoffCandidates?: string[];
  accusedName?: string;
  liarName?: string;
  winner?: RoundWinner;
  canAct: boolean;
}

export interface Ack<T = undefined> {
  ok: boolean;
  data?: T;
  error?: string;
}
