import { createContext, useContext, useState, type ReactNode } from 'react';
import type { GameData } from '../../api/types';
import { CoverSheet } from './CoverSheet';

const Ctx = createContext<((game: GameData) => void) | null>(null);

// One Sheet instance for the whole app instead of each GameTile (Shelves,
// Favorites, Recently Played) hosting its own - they all trigger the same
// shared surface through this.
export function CoverSheetProvider({ children }: { children: ReactNode }) {
  const [game, setGame] = useState<GameData | null>(null);
  return (
    <Ctx.Provider value={setGame}>
      {children}
      <CoverSheet game={game} onClose={() => setGame(null)} />
    </Ctx.Provider>
  );
}

export function useCoverSheet(): (game: GameData) => void {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useCoverSheet must be used inside <CoverSheetProvider>');
  return ctx;
}
