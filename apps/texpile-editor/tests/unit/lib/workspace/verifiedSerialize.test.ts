// the save check: a file must parse back to the document it was written from, and when it does
// not, only the blocks written from the document are written whole, never the untouched ones
import { describe, it, expect } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import { createDedentListCommand } from 'prosemirror-flat-list';
import { Fragment, type Node as PMNode } from 'prosemirror-model';
import { parseLatexFile, serializeLatexFileDetailed } from '$lib/workspace/latexRoundtrip';
import { parseMarkdownFile, serializeMarkdownFileDetailed } from '$lib/languages/markdown/visual/roundtrip';
import { changedBlocks, verifiedSerialize, type Serialized } from '$lib/workspace/verifiedSerialize';
import { FORMATS, prng, randomEdit } from './visualEditsFuzz';

const SRC = [
	'\\documentclass{article}',
	'\\begin{document}',
	'Alpha   one. % keep this',
	'',
	'Beta two.',
	'',
	'Gamma  three  as written.',
	'',
	'Delta four.',
	'\\end{document}',
	''
].join('\n');

function retyped(doc: PMNode, i: number, text: string): PMNode {
	const child = doc.child(i);
	const kids: PMNode[] = [];
	doc.forEach((c, _o, k) => kids.push(k === i ? child.type.create(child.attrs, child.type.schema.text(text), child.marks) : c));
	return doc.copy(Fragment.fromArray(kids));
}

function edited(): { parsed: ReturnType<typeof parseLatexFile>; doc: PMNode; first: Serialized } {
	const parsed = parseLatexFile(SRC);
	const doc = retyped(parsed.doc, 1, 'Beta changed.');
	return { parsed, doc, first: serializeLatexFileDetailed(parsed, doc) };
}

const realParse = (text: string) => Promise.resolve(parseLatexFile(text).doc);

describe('the save check', () => {
	it('names the changed blocks: the ones the parse no longer knows', () => {
		const { doc } = edited();
		expect(changedBlocks(doc)).toEqual([1]);
	});

	it('leaves a file that reads back as the document alone', async () => {
		const { parsed, doc, first } = edited();
		const v = await verifiedSerialize({
			format: 'tex',
			doc,
			first,
			serialize: (d, afresh) => serializeLatexFileDetailed(parsed, d, afresh),
			reparse: realParse
		});
		expect(v.rung).toBe(0);
		expect(v.checked).toBe(true);
		expect(v.text).toBe(first.text);
		expect(v.text).toContain('Alpha   one. % keep this\n\nBeta changed.\n\nGamma  three  as written.');
	});

	it('writes only the changed block whole when the file does not read back, the rest byte for byte', async () => {
		const { parsed, doc, first } = edited();
		// a splice that fused the edited paragraph into the next: the first attempt is broken
		const broken = { ...first, text: first.text.replace('Beta changed.\n\nGamma', 'Beta changed.Gamma') };
		let calls = 0;
		const v = await verifiedSerialize({
			format: 'tex',
			doc,
			first: broken,
			serialize: (d, afresh) => {
				calls++;
				expect(afresh.size).toBe(1);
				return serializeLatexFileDetailed(parsed, d, afresh);
			},
			reparse: realParse
		});
		expect(v.rung).toBe(1);
		expect(v.rewritten).toBe(1);
		expect(calls).toBe(1);
		expect(v.text).toBe(first.text);
		expect(v.text).toContain('Alpha   one. % keep this');
		expect(v.text).toContain('Gamma  three  as written.');
	});

	it('widens to the neighbours before giving up, and says what still differs', async () => {
		const { parsed, doc, first } = edited();
		const sizes: number[] = [];
		const v = await verifiedSerialize({
			format: 'tex',
			doc,
			first,
			serialize: (d, afresh) => {
				sizes.push(afresh.size);
				return serializeLatexFileDetailed(parsed, d, afresh);
			},
			// a reader that never sees the document: nothing the writer does can satisfy it
			reparse: () => Promise.resolve(parseLatexFile('\\documentclass{article}\n\\begin{document}\nNothing.\n\\end{document}\n').doc)
		});
		expect(v.rung).toBe(3);
		expect(sizes).toEqual([1, 3]);
		expect(v.rewritten).toBe(3);
		expect(v.difference).toMatch(/words change on reopen/);
		// the untouched block beyond the neighbours is still the file's bytes
		expect(v.text).toContain('Delta four.');
		expect(v.text).toContain('Alpha one.');
	});

	it('keeps the file as written when it cannot be parsed now', async () => {
		const { parsed, doc, first } = edited();
		const v = await verifiedSerialize({
			format: 'tex',
			doc,
			first,
			serialize: (d, afresh) => serializeLatexFileDetailed(parsed, d, afresh),
			reparse: () => Promise.resolve(null)
		});
		expect(v.rung).toBe(0);
		expect(v.checked).toBe(false);
		expect(v.text).toBe(first.text);
	});

	it('is silent on a description item Shift+Tab took out of its list, its label now plain bold', async () => {
		const parsed = parseLatexFile(
			'\\documentclass{article}\n\\begin{document}\n\\begin{description}\n\t\\item[Term] its definition.\n\\end{description}\n\\end{document}\n'
		);
		let state = EditorState.create({ doc: parsed.doc });
		state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 3)));
		expect(createDedentListCommand()(state, (tr) => (state = state.apply(tr)))).toBe(true);
		expect(state.doc.firstChild!.type.name).toBe('paragraph');
		const v = await verifiedSerialize({
			format: 'tex',
			doc: state.doc,
			first: serializeLatexFileDetailed(parsed, state.doc),
			serialize: (d, afresh) => serializeLatexFileDetailed(parsed, d, afresh),
			reparse: realParse
		});
		expect(v.rung).toBe(0);
		expect(v.text).toContain('\n\\textbf{Term} its definition.\n');
	});

	it('is silent on a markdown footnote reference whose definition was deleted, read back as its characters', async () => {
		const parsed = parseMarkdownFile('Text with a note[^1] here.\n\n[^1]: The note body.\n\nTail.\n');
		const doc = parsed.doc.copy(Fragment.fromArray([parsed.doc.child(0), parsed.doc.child(2)]));
		const v = await verifiedSerialize({
			format: 'md',
			doc,
			first: serializeMarkdownFileDetailed(parsed, doc),
			serialize: (d, afresh) => serializeMarkdownFileDetailed(parsed, d, afresh),
			reparse: (t) => Promise.resolve(parseMarkdownFile(t).doc)
		});
		expect(v.rung).toBe(0);
		expect(v.text).toBe('Text with a note[^1] here.\n\nTail.\n');
	});

	it('writes a reference link whose definition was deleted as the link the editor still shows', async () => {
		const parsed = parseMarkdownFile('A [reference link][ref] here.\n\n[ref]: https://example.com\n\nTail.\n');
		const doc = parsed.doc.copy(Fragment.fromArray([parsed.doc.child(0), parsed.doc.child(2)]));
		const v = await verifiedSerialize({
			format: 'md',
			doc,
			first: serializeMarkdownFileDetailed(parsed, doc),
			serialize: (d, afresh) => serializeMarkdownFileDetailed(parsed, d, afresh),
			reparse: (t) => Promise.resolve(parseMarkdownFile(t).doc)
		});
		expect(v.rung).toBe(1);
		expect(v.text).toBe('A [reference link](https://example.com) here.\n\nTail.\n');
	});

	it('is silent on every fixture after random edits, in every format', async () => {
		const loud: string[] = [];
		for (const f of FORMATS) {
			for (const file of f.files.slice(0, 4)) {
				const text = (await import('node:fs')).readFileSync(file, 'utf8');
				const parsed = f.parse(text);
				const rnd = prng(7);
				let state = EditorState.create({ doc: parsed.doc });
				for (let i = 0; i < 6; i++) {
					const edit = randomEdit(state, rnd);
					if (edit) state = state.apply(edit.tr);
				}
				const first = { text: f.serialize(parsed, state.doc), map: parsed.map };
				const v = await verifiedSerialize({
					format: f.name,
					doc: state.doc,
					first,
					serialize: () => first,
					reparse: (t) => Promise.resolve(f.parse(t).doc)
				});
				if (v.rung !== 0) loud.push(`${f.name} ${file}: rung ${v.rung} ${v.difference ?? ''}`);
			}
		}
		expect(loud).toEqual([]);
	});
});

