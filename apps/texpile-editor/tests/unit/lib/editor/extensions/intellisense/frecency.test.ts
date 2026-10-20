import { describe, it, expect, beforeEach } from 'vitest';
import { recordAccept, withFrecency, resetUsageForTests } from '../../../../../../src/lib/languages/latex/intellisense/completion/frecency';
import { macroOptions } from '../../../../../../src/lib/languages/latex/intellisense/completion/macros';

const DAY = 24 * 60 * 60 * 1000;
const options = [{ label: '\\vec' }, { label: '\\varepsilon' }];

describe('frecency: accepted completions rank up via CodeMirror boost', () => {
	beforeEach(() => resetUsageForTests());

	it('unused labels pass through without a boost', () => {
		expect(withFrecency(options).every((o) => o.boost === undefined)).toBe(true);
	});

	it('accepting a completion gives it a boost, and repeats raise it', () => {
		recordAccept('\\varepsilon');
		const once = withFrecency(options).find((o) => o.label === '\\varepsilon')!.boost!;
		expect(once).toBeGreaterThan(0);
		for (let i = 0; i < 10; i++) recordAccept('\\varepsilon');
		const often = withFrecency(options).find((o) => o.label === '\\varepsilon')!.boost!;
		expect(often).toBeGreaterThan(once);
		expect(often).toBeLessThanOrEqual(30);
		expect(withFrecency(options).find((o) => o.label === '\\vec')!.boost).toBeUndefined();
	});

	it('scores decay with a 30-day half-life', () => {
		const now = Date.now();
		for (let i = 0; i < 8; i++) recordAccept('\\vec', now);
		const fresh = withFrecency(options, now).find((o) => o.label === '\\vec')!.boost!;
		const later = withFrecency(options, now + 90 * DAY).find((o) => o.label === '\\vec')!.boost!;
		expect(later).toBeLessThan(fresh);
	});

	it('prunes the weakest entries once the store exceeds its cap', () => {
		const now = Date.now();
		recordAccept('\\keeper', now);
		recordAccept('\\keeper', now);
		for (let i = 0; i < 250; i++) recordAccept(`\\noise${i}`, now - i);
		expect(withFrecency([{ label: '\\keeper' }], now).find((o) => o.label === '\\keeper')!.boost).toBeGreaterThan(0);
	});

	it('boosts flow through macroOptions', async () => {
		recordAccept('\\alpha');
		recordAccept('\\alpha');
		const alpha = (await macroOptions('')).find((o) => o.label === '\\alpha');
		expect(alpha?.boost).toBeGreaterThan(0);
	});
});
