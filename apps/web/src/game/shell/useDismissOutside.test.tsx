import { render, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { useDismissOutside } from './useDismissOutside';

function Harness({ active, onDismiss }: { active: boolean; onDismiss: () => void }) {
  useDismissOutside(active, '.keep', onDismiss);
  return <div><div className="keep"><span data-testid="in">in</span></div><span data-testid="out">out</span></div>;
}

describe('useDismissOutside', () => {
  it('dismisses on a press outside, not inside, and not when inactive', () => {
    const onDismiss = vi.fn();
    const { getByTestId, rerender } = render(<Harness active onDismiss={onDismiss} />);
    fireEvent.pointerDown(getByTestId('in'));
    expect(onDismiss).not.toHaveBeenCalled();
    fireEvent.pointerDown(getByTestId('out'));
    expect(onDismiss).toHaveBeenCalledOnce();
    rerender(<Harness active={false} onDismiss={onDismiss} />);
    fireEvent.pointerDown(getByTestId('out'));
    expect(onDismiss).toHaveBeenCalledOnce();
  });
});
