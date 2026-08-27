import { describe, expect, it } from "vitest";
import { ALL_RECOMMENDED_TOPICS, RECOMMENDED_CATEGORIES } from "../src/content/defaultTopics";
import { deduplicateTopics, drawPair, parseTopicLines, redrawPair } from "../src/domain/game";

const topics = parseTopicLines("의사 | 🩺 | 진찰\n가수 | 🎤 | 노래\n축구선수").topics;

describe("classroom charades domain", () => {
  it("parses editable topic lines and supplies defaults", () => {
    expect(topics).toHaveLength(3);
    expect(topics[2]).toMatchObject({ word: "축구선수", emoji: "🎭", hint: "", category: "직접 입력", source: "custom" });
  });

  it("provides multiple recommendation categories with unique topic ids", () => {
    expect(RECOMMENDED_CATEGORIES).toHaveLength(5);
    expect(RECOMMENDED_CATEGORIES.every((category) => category.topics.length >= 10)).toBe(true);
    expect(new Set(ALL_RECOMMENDED_TOPICS.map((topic) => topic.id)).size).toBe(ALL_RECOMMENDED_TOPICS.length);
  });

  it("combines selected and custom topics without duplicate words", () => {
    const custom = parseTopicLines("의사 | 🩺 | 다른 힌트", "과학").topics;
    const recommendedDoctor = ALL_RECOMMENDED_TOPICS.find((topic) => topic.word === "의사")!;
    expect(deduplicateTopics([recommendedDoctor, ...custom])).toHaveLength(1);
  });

  it("draws two different topics", () => {
    const result = drawPair(topics, () => 0);
    expect(result.pair?.map((topic) => topic.word)).toEqual(["의사", "가수"]);
    expect(result.remaining).toHaveLength(1);
  });

  it("returns a discarded pair to the pool before redrawing", () => {
    const first = drawPair(topics, () => 0);
    const second = redrawPair(first.remaining, first.pair!, () => .99);
    expect(second.remaining).toHaveLength(1);
    expect(new Set([...(second.pair ?? []), ...second.remaining].map((topic) => topic.word)).size).toBe(3);
  });
});
