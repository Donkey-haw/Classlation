export type Topic = { id: string; word: string; emoji: string; hint: string };
export type Pair = [Topic, Topic];

export function parseTopicLines(input: string): { topics: Topic[]; errors: number[] } {
  const topics: Topic[] = [];
  const errors: number[] = [];
  input.split(/\r?\n/).forEach((line, index) => {
    if (!line.trim()) return;
    const [word = "", emoji = "🎭", hint = ""] = line.split("|").map((part) => part.trim());
    if (!word) { errors.push(index + 1); return; }
    topics.push({ id: `${index + 1}-${word}`, word, emoji: emoji || "🎭", hint });
  });
  return { topics, errors };
}

export function serializeTopics(topics: Topic[]): string {
  return topics.map(({ word, emoji, hint }) => `${word} | ${emoji} | ${hint}`).join("\n");
}

export function drawPair(pool: Topic[], random: () => number = Math.random): { pair: Pair | null; remaining: Topic[] } {
  if (pool.length < 2) return { pair: null, remaining: pool };
  const remaining = [...pool];
  const firstIndex = Math.floor(random() * remaining.length);
  const first = remaining.splice(firstIndex, 1)[0];
  const secondIndex = Math.floor(random() * remaining.length);
  const second = remaining.splice(secondIndex, 1)[0];
  return { pair: [first, second], remaining };
}

export function redrawPair(pool: Topic[], current: Pair, random: () => number = Math.random) {
  return drawPair([...pool, ...current], random);
}
