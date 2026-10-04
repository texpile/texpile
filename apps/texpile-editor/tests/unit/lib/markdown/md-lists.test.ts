import { describe, it, expect } from 'vitest';
import { EditorState } from 'prosemirror-state';
import { gen, editBlock, docOf, para } from './mdTestUtils';
import { mdSchema } from '$lib/languages/markdown/visual/schema';
import { markdownToProseMirror } from '$lib/languages/markdown/visual/converter';
import { serializeToMarkdown } from '$lib/languages/markdown/visual/serializer';
import { listAttrInheritance } from '$lib/languages/markdown/visual/listAttrInheritance';

function item(attrs: Record<string, unknown>, text: string) {
	return mdSchema.nodes.list.create(attrs, para(text));
}

describe('markdown lists', () => {
	// M2
	it('write a nested list right under its item in a tight list', () => {
		expect(gen('- a\n  - b\n- c\n')).toBe('- a\n  - b\n- c');
		expect(gen('1. a\n   - b\n     1. c\n2. d\n')).toBe('1. a\n   - b\n     1. c\n2. d');
	});

	// M11
	it('keep loose lists loose and tight lists tight', () => {
		expect(gen('- a\n\n- b\n\n- c\n')).toBe('- a\n\n- b\n\n- c');
		expect(gen('- [ ] a\n- plain\n- [x] c\n')).toBe('- [ ] a\n- plain\n- [x] c');
		expect(gen('- a\n\n  - b\n- c\n')).toBe('- a\n\n  - b\n\n- c');
	});

	// M10, M25
	it('keep separate lists separate through their markers and delimiters', () => {
		expect(gen('1. a\n2. b\n\n1) c\n2) d\n')).toBe('1. a\n2. b\n\n1) c\n2) d');
		expect(gen('- a\n- b\n\n* c\n* d\n\n+ e\n')).toBe('- a\n- b\n\n* c\n* d\n\n+ e');
		expect(gen('3. three\n4. four\n5. five\n')).toBe('3. three\n4. four\n5. five');
	});

	// M18
	it('keep an ordered task list ordered', () => {
		expect(gen('1. [ ] a\n2. [x] b\n')).toBe('1. [ ] a\n2. [x] b');
	});

	// M8
	it('read the task box from the source, not the parsed text', () => {
		expect(gen('- \\[x\\] literal\n')).toBe('- \\[x\\] literal');
		expect(gen('- **[x] a**\n')).toBe('- **\\[x\\] a**');
		expect(markdownToProseMirror('- \\[x\\] literal\n').doc.child(0).attrs.kind).toBe('bullet');
	});

	it('keep a task item with nothing in it a task item', () => {
		const empty = mdSchema.nodes.list.create({ kind: 'task', checked: false }, mdSchema.nodes.paragraph.create());
		const out = serializeToMarkdown(docOf(empty, item({ kind: 'task', checked: true }, 'done')));
		const items: string[] = [];
		markdownToProseMirror(out).doc.forEach((n) => items.push(`${n.attrs.kind} ${n.attrs.checked} ${JSON.stringify(n.textContent)}`));
		expect(items).toEqual(['task false ""', 'task true "done"']);
		expect(gen('- [ ]\n- [x]\n')).toBe('- [ ]\n- [x]');
	});

	// M20
	it('do not grow the gap after a list on each edit of the next block', () => {
		let src = '- a\n- b\n\npara\n';
		for (let i = 0; i < 3; i++) {
			src = editBlock(src, 2, `EDIT${i}`);
			expect(src).toBe(`- a\n- b\n\nEDIT${i}\n`);
		}
	});

	// indenting a list's first item wraps it in an item of its own kind with nothing to tick
	it('write no task box on an item that opens with a nested list', () => {
		const nested = mdSchema.nodes.list.create({ kind: 'task', checked: false }, item({ kind: 'task', checked: false }, 'a'));
		const out = serializeToMarkdown(docOf(nested));
		expect(out).toBe('- - [ ] a');
		expect(gen(out)).toBe(out);
	});

	it('coalesce editor-made items with the list around them', () => {
		expect(serializeToMarkdown(docOf(item({ kind: 'bullet' }, 'a'), item({ kind: 'bullet' }, 'b')))).toBe('- a\n- b');
		expect(serializeToMarkdown(docOf(item({ kind: 'ordered', order: 4 }, 'a'), item({ kind: 'ordered' }, 'b')))).toBe('4. a\n5. b');
	});

	it('an item the editor adds inherits the marker of its list', () => {
		const doc = markdownToProseMirror('* a\n* b\n').doc;
		let state = EditorState.create({ doc, plugins: [listAttrInheritance] });
		state = state.apply(state.tr.insert(doc.content.size, item({ kind: 'bullet' }, 'c')));
		expect(state.doc.child(2).attrs.marker).toBe('*');
		expect(serializeToMarkdown(state.doc)).toBe('* a\n* b\n* c');
	});
});
