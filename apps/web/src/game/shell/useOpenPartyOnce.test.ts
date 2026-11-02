import { renderHook, act } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { useState } from 'react';
import { useOpenPartyOnce } from './useOpenPartyOnce';
import type { LeftSlot } from './shellState';

// A tiny harness: the slot state lives where GameScreen keeps it, so the hook is tested against a real setter.
function setup(initialGame: string | null) {
  return renderHook(({ gameId }) => {
    const [left, setLeft] = useState<LeftSlot>(null);
    useOpenPartyOnce(gameId, setLeft);
    return { left, setLeft };
  }, { initialProps: { gameId: initialGame } });
}

describe('useOpenPartyOnce', () => {
  it('opens the party list when a game begins, so the player sees the party they chose', () => {
    const { result } = setup('g1');
    expect(result.current.left).toBe('party');
  });

  it('does nothing while there is no game (the splash and party screens)', () => {
    const { result } = setup(null);
    expect(result.current.left).toBeNull();
  });

  it('respects the player closing it: a re-render of the same game does not reopen it', () => {
    const { result, rerender } = setup('g1');
    act(() => result.current.setLeft(null));
    rerender({ gameId: 'g1' });
    expect(result.current.left).toBeNull();
  });

  it('opens again for the next game', () => {
    const { result, rerender } = setup('g1');
    act(() => result.current.setLeft(null));
    rerender({ gameId: null });
    rerender({ gameId: 'g2' });
    expect(result.current.left).toBe('party');
  });
});
