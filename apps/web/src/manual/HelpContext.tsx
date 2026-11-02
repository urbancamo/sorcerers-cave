import { createContext, useContext, type ReactNode } from 'react';
import type { VariantFlags } from './types';

const Ctx = createContext<VariantFlags | undefined>(undefined);

/** Tells every help surface under it which options the current game runs under, so it shows only the rules in force. */
export function HelpProvider({ variants, children }: { variants?: VariantFlags; children: ReactNode }) {
  return <Ctx.Provider value={variants ?? {}}>{children}</Ctx.Provider>;
}

/** The current game's options, or `undefined` outside a game (nothing is then hidden). */
export const useVariants = (): VariantFlags | undefined => useContext(Ctx);
