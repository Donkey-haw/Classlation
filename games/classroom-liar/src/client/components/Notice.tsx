export function Notice({ message, onClose }: { message?: string; onClose?: () => void }) {
  if (!message) return null;
  return (
    <div className="notice" role="alert">
      <span>{message}</span>
      {onClose && <button type="button" className="notice__close" onClick={onClose} aria-label="알림 닫기">×</button>}
    </div>
  );
}

export function Waiting({ title, detail }: { title: string; detail: string }) {
  return (
    <section className="student-card student-card--center">
      <span className="eyebrow">잠시만 기다려 주세요</span>
      <div className="pulse" aria-hidden="true"><span /></div>
      <h1>{title}</h1>
      <p>{detail}</p>
    </section>
  );
}
