"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

export type Mode = "OTA" | "ATA";

const Ctx = createContext<{ mode: Mode; setMode: (m: Mode) => void }>({ mode: "OTA", setMode: () => {} });

export function ModeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<Mode>("OTA");

  useEffect(() => {
    const saved = localStorage.getItem("mode");
    if (saved === "ATA" || saved === "OTA") setModeState(saved);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-mode", mode);
  }, [mode]);

  const setMode = useCallback((m: Mode) => {
    setModeState(m);
    localStorage.setItem("mode", m);
  }, []);

  return <Ctx.Provider value={{ mode, setMode }}>{children}</Ctx.Provider>;
}

export const useMode = () => useContext(Ctx);

export const MODE_INFO: Record<Mode, { fa: string; de: string; desc: string }> = {
  OTA: { fa: "اتاق عمل", de: "Operationstechnische Assistenz", desc: "OTA – تکنسین اتاق عمل / دستیار جراحی" },
  ATA: { fa: "بیهوشی", de: "Anästhesietechnische Assistenz", desc: "ATA – تکنسین بیهوشی" },
};
