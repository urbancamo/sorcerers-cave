import { describe, it, expect } from 'vitest';
import { ALL_CREATURES, ALL_TREASURES, ALL_HAZARD_NAMES } from '@sorcerers-cave/engine';
import { MANUAL, topicsForCard, topicById, topicsForScreen, searchTopics, manualFor, visibleBlocks } from './index';

describe('structured manual', () => {
  it('has unique topic ids and non-empty topics', () => {
    const ids = MANUAL.flatMap((s) => s.topics.map((t) => t.id));
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of MANUAL) for (const t of s.topics) { expect(t.blocks.length, t.id).toBeGreaterThan(0); expect(t.cards.length + (t.screens?.length ?? 0) + (t.brief ? 1 : 0) + 1, t.id).toBeGreaterThan(0); }
  });

  // Drift guard: a card added to the engine must get manual help (or be listed here with a reason).
  it('explains every engine hazard, creature and treasure', () => {
    for (const h of ALL_HAZARD_NAMES) expect(topicsForCard('hazard', h).length, h).toBeGreaterThan(0);
    for (const c of ALL_CREATURES) {
      if (c.name === 'Ghoul') continue; // the Ghouls hazard topic covers them
      expect(topicsForCard('creature', c.name).length, c.name).toBeGreaterThan(0);
    }
    for (const t of ALL_TREASURES) {
      if (t.name === 'Crypt/Gems' || t.kind === 'heavy' || t.kind === 'artifact') expect(topicsForCard(t.kind === 'artifact' ? 'artifact' : 'treasure', t.name).length, t.name).toBeGreaterThan(0);
    }
  });

  it('explains every special area by its displayed name', () => {
    for (const n of ['The Gateway', 'Deep Pool', 'Viper Pit', 'Tomb of Kings', 'Great Hall', 'The Chasm', 'The Bell Rope', 'The Lair', 'The Whirlpool', 'The Gallery', 'The Well', 'Chamber', 'Tunnel']) {
      expect(topicsForCard('area', n).length, n).toBeGreaterThan(0);
    }
  });

  it('puts a card\'s own topic first and adds general topics only on request', () => {
    expect(topicsForCard('creature', 'Dragon')[0]!.id).toBe('creature-dragon');
    expect(topicsForCard('creature', 'Dragon').map((t) => t.id)).not.toContain('encounter-choices');
    const wide = topicsForCard('creature', 'Dragon', { general: true }).map((t) => t.id);
    expect(wide[0]).toBe('creature-dragon');
    expect(wide).toContain('encounter-choices');
  });

  it('treats treasure and artifact cards alike but never mixes in creatures', () => {
    expect(topicsForCard('treasure', 'Treasure Chest').length).toBeGreaterThan(0);
    expect(topicsForCard('artifact', 'Treasure Chest').length).toBeGreaterThan(0);
    expect(topicsForCard('creature', 'Magic Sword')).toEqual([]);
  });

  it('looks topics up by id', () => {
    expect(topicById('hazard-medusa')?.title).toBe('Medusa');
    expect(topicById('nope')).toBeUndefined();
  });

  describe('options', () => {
    const words = (t: ReturnType<typeof topicById>, flags?: Record<string, boolean>) =>
      visibleBlocks(t!, flags).map((b) => (b.type === 'list' ? b.items.join() : b.text)).join(' ');

    it('hides house-rule blocks that the game does not have switched on', () => {
      const ghouls = topicById('hazard-ghouls');
      expect(words(ghouls, {})).not.toMatch(/one round only/);
      expect(words(ghouls, { combatRevision: true })).toMatch(/one round only/);
      expect(words(ghouls, undefined)).toMatch(/one round only/); // no game: show everything
    });

    it('hides whole topics for rules and options that are off', () => {
      expect(topicsForScreen('fight-revised', {}).map((t) => t.id)).not.toContain('rc-overview');
      expect(topicsForScreen('fight-revised', { combatRevision: true }).map((t) => t.id)).toContain('rc-overview');
      const hasWhirlpool = (flags?: Record<string, boolean>) => manualFor(flags).flatMap((x) => x.topics).some((t) => t.id === 'area-whirlpool');
      expect(hasWhirlpool({})).toBe(false);
      expect(hasWhirlpool({ extensionKit: true })).toBe(true);
    });

    it('drops the Sorcerer terms wording unless that rule is on', () => {
      expect(words(topicById('creature-sorcerer'), {})).not.toMatch(/teleport/);
      expect(words(topicById('creature-sorcerer'), { sorcererTeleport: true })).toMatch(/teleport/);
    });
  });

  describe('screens and search', () => {
    it('lists encounter and fight topics for their screens', () => {
      expect(topicsForScreen('encounter').map((t) => t.id)).toEqual(expect.arrayContaining(['encounter-choices', 'reaction-roll', 'reaction-results']));
      expect(topicsForScreen('fight').map((t) => t.id)).toEqual(expect.arrayContaining(['fight-overview', 'fight-retreat']));
      expect(topicsForScreen(['fight', 'encounter']).length).toBeGreaterThan(topicsForScreen('fight').length);
    });

    it('finds topics by their words, titles first', () => {
      expect(searchTopics('medusa')[0]!.id).toBe('hazard-medusa');
      expect(searchTopics('stone medusa').map((t) => t.id)).toContain('hazard-medusa');
      expect(searchTopics('   ')).toEqual([]);
      expect(searchTopics('zzzzqx')).toEqual([]);
    });

    it('does not search wording the game has switched off', () => {
      expect(searchTopics('teleport', {}).map((t) => t.id)).not.toContain('creature-sorcerer');
      expect(searchTopics('teleport', { sorcererTeleport: true }).map((t) => t.id)).toContain('creature-sorcerer');
    });
  });
});
