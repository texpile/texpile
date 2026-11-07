// a citation call reads its target wherever the arguments stand
import { describe, expect, it } from 'vitest';
import { parseTypstFile } from '$lib/languages/typst/visual/roundtrip';

describe('a citation call', () => {
	it('reads its label before or after its named arguments', () => {
		const first = parseTypstFile('See #cite(form: "normal", <key>) and #cite(<key>, supplement: [p. 8]).\n').doc.child(0);
		const refs: Array<Record<string, unknown>> = [];
		first.forEach((child) => {
			if (child.type.name === 'typ_ref') refs.push(child.attrs);
		});
		expect(refs).toMatchObject([
			{ target: 'key', form: 'normal' },
			{ target: 'key', supplement: 'p. 8' }
		]);
	});
});
