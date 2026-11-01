import { visibleBlocks, type Topic, type Variant, type VariantFlags } from './index';
import { Inline } from './inline';

const VARIANT_LABEL: Record<Variant, string> = { kit: 'Extension Kit', sibyl: 'Sibyl', house: 'House rule' };

/** One topic: an optional title (with its option badge) and its blocks that apply under `flags`. */
export function TopicView({ topic, showTitle = true, flags }: { topic: Topic; showTitle?: boolean; flags?: VariantFlags }) {
  return (
    <section className="scv-help-topic" data-topic={topic.id}>
      {(showTitle || topic.variant) && (
        <h3 className="scv-help-title">
          {showTitle && topic.title}
          {topic.variant && <span className="scv-help-pill">{VARIANT_LABEL[topic.variant]}</span>}
        </h3>
      )}
      {visibleBlocks(topic, flags).map((b, i) => {
        if (b.type === 'p') return <p key={i}><Inline text={b.text} /></p>;
        if (b.type === 'list') return <ul key={i}>{b.items.map((it, j) => <li key={j}><Inline text={it} /></li>)}</ul>;
        return (
          <p key={i} className={`scv-help-note scv-help-note-${b.tone}`}>
            {b.tag && <strong>{b.tag}. </strong>}<Inline text={b.text} />
          </p>
        );
      })}
    </section>
  );
}
