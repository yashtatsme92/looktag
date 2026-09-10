import type { ReactNode } from "react";

export function ScreenTitle({
  kicker,
  children,
  action,
}: {
  kicker?: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="mb-5 flex items-end justify-between gap-3">
      <div className="min-w-0 flex-1">
        {kicker ? <p className="ds-kicker mb-1">{kicker}</p> : null}
        <h1 className="ds-screen-title">{children}</h1>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
