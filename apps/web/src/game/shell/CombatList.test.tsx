import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { CombatList, type CombatWidget } from './CombatList';

const w = (over: Partial<CombatWidget> = {}): CombatWidget => ({ i: 0, label: 'Hero', strength: 5, caster: false, treasure: [], selected: false, dim: false, ...over });

describe('CombatList', () => {
  it('shows nothing when no creature is free', () => {
    const { container } = render(<CombatList widgets={[]} onDragStart={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows strength, a magic mark and artifacts (not heavy treasure) on one compact line each', () => {
    render(<CombatList widgets={[w({ treasure: [3, 1] }), w({ i: 1, label: 'Wizard', strength: 7, caster: true })]} onDragStart={() => {}} />);
    expect(screen.getByTestId('rev-free-0')).toHaveTextContent('Hero5Magic Sword'); // Gold (id 1) is not listed
    expect(screen.getByTestId('rev-free-1').querySelector('.scv-cw-mp')).not.toBeNull();
  });

  it('marks the selection and reports taps', () => {
    const onPick = vi.fn();
    render(<CombatList widgets={[w({ selected: true, onPick })]} onDragStart={() => {}} />);
    const el = screen.getByTestId('rev-free-0');
    expect(el).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(el);
    expect(onPick).toHaveBeenCalledOnce();
  });
});
