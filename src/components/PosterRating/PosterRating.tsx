import styles from "./PosterRating.module.css";

interface Props {
  voteAverage?: number | null;
  className?: string;
}

export function formatVoteAverage(voteAverage?: number | null): string | null {
  if (voteAverage == null || !Number.isFinite(voteAverage) || voteAverage <= 0) {
    return null;
  }
  return voteAverage.toFixed(1);
}

export function PosterRating({ voteAverage, className }: Props) {
  const label = formatVoteAverage(voteAverage);
  if (!label) return null;

  return (
    <span
      className={`${styles.badge}${className ? ` ${className}` : ""}`}
      aria-label={`TMDB rating ${label}`}
    >
      <span className={styles.blur} aria-hidden />
      <span className={styles.value}>{label}</span>
    </span>
  );
}
