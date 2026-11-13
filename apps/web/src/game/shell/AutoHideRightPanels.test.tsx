import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AutoHideRightPanels } from './AutoHideRightPanels';

const width = (narrow: boolean) => { window.matchMedia = vi.fn().mockReturnValue({ matches: narrow }) as unknown as typeof window.matchMedia; };
afterEach(() => { delete (window as { matchMedia?: unknown }).matchMedia; });

describe('AutoHideRightPanels', () => {
  it('closes the right-hand panel when a fight starts in a narrow window', () => {
    width(true);
    const hide = vi.fn();
    const { rerender } = render(<AutoHideRightPanels fighting={false} hide={hide} />);
    expect(hide).not.toHaveBeenCalled();
    rerender(<AutoHideRightPanels fighting hide={hide} />);
    expect(hide).toHaveBeenCalledTimes(1);
  });

  it('leaves it alone in a wide window, and for a panel opened mid-fight', () => {
    width(false);
    const hide = vi.fn();
    const { rerender } = render(<AutoHideRightPanels fighting={false} hide={hide} />);
    rerender(<AutoHideRightPanels fighting hide={hide} />);
    expect(hide).not.toHaveBeenCalled();
    width(true);
    rerender(<AutoHideRightPanels fighting hide={hide} />);   // still the same fight: no second chance to close
    expect(hide).not.toHaveBeenCalled();
  });

  it('tells the caller when each fight starts, in any width', () => {
    width(false);
    const onStart = vi.fn();
    const { rerender } = render(<AutoHideRightPanels fighting={false} hide={vi.fn()} onStart={onStart} />);
    rerender(<AutoHideRightPanels fighting hide={vi.fn()} onStart={onStart} />);
    expect(onStart).toHaveBeenCalledTimes(1);
    rerender(<AutoHideRightPanels fighting={false} hide={vi.fn()} onStart={onStart} />);
    rerender(<AutoHideRightPanels fighting hide={vi.fn()} onStart={onStart} />);
    expect(onStart).toHaveBeenCalledTimes(2);
  });

  it('copes with a browser without matchMedia', () => {
    const hide = vi.fn();
    const { rerender } = render(<AutoHideRightPanels fighting={false} hide={hide} />);
    rerender(<AutoHideRightPanels fighting hide={hide} />);
    expect(hide).not.toHaveBeenCalled();
  });
});
