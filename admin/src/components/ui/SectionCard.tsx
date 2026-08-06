import type { ReactNode } from "react";

type Props = {
  title: string;
  description?: string;
  toolbar?: ReactNode;
  children: ReactNode;
  flush?: boolean;
  className?: string;
};

export function SectionCard({
  title,
  description,
  toolbar,
  children,
  flush,
  className,
}: Props) {
  return (
    <section className={`sectionCard${className ? ` ${className}` : ""}`}>
      <div className="sectionCardHeader">
        <div>
          <h2>{title}</h2>
          {description ? <p className="sectionCardSub">{description}</p> : null}
        </div>
        {toolbar ? <div className="sectionToolbar">{toolbar}</div> : null}
      </div>
      <div className={`sectionCardBody${flush ? " flush" : ""}`}>{children}</div>
    </section>
  );
}
