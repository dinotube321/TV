type EmptyProps = {
  title: string;
  description?: string;
};

export function EmptyState({ title, description }: EmptyProps) {
  return (
    <div className="emptyState">
      <strong>{title}</strong>
      {description ? <p className="mb0">{description}</p> : null}
    </div>
  );
}

export function LoadingBlock({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="loadingBlock" role="status" aria-live="polite">
      <span className="spinner" aria-hidden />
      <span>{label}</span>
    </div>
  );
}