// the doc after `edit`, saved through the check, and what still reads otherwise
async function savedDifference(body: string, edit: (state: EditorState) => EditorState): Promise<string | null> {
	const parsed = parseLatexFile(`\\documentclass{article}\n\\begin{document}\n${body}\\end{document}\n`);
	const doc = edit(EditorState.create({ doc: parsed.doc })).doc;
	const v = await verifiedSerialize({
		format: 'tex',
		doc,
		first: serializeLatexFileDetailed(parsed, doc),
		serialize: (d, afresh) => serializeLatexFileDetailed(parsed, d, afresh),
		reparse: realParse
	});
	return v.difference;
}

function typedAfter(words: string, typed: string) {
	return (state: EditorState) => {
		let at = -1;
		state.doc.descendants(
			(n, pos) => void (at < 0 && n.isText && n.text!.includes(words) && (at = pos + n.text!.indexOf(words) + words.length))
		);
		return state.apply(state.tr.insertText(typed, at));
	};
}

describe('saves that read back as the document', () => {
	it('an edit after a brace the file never closes', async () => {
		const body = 'Intro.\n\n{\\textit {{Balance}}\n\\begin{align}\n  a\\nonumber\\\\\n  b\n\\end{align}\n\nMore text.\n';
		expect(await savedDifference(body, typedAfter('More text', ' here'))).toBeNull();
	});

	it('a line break after an empty box that follows other words', async () => {
		const breakAfterBox = (state: EditorState) => {
			let at = -1;
			state.doc.descendants((n, pos) => void (n.type.name === 'inline_latex' && n.textContent === '\\mbox{}' && (at = pos + n.nodeSize)));
			return state.apply(state.tr.insert(at, state.schema.nodes.hard_break.create({ lineBreak: true })));
		};
		expect(await savedDifference('\\thispagestyle{empty}\n\\mbox{}\n\nText.\n', breakAfterBox)).toBeNull();
	});

	it('words typed after a comment that a brace group ends, and after a braced table cell', async () => {
		const abstract = '{Dense matching.\n%\nState of the art.\n%the end.\n}\n%Image matching.\nMore.\n\n';
		expect(await savedDifference(abstract, typedAfter('Dense matching.', ' >'))).toBeNull();
		const table = '\\begin{tabular}{ll}\n{Fully connected }     &  x \\\\\n\\end{tabular}\n';
		const afterCellChip = (state: EditorState) => {
			let at = -1;
			state.doc.descendants(
				(n, pos) => void (n.type.name === 'inline_latex' && n.textContent.startsWith('{Fully') && (at = pos + n.nodeSize))
			);
			return state.apply(state.tr.insertText('X', at));
		};
		expect(await savedDifference(table, afterCellChip)).toBeNull();
	});
});
