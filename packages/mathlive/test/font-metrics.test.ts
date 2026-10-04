import { describe, expect, it } from 'vitest';
import { getCharacterMetrics } from '../src/core/font-metrics';

describe('character metrics', () => {
  it('measures a letter the fonts lack as the one it is drawn like', () => {
    const { defaultMetrics, ...a } = getCharacterMetrics(0x41, 'Main-Regular');
    expect(defaultMetrics).toBe(false);
    expect(getCharacterMetrics(0xc5, 'Main-Regular')).toEqual({
      defaultMetrics: false,
      ...a,
    });
  });
});
