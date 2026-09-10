import { createContext, useContext, type ReactNode } from "react";

const NativePortalContext = createContext<HTMLElement | null>(null);

export function NativePortalProvider({
  element,
  children,
}: {
  element: HTMLElement | null;
  children: ReactNode;
}) {
  return <NativePortalContext.Provider value={element}>{children}</NativePortalContext.Provider>;
}

export function useNativePortal() {
  return useContext(NativePortalContext);
}
