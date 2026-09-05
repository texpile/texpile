import { describe, expect, it } from 'vitest';
import { Schema } from 'prosemirror-model';
import { baseMarks } from '$lib/editor/visual/schema/baseMarks';
import { textWithoutLinks } from '$lib/editor/spellcheck/linkFreeText';

const schema = new Schema({
	nodes: {
		doc: { content: 'block+' },
		paragraph: { content: 'inline*', group: 'block' },
		text: { group: 'inline' },
		math: { inline: true, group: 'inline', content: 'text*' }
	},
	marks: baseMarks
});

const link = (text: string, href = 'https://exmaple.com') => schema.text(text, [schema.marks.link.create({ href })]);

describe('textWithoutLinks', () => {
	it('blanks link text and keeps every offset', () => {
		const p = schema.nodes.paragraph.create(null, [
			schema.text('See '),
			link('exmaple.com', 'https://exmaple.com'),
			schema.text(' for detials.')
		]);
		const out = textWithoutLinks(p);
		expect(out).toBe('See ' + ' '.repeat('exmaple.com'.length) + ' for detials.');
		expect(out.length).toBe(p.textContent.length);
		expect(out.indexOf('detials')).toBe(p.textContent.indexOf('detials'));
	});

	it('wraps inline atoms in dollars like the default extraction', () => {
		const p = schema.nodes.paragraph.create(null, [
			schema.text('Let '),
			schema.nodes.math.create(null, schema.text('x')),
			schema.text(' be small.')
		]);
		expect(textWithoutLinks(p)).toBe('Let $x$ be small.');
	});
});
