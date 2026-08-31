import { describe, expect, it } from 'vitest';
import { whyNotExact } from '$lib/draft/heuristics/whyNotExact';

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
	transient: false,
	stretchy: false,
	packed: false,
	grew: false
};

describe('whyNotExact', () => {
	it('renders a page the engine certified, on the strength of a prediction that disagrees', () => {
		// measured: on a two-page article every overflow edit was refused this way, and the
		// reconcile then graded all of them ok -- the prediction, not the render, was wrong
		expect(whyNotExact({ ...base, overflow: true, certified: true, certFits: true, fullCert: true, certExact: true })).toBeNull();
	});

	it('refuses an overflow the engine did not certify', () => {
		expect(whyNotExact({ ...base, overflow: true })).toBe('overflow');
		// certified, but the fit was refused: that is the engine agreeing content moved
		expect(whyNotExact({ ...base, overflow: true, certified: true })).toBe('overflow');
	});

	it('a fit-only certificate is not enough: the render is not carrying engine baselines', () => {
		// certFits without certExact means the band grew and the split answered only "it
		// holds", so the spacing on screen is still JS arithmetic
		expect(whyNotExact({ ...base, overflow: true, certified: true, certFits: true })).toBe('overflow');
	});

	it('refuses a grown band in a packed column the prediction called safe', () => {
		// measured on gpt3 page 3: three glues set off natural, an 11pt growth, and the engine
		// answered by re-setting them -- everything below rose 4.4pt while the render pushed
		// down rigidly. `fits` was true and the JS estimate saw no overflow, so nothing refused it.
		expect(whyNotExact({ ...base, stretchy: true, packed: true, grew: true, certified: true, certFits: true })).toBe('unset-glue');
		// a full certificate carries the engine's own baselines, so the respacing is drawn
		expect(
			whyNotExact({
				...base,
				stretchy: true,
				packed: true,
				grew: true,
				certified: true,
				certFits: true,
				fullCert: true,
				certExact: true
			})
		).toBeNull();
		// a ragged column absorbs the growth in the fil at its foot: nothing above it moves,
		// so the rigid push the renderer draws IS the engine's answer
		expect(whyNotExact({ ...base, stretchy: true, grew: true, certified: true, certFits: true })).toBeNull();
		// and a page whose glue sits at natural has nothing to re-set in the first place
		expect(whyNotExact({ ...base, packed: true, grew: true })).toBeNull();
	});
});
