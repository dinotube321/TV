import { Link } from "react-router-dom";
import type { CSSProperties } from "react";
import type { Title } from "../../data/catalog";
import { MoreMenu } from "../MoreMenu/MoreMenu";
import { PosterRating } from "../PosterRating/PosterRating";
import styles from "./PosterCard.module.css";

interface Props {
  title: Title;
}

export function PosterCard({ title }: Props) {
  return (
    <div className={`${styles.container} lockupContainer`}>
      <Link
        to={`/title/${title.id}`}
        className={styles.lockup}
        aria-label={title.title}
        style={
          {
            "--lockup-aspect-ratio": "2 / 3",
            "--lockup-border-radius": "14px",
            "--afterShadowBorderRadius": "13px",
          } as CSSProperties
        }
      >
        <div className={styles.grid}>
          <div
            className={styles.artwork}
            style={{ "--artwork-bg-color": "rgb(28, 30, 36)" } as CSSProperties}
          >
            <img
              src={title.poster}
              alt=""
              loading="lazy"
              decoding="async"
              width={225}
              height={338}
              className={styles.image}
            />
            <PosterRating voteAverage={title.voteAverage} />
          </div>
          <div className={styles.scrim} data-testid="lockup-scrim" aria-hidden />
        </div>
      </Link>
      <div className={styles.menuSlot}>
        <MoreMenu title={title} />
      </div>
    </div>
  );
}
