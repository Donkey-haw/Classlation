import { useMemo, useState } from "react";
import { ALL_RECOMMENDED_TOPICS, RECOMMENDED_CATEGORIES } from "../content/defaultTopics";
import { deduplicateTopics, parseTopicLines, serializeTopics, type Topic } from "../domain/game";

type Props = {
  initialTopics: Topic[];
  onApply: (topics: Topic[]) => void;
  onClose: () => void;
};

const RECOMMENDED_IDS = new Set(ALL_RECOMMENDED_TOPICS.map((topic) => topic.id));

export function TopicPicker({ initialTopics, onApply, onClose }: Props) {
  const initialCustomTopics = initialTopics.filter((topic) => topic.source === "custom");
  const [activeTab, setActiveTab] = useState(RECOMMENDED_CATEGORIES[0].id);
  const [selectedIds, setSelectedIds] = useState(() => new Set(initialTopics.filter((topic) => RECOMMENDED_IDS.has(topic.id)).map((topic) => topic.id)));
  const [customCategory, setCustomCategory] = useState(initialCustomTopics[0]?.category ?? "직접 만든 주제");
  const [customText, setCustomText] = useState(() => serializeTopics(initialCustomTopics));
  const [error, setError] = useState("");

  const parsedCustom = useMemo(() => parseTopicLines(customText, customCategory.trim() || "직접 만든 주제"), [customText, customCategory]);
  const selectedRecommended = useMemo(() => ALL_RECOMMENDED_TOPICS.filter((topic) => selectedIds.has(topic.id)), [selectedIds]);
  const combinedTopics = useMemo(() => deduplicateTopics([...selectedRecommended, ...parsedCustom.topics]), [selectedRecommended, parsedCustom.topics]);
  const activeCategory = RECOMMENDED_CATEGORIES.find((category) => category.id === activeTab);

  const toggleTopic = (topicId: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(topicId)) next.delete(topicId);
      else next.add(topicId);
      return next;
    });
    setError("");
  };

  const setWholeCategory = (selected: boolean) => {
    if (!activeCategory) return;
    setSelectedIds((current) => {
      const next = new Set(current);
      activeCategory.topics.forEach((topic) => selected ? next.add(topic.id) : next.delete(topic.id));
      return next;
    });
    setError("");
  };

  const apply = () => {
    if (parsedCustom.errors.length) {
      setActiveTab("custom");
      setError(`${parsedCustom.errors.join(", ")}번째 직접 입력 줄을 확인해 주세요.`);
      return;
    }
    if (combinedTopics.length < 2) {
      setError("게임을 시작하려면 주제를 두 개 이상 선택해 주세요.");
      return;
    }
    onApply(combinedTopics);
  };

  return <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="게임 주제 선택">
    <section className="modal topic-picker">
      <div className="modal-heading">
        <div><span className="eyebrow">게임 준비</span><h2>카테고리와 주제를 골라 주세요</h2><p>추천 목록을 섞어 쓰거나, 필요한 주제만 골라 수업에 맞출 수 있어요.</p></div>
        <button aria-label="닫기" onClick={onClose}>×</button>
      </div>

      <nav className="picker-tabs" aria-label="주제 카테고리">
        {RECOMMENDED_CATEGORIES.map((category) => {
          const selectedCount = category.topics.filter((topic) => selectedIds.has(topic.id)).length;
          return <button
            className={activeTab === category.id ? "active" : ""}
            data-testid={`category-${category.id}`}
            key={category.id}
            onClick={() => { setActiveTab(category.id); setError(""); }}
          ><span>{category.emoji}</span><strong>{category.name}</strong><small>{selectedCount}/{category.topics.length}</small></button>;
        })}
        <button className={activeTab === "custom" ? "active" : ""} data-testid="category-custom" onClick={() => { setActiveTab("custom"); setError(""); }}><span>✍️</span><strong>직접 입력</strong><small>{parsedCustom.topics.length}개</small></button>
      </nav>

      {activeCategory ? <div className="category-panel">
        <div className="category-heading"><div><h3>{activeCategory.emoji} {activeCategory.name}</h3><p>{activeCategory.description}</p></div><div><button className="button secondary compact" data-testid="select-category" onClick={() => setWholeCategory(true)}>이 카테고리 전체 선택</button><button className="button ghost compact" data-testid="clear-category" onClick={() => setWholeCategory(false)}>전체 해제</button></div></div>
        <div className="topic-choice-grid">
          {activeCategory.topics.map((topic) => {
            const selected = selectedIds.has(topic.id);
            return <button
              aria-pressed={selected}
              className={`topic-choice ${selected ? "selected" : ""}`}
              data-testid={`topic-${topic.id}`}
              key={topic.id}
              onClick={() => toggleTopic(topic.id)}
            ><span className="check">{selected ? "✓" : ""}</span><span className="topic-emoji">{topic.emoji}</span><span><strong>{topic.word}</strong><small>{topic.hint}</small></span></button>;
          })}
        </div>
      </div> : <div className="custom-panel">
        <label>카테고리 이름<input data-testid="custom-category-name" value={customCategory} onChange={(event) => setCustomCategory(event.target.value)} placeholder="예: 우리 반 단원 복습" /></label>
        <div><h3>주제 직접 입력</h3><p><code>주제 | 이모지 | 몸동작 힌트</code> 형식으로 한 줄에 하나씩 입력해요. 주제만 입력해도 됩니다.</p></div>
        <textarea data-testid="custom-topics" value={customText} onChange={(event) => { setCustomText(event.target.value); setError(""); }} spellCheck={false} placeholder={"광합성 | 🌱 | 햇빛을 받아 자라는 모습\n화산 폭발 | 🌋 | 땅이 흔들리고 용암이 솟는 모습"} />
      </div>}

      {error && <p className="editor-error" role="alert">{error}</p>}
      <div className="picker-footer"><div><strong data-testid="selected-topic-count">{combinedTopics.length}개 선택</strong><span>선택한 주제로 새 게임을 시작하면 현재 점수와 기록이 초기화돼요.</span></div><div><button className="button secondary" onClick={onClose}>취소</button><button className="button primary" data-testid="apply-topics" onClick={apply}>선택한 주제로 새 게임</button></div></div>
    </section>
  </div>;
}
