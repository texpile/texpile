// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { Decoration } from 'prosemirror-view';
import { schema } from '$lib/languages/latex/schema/latexPMSchema';
import { chipSquigglesIn } from '$lib/editor/spellcheck/spellcheckplugin';

describe('chipSquigglesIn', () => {
	it('skips a squiggle the proofreader has not moved past an edit that shortened the doc', () => {
		const doc = schema.node('doc', null, [schema.node('paragraph', null, [schema.text('Hello')])]);
		const stale = Decoration.inline(40, 52, { class: 'proofread-spell' }, { errors: [{ type: 'Spelling' }] });
		expect(() => chipSquigglesIn(doc, [stale])).not.toThrow();
	});
});
