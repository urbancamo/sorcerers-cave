import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { useOfferOnPickup } from './useOfferOnPickup';

describe('useOfferOnPickup', () => {
  it('offers the floor treasure when a pickup begins, and not before', () => {
    const offer = vi.fn();
    const { rerender } = renderHook(({ on, key }) => useOfferOnPickup(on, key, offer), { initialProps: { on: false, key: 'a' } });
    expect(offer).not.toHaveBeenCalled();
    rerender({ on: true, key: 'a' });
    expect(offer).toHaveBeenCalledTimes(1);
  });

  it('does not re-offer on an unrelated re-render, but does for a new pickup', () => {
    const offer = vi.fn();
    const { rerender } = renderHook(({ on, key }) => useOfferOnPickup(on, key, offer), { initialProps: { on: true, key: 'a' } });
    rerender({ on: true, key: 'a' });
    expect(offer).toHaveBeenCalledTimes(1);
    rerender({ on: true, key: 'b' });
    expect(offer).toHaveBeenCalledTimes(2);
  });
});
