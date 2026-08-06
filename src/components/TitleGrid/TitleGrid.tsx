import { PosterCard } from "../PosterCard/PosterCard";
import type { Title } from "../../data/types";
import styles from "./TitleGrid.module.css";

interface Props {
  items: Title[];
}

export function TitleGrid({ items }: Props) {
  if (!items.length) return null;

  return (
    <div className={styles.grid}>
      {items.map((title) => (
        <div key={title.id} className={styles.cell}>
          <PosterCard title={title} />
        </div>
      ))}
    </div>
  );
}
