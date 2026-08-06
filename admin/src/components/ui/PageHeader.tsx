import type { ReactNode } from "react";

type Props = {
  title: string;
  description?: string;
  actions?: ReactNode;
};

export function PageHeader({ title, description, actions }: Props) {
  return (
    <header className="pageHeader">
      <div className="pageHeaderCopy">
        <h1 className="pageTitle">{title}</h1>
        {description ? <p className="pageSub">{description}</p> : null}
      </div>
      {actions ? <div className="pageHeaderActions">{actions}</div> : null}
    </header>
  );
}
