import { useCallback, useRef, useState } from 'react';
import { PartySelect } from '../game/PartySelect';
import { TutorialCoach } from './TutorialCoach';
import { PARTY_SCRIPT } from './partyScript';
import { initialTutorial, tutorialReduce, type TutorialEvent } from './runner';

/** The tutorial's new-game screen: the real party chooser with the coach beside it, waiting for the player's own choices. */
export function TutorialParty({ onDone, onSkip, onExit }: { onDone: () => void; onSkip: () => void; onExit: () => void }) {
  const [tut, setTut] = useState(initialTutorial);
  const tutRef = useRef(tut);
  const [hint, setHint] = useState<string | null>(null);
  const send = useCallback((...events: TutorialEvent[]) => {
    tutRef.current = events.reduce((s, e) => tutorialReduce(PARTY_SCRIPT, s, e), tutRef.current);
    setTut(tutRef.current);
    setHint(null);
  }, []);
  // The chooser reports every change; the steps wait on the facts in order, so tell them all that are true, in script order.
  const onChange = useCallback((picks: number[], kit: boolean) => {
    send(...[kit && { type: 'ui', name: 'kit' }, picks.includes(1) && { type: 'ui', name: 'whero' }, picks.includes(7) && { type: 'ui', name: 'dwarf' }].filter(Boolean) as TutorialEvent[]);
  }, [send]);
  const step = PARTY_SCRIPT[tut.step];
  return (
    <>
      <PartySelect kitToggle onBack={onExit} onChange={onChange}
        onConfirm={(picks, _color, variants) => {
          const ok = [...picks].sort().join() === '1,7' && !!variants?.extensionKit;
          if (!ok) { setHint('The guide needs the Extension kit ticked, and just the W-Hero and the Dwarf.'); return; }
          onDone();
        }} />
      {step && (
        <TutorialCoach step={step} index={tut.step} total={PARTY_SCRIPT.length} cave={null} hint={hint}
                       onContinue={() => send({ type: 'continue' })}
                       onBack={tut.step > 0 && PARTY_SCRIPT[tut.step - 1]!.kind === 'info' ? () => send({ type: 'back' }) : undefined}
                       onSkip={onSkip} />
      )}
    </>
  );
}
