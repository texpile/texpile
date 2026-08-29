import { describe, expect, it } from 'vitest';
import { provisionalStage } from '$lib/draft/heuristics/provisionalStage';

// The decision under test: which claim wins when the JS overflow prediction and the engine's
// certificate disagree. `overflow` is arithmetic on predicted line positions; a certificate
// asked the engine whether the page still holds its content.
const base = {
	overflow: false,
	underflow: false,
	certified: false,
	certFits: false,
	certExact: false,
	fullCert: false,
	approx: false,
	approxStretch: false,
	floatInner: false,
	footnote: false,
	fontGap: false,
	cmdChanged: false,
	transient: false
};

describe('provisionalStage', () => {
	it('does not tint a page the engine certified, on the strength of a prediction that disagrees', () => {
		// measured: on a two-page article every overflow edit was tinted this way, and the
		// reconcile then graded all of them ok -- the prediction, not the render, was wrong
		expect(provisionalStage({ ...base, overflow: true, certified: true, certFits: true, fullCert: true, certExact: true })).toBeNull();
	});

	it('still tints an overflow the engine did not certify', () => {
		expect(provisionalStage({ ...base, overflow: true })).toBe('overflow');
		// certified, but the fit was refused: that is the engine agreeing content moved
		expect(provisionalStage({ ...base, overflow: true, certified: true })).toBe('overflow');
	});

	it('a fit-only certificate is not enough: the render is not carrying engine baselines', () => {
		// certFits without certExact means the band grew and the split answered only "it
		// holds", so the spacing on screen is still JS arithmetic
		expect(provisionalStage({ ...base, overflow: true, certified: true, certFits: true })).toBe('overflow');
	});
});
