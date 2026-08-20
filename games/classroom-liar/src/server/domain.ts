export type RandomSource = () => number;

export function shuffle<T>(values: readonly T[], random: RandomSource = Math.random): T[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

export function createTeamSizes(playerCount: number, preferredSize: number): number[] {
  if (!Number.isInteger(playerCount) || playerCount < 3 || playerCount > 32) {
    throw new Error("참가자는 3명에서 32명이어야 합니다.");
  }
  const normalizedPreferredSize = Math.min(32, Math.max(3, Math.round(preferredSize)));
  const maxTeams = Math.max(1, Math.floor(playerCount / 3));
  const idealTeams = Math.max(1, Math.round(playerCount / normalizedPreferredSize));
  const teamCount = Math.min(maxTeams, idealTeams);
  const baseSize = Math.floor(playerCount / teamCount);
  const largerTeamCount = playerCount % teamCount;

  return Array.from({ length: teamCount }, (_, index) =>
    index < largerTeamCount ? baseSize + 1 : baseSize,
  );
}

export function chooseLiar(
  playerIds: readonly string[],
  liarCounts: ReadonlyMap<string, number>,
  random: RandomSource = Math.random,
): string {
  if (playerIds.length === 0) throw new Error("라이어를 고를 참가자가 없습니다.");
  const lowestCount = Math.min(...playerIds.map((id) => liarCounts.get(id) ?? 0));
  const candidates = playerIds.filter((id) => (liarCounts.get(id) ?? 0) === lowestCount);
  return candidates[Math.floor(random() * candidates.length)];
}

export function tallyVotes(votes: ReadonlyMap<string, string>): {
  accusedId?: string;
  tiedIds: string[];
} {
  const totals = new Map<string, number>();
  for (const targetId of votes.values()) {
    totals.set(targetId, (totals.get(targetId) ?? 0) + 1);
  }
  if (totals.size === 0) return { tiedIds: [] };
  const highest = Math.max(...totals.values());
  const tiedIds = [...totals.entries()]
    .filter(([, count]) => count === highest)
    .map(([id]) => id);
  return tiedIds.length === 1 ? { accusedId: tiedIds[0], tiedIds } : { tiedIds };
}

export function normalizeGuess(value: string): string {
  return value.trim().replace(/\s+/g, "").toLocaleLowerCase("ko-KR");
}
