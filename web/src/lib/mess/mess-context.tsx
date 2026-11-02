"use client";

import { createContext, useContext } from "react";

type MessContextValue = { messId: number };

const MessContext = createContext<MessContextValue | null>(null);

export function MessProvider({ messId, children }: { messId: number; children: React.ReactNode }) {
  return <MessContext.Provider value={{ messId }}>{children}</MessContext.Provider>;
}

/** The mess of the current `(app)/[mess]/…` route. Throws outside that layout. */
export function useMess(): MessContextValue {
  const value = useContext(MessContext);
  if (!value) throw new Error("useMess() must be used inside (app)/[mess]/layout");
  return value;
}
