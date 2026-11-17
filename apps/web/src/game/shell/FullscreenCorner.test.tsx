import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { FullscreenCorner } from './FullscreenCorner';

const setSupport = (on: boolean) => Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, value: on });

describe('FullscreenCorner', () => {
  afterEach(() => { setSupport(false); });

  it('is hidden where the browser offers no full screen', () => {
    setSupport(false);
    render(<FullscreenCorner />);
    expect(screen.queryByTestId('fs-corner')).toBeNull();
  });

  it('offers Full screen and asks the page to fill the window when clicked', () => {
    setSupport(true);
    const request = vi.fn().mockResolvedValue(undefined);
    document.documentElement.requestFullscreen = request;
    render(<FullscreenCorner />);
    fireEvent.click(screen.getByRole('button', { name: 'Full screen' }));
    expect(request).toHaveBeenCalledOnce();
  });
});
