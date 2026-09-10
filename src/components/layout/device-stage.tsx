import type { ReactNode } from "react";

/** Desktop no longer frames the app in a phone. Kept as the page wrapper. */
export function DeviceStage({ children }: { children: ReactNode }) {
  return <div className="app-frame">{children}</div>;
}
