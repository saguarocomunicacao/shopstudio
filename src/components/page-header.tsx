import type { ReactNode } from "react";

/** Cabeçalho único das telas do painel: título, contexto opcional e até 2 ações. */
export function PageHeader({ title, description, actions, className = "" }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <div className={`mb-6 grid grid-cols-[minmax(0,1fr)_auto] items-end gap-4 ${className}`}>
      <div className="min-w-0">
        <h1 className="page-title truncate">{title}</h1>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}
