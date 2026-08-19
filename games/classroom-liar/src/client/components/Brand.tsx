export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`brand ${compact ? "brand--compact" : ""}`}>
      <span className="brand__mark" aria-hidden="true">L</span>
      <span>클래스 라이어</span>
    </div>
  );
}

export function ConnectionBadge({ connected }: { connected: boolean }) {
  return <span className={`connection ${connected ? "connection--online" : ""}`}>{connected ? "연결됨" : "재연결 중"}</span>;
}
