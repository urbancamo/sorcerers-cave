import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MOUSE_MODE_EVENT, ZOOM_SPEED_EVENT, ZOOM_SPEED_VALUE, mouseButtonsFor, readMouseMode, readZoomSpeed, writeMouseMode, writeZoomSpeed } from './mouseMode';

describe('mouse mode', () => {
  beforeEach(() => localStorage.clear());

  it('classic keeps the original layout: left orbits, middle zooms, right pans', () => {
    expect(mouseButtonsFor('classic')).toEqual({ LEFT: 0, MIDDLE: 1, RIGHT: 2 });
  });

  it('tabletop gives the left button no camera action, orbits on the right and pans on the middle', () => {
    expect(mouseButtonsFor('tabletop')).toEqual({ LEFT: -1, MIDDLE: 2, RIGHT: 0 });
  });

  it('defaults to classic and remembers the choice', () => {
    expect(readMouseMode()).toBe('classic');
    writeMouseMode('tabletop');
    expect(readMouseMode()).toBe('tabletop');
  });

  it('tells a running cave view when the choice changes', () => {
    const seen = vi.fn();
    const on = (e: Event) => seen((e as CustomEvent).detail);
    window.addEventListener(MOUSE_MODE_EVENT, on);
    writeMouseMode('tabletop');
    window.removeEventListener(MOUSE_MODE_EVENT, on);
    expect(seen).toHaveBeenCalledWith('tabletop');
  });

  it('zoom speed defaults to medium, 10, as set on request, and slow < medium < fast', () => {
    expect(readZoomSpeed()).toBe('medium');
    expect(ZOOM_SPEED_VALUE.medium).toBe(10);
    expect(ZOOM_SPEED_VALUE.slow).toBeLessThan(ZOOM_SPEED_VALUE.medium);
    expect(ZOOM_SPEED_VALUE.fast).toBeGreaterThan(ZOOM_SPEED_VALUE.medium);
  });

  it('remembers the zoom speed and tells a running cave view', () => {
    const seen = vi.fn();
    const on = (e: Event) => seen((e as CustomEvent).detail);
    window.addEventListener(ZOOM_SPEED_EVENT, on);
    writeZoomSpeed('fast');
    window.removeEventListener(ZOOM_SPEED_EVENT, on);
    expect(seen).toHaveBeenCalledWith('fast');
    expect(readZoomSpeed()).toBe('fast');
  });
});
