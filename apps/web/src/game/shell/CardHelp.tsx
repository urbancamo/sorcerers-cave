import { topicsForCard, type CardCategory } from '../../manual';
import { useVariants } from '../../manual/HelpContext';
import { TopicView } from '../../manual/TopicView';

/**
 * The manual's wording for a card, as a closed-by-default disclosure at the foot of the card panel. Renders nothing
 * when the manual has nothing for the card. `general` adds the topics that apply to a whole category (e.g. how
 * reactions work), which suit a card met on the floor rather than one already in the party. Rules the game's options
 * switch off are left out.
 */
export function CardHelp({ category, name, general = false }: { category: CardCategory; name: string; general?: boolean }) {
  const flags = useVariants();
  const topics = topicsForCard(category, name, { general, flags });
  if (topics.length === 0) return null;
  return (
    // Keyed by card so a new selection always starts closed.
    <details key={`${category}:${name}`} className="scv-help" data-testid="card-help">
      <summary>Help</summary>
      {topics.map((t, i) => <TopicView key={t.id} topic={t} flags={flags} showTitle={i > 0 || topics.length > 1} />)}
    </details>
  );
}
