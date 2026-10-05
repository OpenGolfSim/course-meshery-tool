import { describe, it } from 'node:test';
import assert from 'node:assert';
import { buildOverpassQueryTags, getOsmMapping } from './osmUtils.js';

describe('OSM Utilities', () => {
  describe('buildOverpassQueryTags', () => {
    it('generates a valid Overpass query string from the configuration', () => {
      const query = buildOverpassQueryTags();
      assert.ok(query.includes('nwr["golf"="bunker"]'));
      assert.ok(query.includes('nwr["waterway"]')); // wildcard translation
      assert.ok(query.includes('nwr["highway"="track"]'));
    });
  });

  describe('getOsmMapping', () => {
    it('prioritizes golf tags', () => {
      const props = { golf: 'bunker', natural: 'water' };
      const mapping = getOsmMapping(props);
      assert.strictEqual(mapping.surface, 'sand');
    });

    it('handles exact matches for non-golf tags', () => {
      const props = { highway: 'track' };
      const mapping = getOsmMapping(props);
      assert.strictEqual(mapping.surface, 'dirt');
      assert.strictEqual(mapping.buffer, 2);
    });

    it('falls back to wildcard mapping when available', () => {
      const props = { waterway: 'drain' }; // 'drain' not mapped, but '*' is
      const mapping = getOsmMapping(props);
      assert.strictEqual(mapping.surface, 'water');
    });

    it('returns null for unmapped tags', () => {
      const props = { amenity: 'bench' }; // 'bench' not mapped, no '*' fallback for amenity
      const mapping = getOsmMapping(props);
      assert.strictEqual(mapping, null);
    });
  });
});
