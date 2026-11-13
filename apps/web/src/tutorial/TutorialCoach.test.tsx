import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TutorialCoach } from './TutorialCoach';
import { TUTORIAL_SCRIPT } from './script';
import { PARTY_SCRIPT } from './partyScript';

const noop = () => {};

describe('TutorialCoach', () => {
  it('puts the running score into the closing card', () => {
    const end = TUTORIAL_SCRIPT.at(-1)!;
    render(<TutorialCoach step={end} index={0} total={1} cave={null} hint={null} onContinue={noop} onSkip={noop} score={37} />);
    expect(screen.getByText(/would score 37 points/)).toBeInTheDocument();
    expect(screen.queryByText(/\{score\}/)).toBeNull();
  });
  it('opens with a Coach Card that says it can be dragged and snapped back', () => {
    expect(PARTY_SCRIPT[0]!.title).toMatch(/coach card/i);
    expect(PARTY_SCRIPT[0]!.body).toMatch(/drag/i);
    expect(PARTY_SCRIPT[0]!.body).toMatch(/snap/i);
  });
  it('numbers every step out of the same total', () => {
    const totals = new Set([...PARTY_SCRIPT, ...TUTORIAL_SCRIPT].map((s) => s.eyebrow.match(/of (\d+)$/)?.[1]).filter(Boolean));
    expect(totals.size).toBe(1);
  });
});
