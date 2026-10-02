// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { readFileSync, statSync } from 'node:fs';
import { EditorState } from 'prosemirror-state';
import type { Node as PMNode } from 'prosemirror-model';
import { activeSuggestions, takeTypedSides } from '$lib/comments/activeSuggestions.svelte';
import { placePmSuggestions } from '$lib/editor/visual/extensions/pmSuggestionsPlace';
import { padTables } from '$lib/editor/visual/padTables';
import { computeBlockPatch, syncParseAttrs } from '$lib/editor/visual/blockPatch';
import { parseCarryPlugin } from '$lib/editor/visual/parseCarry';
import { adoptParse } from '$lib/editor/visual/parseOrigins';
import { serializeLatexFileDetailed, type ParsedLatexFile } from '$lib/workspace/latexRoundtrip';
import { serializeMarkdownFileDetailed } from '$lib/languages/markdown/visual/roundtrip';
import { serializeTypstFileDetailed } from '$lib/languages/typst/visual/roundtrip';
import {
	FORMATS,
	drawnReading,
	oldWordsOf,
	pick,
	prng,
	randomEdit,
	renderedText,
	suggestionSource,
	typed,
	type Format
} from './visualEditsFuzz';

let disk: Record<string, string> = {};

vi.mock('$lib/workspace/fileSystem', () => ({
	readTextFile: async (path: string) => {
		const hit = Object.entries(disk).find(([k]) => path.replace(/\\/g, '/').endsWith(k));
		if (!hit) throw new Error(`ENOENT ${path}`);
		return hit[1];
	},
	writeTextFile: async (_path: string, text: string) => {
		disk['.texpile/comments.jsonl'] = text;
	},
	joinPath: (a: string, b: string) => `${a}/${b}`
}));
vi.mock('$lib/workspace/texpileDir', () => ({
	texpilePath: (root: string, name: string) => `${root}/.texpile/${name}`,
	ensureTexpileIgnore: async () => {}
}));
let who = 'me';
vi.mock('$lib/comments/author', () => ({ resolveAuthor: async () => who, forgetAuthor: () => {} }));

const { CommentsController } = await import('$lib/workspace/commentsController.svelte');

const ROOT = '/w';
const RUNS = Number(process.env.SUGGEST_VISUAL_RUNS ?? 12);
const DETAILED = { tex: serializeLatexFileDetailed, md: serializeMarkdownFileDetailed, typ: serializeTypstFileDetailed };
const ONLY = Number(process.env.VISUAL_FUZZ_ONLY ?? 0);

const paragraphs = (s: string) =>
	s
		.split(/\n[ \t\r]*\n\s*/)
		.map((p) => p.replace(/\s+/g, ''))
		.filter(Boolean)
		.join('\n\n');

async function session(f: Format, original: string, run: number): Promise<{ text: string; refused: number; log: string[] }> {
	disk = {};
	activeSuggestions.current = [];
	// the editors note a caret side on a module of their own, which the controller drains on its next
	// comparison. A run that ends before that leaves one behind, and ids repeat between runs here
	takeTypedSides();
	const rnd = prng(run * 104729);
	const rel = `doc.${f.name}`;
	const FILE = `${ROOT}/${rel}`;
	const log: string[] = [];
	let text = original;
	let visual = true;
	let meta!: ParsedLatexFile;
	let state!: EditorState;
	const mount = () => {
		meta = f.parse(text);
		// the editor's own plugin list hands the parse on to every document a transaction makes
		state = EditorState.create({ doc: padTables(meta.doc), plugins: [parseCarryPlugin] });
	};
	mount();
	const make = () =>
		new CommentsController({
			root: () => ROOT,
			preferredAuthor: () => who,
			openFileAt: () => {},
			activeText: () => text,
			mode: () => 'suggesting',
			rewraps: () => visual,
			applyEdit: async (e) => {
				const next = text.slice(0, e.from) + e.insert + text.slice(e.to);
				if (!visual) {
					text = next;
					return true;
				}
				const parsed = f.parse(next);
				if (parsed.preamble !== meta.preamble || parsed.postamble !== meta.postamble) {
					text = next;
					mount();
					return true;
				}
				const patch = computeBlockPatch(state.doc, parsed.doc);
				const tr = state.tr;
				if (patch) tr.replaceWith(patch.from, patch.to, patch.nodes);
				syncParseAttrs(tr, parsed.doc);
				if (tr.steps.length) state = state.apply(tr);
				// the document is the parse's from here on, steps or none: the same content may now
				// come from other bytes (a restored "..." the parser reads as its ellipsis)
				adoptParse(state.doc, parsed.origins);
				text = f.serialize(meta, state.doc);
				return true;
			},
			saveNow: () => {}
		});
	let ctl = make();
	await ctl.load(ROOT);
	ctl.reanchor(FILE, text);

	const steps = 3 + Math.floor(rnd() * 18);
	for (let i = 0; i < steps; i++) {
		who = rnd() < 0.8 ? 'me' : 'mei';
		const roll = rnd();
		if (roll < 0.08) {
			visual = !visual;
			if (visual) mount();
			log.push(visual ? 'to visual' : 'to source');
			continue;
		}
		if (roll < 0.14) {
			await ctl.suggestions.beforeSave(rel, text);
			ctl = make();
			await ctl.load(ROOT);
			if (visual) mount();
			ctl.reanchor(FILE, text);
			log.push('save and reopen');
			continue;
		}
		if (visual) {
			const edit = randomEdit(state, rnd, true);
			if (!edit) continue;
			state = state.apply(edit.tr);
			log.push(edit.label);
			const next = f.serialize(meta, state.doc);
			if (next === text) continue;
			text = next;
		} else {
			const at = Math.floor(rnd() * (text.length + 1));
			const to = rnd() < 0.4 ? at : Math.min(text.length, at + Math.floor(rnd() * 12));
			const insert = rnd() < 0.2 ? pick(rnd, ['\n', '\n\n', ' ', '']) : typed(rnd);
			if (/[\uDC00-\uDFFF]/.test(text[at] ?? '') || /[\uDC00-\uDFFF]/.test(text[to] ?? '')) continue;
			log.push(`source [${at},${to}) ${JSON.stringify(text.slice(at, to))} -> ${JSON.stringify(insert)}`);
			text = text.slice(0, at) + insert + text.slice(to);
		}
		ctl.suggestions.textChanged(FILE, text);
		if (rnd() < 0.5) await new Promise((r) => setTimeout(r, 0));
		if (rnd() < 0.3) await ctl.suggestions.settle();
	}
	await ctl.suggestions.settle();
	let refused = 0;
	for (const t of ctl.threads.filter((x) => x.restore !== undefined && !x.resolved).sort(() => rnd() - 0.5)) {
		if (rnd() < 0.15) {
			visual = !visual;
			if (visual) mount();
		}
		if (!(await ctl.suggestions.reject(t))) refused++;
	}
	return { text, refused, log };
}

type Edit = (s: EditorState) => EditorState;

async function suggestTyping(f: Format, original: string, edits: Edit[]) {
	disk = {};
	who = 'me';
	activeSuggestions.current = [];
	takeTypedSides();
	let text = original;
	const meta = f.parse(text);
	let state = EditorState.create({ doc: meta.doc, plugins: [parseCarryPlugin] });
	let map = meta.map;
	const ctl = new CommentsController({
		root: () => ROOT,
		preferredAuthor: () => who,
		openFileAt: () => {},
		activeText: () => text,
		mode: () => 'suggesting',
		rewraps: () => true,
		applyEdit: async () => false,
		saveNow: () => {}
	});
	await ctl.load(ROOT);
	ctl.reanchor(`${ROOT}/doc.${f.name}`, text);
	for (const edit of edits) {
		const next = edit(state);
		if (next === state) continue;
		state = next;
		({ text, map } = DETAILED[f.name](meta, state.doc));
		ctl.suggestions.textChanged(`${ROOT}/doc.${f.name}`, text);
		await ctl.suggestions.settle();
	}
	const marks = activeSuggestions.current;
	// placed as the editor places them while typing: on the document it holds, with the map its serializer
	// wrote; and as it places them once the file is reopened
	const shown = state.doc;
	const placed = placePmSuggestions(shown, marks, { ...suggestionSource(f, meta, text), map });
	const parsed = f.parse(text);
	const reopened = { shown: parsed.doc, placed: placePmSuggestions(parsed.doc, marks, suggestionSource(f, parsed, text)) };
	if (process.env.SUGGEST_DEBUG)
		console.log(
			'PLACED ' +
				JSON.stringify({
					marks: marks.map((m) => ({ from: m.from, to: m.to, quote: m.anchor.quote, restore: m.restore })),
					ranges: placed.ranges.map((r) => ({
						...r,
						old: oldWordsOf(r),
						gone: undefined,
						was: r.was?.type.name,
						text: shown.textBetween(r.from, r.to, '|')
					})),
					partial: [...placed.partial],
					hidden: [...placed.hidden]
				})
		);
	return { text, marks, shown, placed, reopened };
}

function blockEnd(s: EditorState, block: number): number {
	let pos = 0;
	for (let i = 0; i <= block; i++) pos += s.doc.child(i).nodeSize;
	return pos - 1;
}

describe('suggestions made in the visual editor', () => {
	it('draws what is typed as words rather than a region', async () => {
		const sources = {
			tex: '\\documentclass{article}\n\\begin{document}\nAn inline \\textit{quotation} sits in running text. \\par\nA second one follows here.\n\nA third paragraph ends it.\n\\end{document}\n',
			md: 'An inline *quotation* sits in running text.\n\nA second one follows here.\n\nA third paragraph ends it.\n',
			typ: 'An inline _quotation_ sits in running text.\n\nA second one follows here.\n\nA third paragraph ends it.\n'
		};
		const edits: Record<string, Edit[]> = {
			'new paragraphs at the end': [
				(s) => s.apply(s.tr.split(blockEnd(s, s.doc.childCount - 1))),
				(s) => s.apply(s.tr.insertText('Fresh words typed here.', blockEnd(s, s.doc.childCount - 1))),
				(s) => s.apply(s.tr.split(blockEnd(s, s.doc.childCount - 1))),
				(s) => s.apply(s.tr.insertText('More fresh words.', blockEnd(s, s.doc.childCount - 1)))
			],
			'words at the end of each paragraph': [0, 1, 2].map(
				(i) => (s: EditorState) => s.apply(s.tr.insertText(' Typed 50% & more.', blockEnd(s, i)))
			),
			'words typed over a formatted phrase': [
				(s) => s.apply(s.tr.insertText('Hello there', 1, 1 + s.doc.child(0).textContent.indexOf(' text.')))
			]
		};
		for (const f of FORMATS) {
			for (const [name, steps] of Object.entries(edits)) {
				const { marks, placed } = await suggestTyping(f, sources[f.name], steps);
				expect({ format: f.name, name, drawn: placed.ranges.filter((r) => !r.partial).length }).toEqual({
					format: f.name,
					name,
					drawn: marks.length
				});
			}
			const { placed } = await suggestTyping(f, sources[f.name], edits['words typed over a formatted phrase']);
			expect(placed.ranges[0].old.map((run) => [run.text, run.marks.map((m) => m.type.name)])).toEqual([
				['An inline ', []],
				['quotation', ['em']],
				[' sits in running', []]
			]);
		}
		// two paragraphs joined with words taken from both: what was taken out stands where the text broke
		const joined = await suggestTyping(FORMATS[0], sources.tex, [(s) => s.apply(s.tr.delete(blockEnd(s, 0) - 5, blockEnd(s, 0) + 8))]);
		expect([...joined.placed.partial]).toHaveLength(0);
		const gone = joined.placed.ranges.find((r) => r.gone)!;
		expect(gone.gone!.head.map((r) => r.text).join('')).toBe('text.');
		expect(gone.gone!.tail.map((r) => r.text).join('')).toBe('A seco');
		expect(joined.shown.resolve(gone.from).parent.type.name).toBe('paragraph');
	});

	it('sets the formula a change was made in beside the one it was', async () => {
		const sources = {
			tex: '\\documentclass{article}\n\\begin{document}\nA line with an inline $\\alpha^{2}$ in it.\n\n\\[\n\\frac{a}{b} = c\n\\]\n\\end{document}\n',
			md: 'A line with an inline $\\alpha^{2}$ in it.\n\n$$\n\\frac{a}{b} = c\n$$\n',
			typ: 'A line with an inline $alpha^2$ in it.\n\n$ a/b = c $\n'
		};
		const append = (kind: string): Edit[] => [
			(s) => {
				let hit: { pos: number; node: PMNode } | null = null;
				s.doc.descendants((node, pos) => {
					if (!hit && node.type.name === kind) hit = { pos, node };
					return !hit;
				});
				if (!hit) return s;
				const { pos, node } = hit as { pos: number; node: PMNode };
				return s.apply(s.tr.insertText('+1', pos + 1 + node.content.size));
			}
		];
		for (const f of FORMATS) {
			// a Typst equation holds its Typst
			for (const [kind, was] of [
				['inline_math', f.name === 'typ' ? 'alpha^2' : '\\alpha^{2}'],
				['block_math', f.name === 'typ' ? 'a/b = c' : '\\frac{a}{b} = c']
			]) {
				const { placed } = await suggestTyping(f, sources[f.name], append(kind));
				const outline = placed.ranges.find((r) => r.node);
				expect({ format: f.name, kind, was: outline?.was?.textContent, partial: placed.ranges.length === 1 && outline?.partial }).toEqual({
					format: f.name,
					kind,
					was,
					partial: false
				});
			}
		}
	});

	it('stands a whole block that was taken out where it stood, rather than tinting its neighbour', async () => {
		const sources = {
			tex: '\\documentclass{article}\n\\begin{document}\nOpening words about the weather.\n\nA middle one naming several cities.\n\nThe last, which counts sheep.\n\\end{document}\n',
			md: 'Opening words about the weather.\n\nA middle one naming several cities.\n\nThe last, which counts sheep.\n',
			typ: 'Opening words about the weather.\n\nA middle one naming several cities.\n\nThe last, which counts sheep.\n'
		};
		const cut = (i: number): Edit[] => [
			(s) => {
				let pos = 0;
				for (let k = 0; k < i; k++) pos += s.doc.child(k).nodeSize;
				return s.apply(s.tr.delete(pos, pos + s.doc.child(i).nodeSize));
			}
		];
		for (const f of FORMATS) {
			for (const i of [1, 2, 0]) {
				const { text, marks, shown, placed } = await suggestTyping(f, sources[f.name], cut(i));
				const drawn = placed.ranges.filter((r) => r.gone);
				expect({ format: f.name, i, drawn: drawn.length, regions: placed.partial.size }).toEqual({
					format: f.name,
					i,
					drawn: 1,
					regions: 0
				});
				// and it reads exactly as rejecting it does, the same rule the fuzz holds the words tier to
				let rejected = text;
				for (const m of marks.filter((x) => drawn.some((r) => r.id === x.id)).sort((a, b) => b.from - a.from))
					rejected = rejected.slice(0, m.from) + m.restore + rejected.slice(m.to);
				expect(
					renderedText(
						shown,
						drawn.map((r) => ({ from: r.from, to: r.to, words: oldWordsOf(r) }))
					)
				).toBe(renderedText(f.parse(rejected).doc));
			}
		}
	});

	// the last block's words closing as the heading they joined read as a change after the cut, so the cut was
	// compared to the end of the file and drawn as whole words struck and retyped ("title 1 ... After text" for "tier text")
	it('draws a cut from inside a heading into a later block as just what it took', async () => {
		const sources = {
			tex: '\\documentclass{article}\n\\begin{document}\n\\section{title 1}\n\nNew line text here, a few words long.\n\n\\section{Title 2}\n\nAfter text in the last paragraph.\n\\end{document}\n',
			md: '## title 1\n\nNew line text here, a few words long.\n\n## Title 2\n\nAfter text in the last paragraph.\n',
			typ: '= title 1\n\nNew line text here, a few words long.\n\n= Title 2\n\nAfter text in the last paragraph.\n'
		};
		const at = (s: EditorState, word: string, off: number) => {
			let found = -1;
			s.doc.descendants((n, pos) => {
				if (found < 0 && n.isText && n.text!.includes(word)) found = pos + n.text!.indexOf(word) + off;
				return found < 0;
			});
			return found;
		};
		const cuts: [string, number, string, number, string][] = [
			['New line', 4, 'Title 2', 2, 'line text here, a few words long.\n\nTi'],
			['title 1', 2, 'Title 2', 2, '1\nNew line text here, a few words long.\nTitle '],
			// LaTeX moves the heading's closing brace past the words it took in, which is not a cut alone
			['title 1', 2, 'After text', 3, 'tle 1\nNew line text here, a few words long.\nTitle 2\nAft']
		];
		for (const f of FORMATS) {
			for (const [a, ao, b, bo, old] of f.name === 'tex' ? cuts.slice(0, 2) : cuts) {
				const { shown, placed } = await suggestTyping(f, sources[f.name], [(s) => s.apply(s.tr.delete(at(s, a, ao), at(s, b, bo)))]);
				const seen = placed.ranges.filter((r) => r.gone || r.old.length || shown.textBetween(r.from, r.to).trim());
				expect({ format: f.name, cut: `${a}>${b}`, drawn: seen.map((r) => [!!r.gone, oldWordsOf(r)]) }).toEqual({
					format: f.name,
					cut: `${a}>${b}`,
					drawn: [[true, old]]
				});
			}
		}
	});

	it('tints the paragraph that was typed in when typing makes it match another', async () => {
		const alike = '\\documentclass{article}\n\\begin{document}\nThe cat sat again.\n\nThe cat sat.\n\\end{document}\n';
		const { placed, shown } = await suggestTyping(FORMATS[0], alike, [(s) => s.apply(s.tr.insertText(' again', blockEnd(s, 1) - 1))]);
		expect(placed.ranges).toHaveLength(1);
		expect(placed.ranges[0].from).toBeGreaterThan(shown.child(0).nodeSize);
	});

	for (const f of FORMATS) {
		it(`${f.name}: draws old and new words exactly as rejecting them reads`, async () => {
			const files = f.files.filter((p) => statSync(p).size < 20_000);
			if (!files.length) return;
			const failures: string[] = [];
			for (let run = ONLY || 1; run <= (ONLY || RUNS * 4) && failures.length < 2; run++) {
				const rnd = prng(run * 7919);
				const original = readFileSync(files[run % files.length], 'utf8').replace(/\r\n/g, '\n');
				const steps = Array.from({ length: 1 + Math.floor(rnd() * 4) }, () => (s: EditorState) => {
					const edit = randomEdit(s, rnd, true);
					return edit ? s.apply(edit.tr) : s;
				});
				const { text, marks, shown, placed, reopened } = await suggestTyping(f, original, steps);
				// the reading compared is the file's, so an editor holding what the file does not write (an
				// empty paragraph, a formula as typed) is held to it only once the file is reopened
				const views = [...(renderedText(shown) === renderedText(f.parse(text).doc) ? [{ when: 'typing', shown, placed }] : [])];
				views.push({ when: 'reopened', ...reopened });
				for (const view of views) {
					// every mark drawn in full is put back, a break mark or a chip outline included (they say
					// nothing readable as text, and one edit can arrive as several marks that only read right
					// together); what is read is the words and the blocks
					const whole = marks.filter((m) => !view.placed.partial.has(m.id) && view.placed.ranges.some((r) => r.id === m.id));
					const drawn = view.placed.ranges.filter((r) => whole.some((m) => m.id === r.id));
					if (!whole.length) continue;
					let rejected = text;
					for (const m of [...whole].sort((a, b) => b.from - a.from))
						rejected = rejected.slice(0, m.from) + m.restore + rejected.slice(m.to);
					const want = renderedText(f.parse(rejected).doc);
					const got = renderedText(
						view.shown,
						drawn.flatMap((r) => drawnReading(r) ?? [])
					);
					if (want === got) continue;
					if (ONLY)
						console.log(
							'PLACED ' +
								JSON.stringify({
									when: view.when,
									marks: marks.map((m) => ({
										from: m.from,
										to: m.to,
										quote: m.anchor.quote,
										restore: m.restore,
										prefix: m.anchor.prefix,
										suffix: m.anchor.suffix
									})),
									drawn: view.placed.ranges.map((r) => ({
										id: r.id.slice(0, 4),
										from: r.from,
										to: r.to,
										old: oldWordsOf(r),
										text: view.shown.textBetween(r.from, r.to, '|'),
										node: r.node,
										brk: r.brk,
										partial: r.partial
									})),
									partial: [...view.placed.partial],
									hidden: [...view.placed.hidden],
									blocks: (() => {
										const out: string[] = [];
										view.shown.forEach((n, pos) => out.push(`${pos}:${n.type.name}:${JSON.stringify(n.textContent.slice(0, 50))}`));
										return out;
									})()
								})
						);
					let s = 0;
					while (want[s] === got[s]) s++;
					failures.push(
						`run ${run} (${files[run % files.length]}), ${view.when}:\n want …${JSON.stringify(want.slice(Math.max(0, s - 60), s + 60))}\n got  …${JSON.stringify(got.slice(Math.max(0, s - 60), s + 60))}`
					);
					break;
				}
			}
			expect(failures).toEqual([]);
		}, 600_000);
	}

	for (const f of FORMATS) {
		it(`${f.name}: gives back every word and paragraph once all are rejected`, async () => {
			const files = f.files.filter((p) => statSync(p).size < 20_000);
			if (!files.length) return;
			const failures: string[] = [];
			for (let run = ONLY || 1; run <= (ONLY || RUNS) && failures.length < 2; run++) {
				const file = files[run % files.length];
				const original = readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
				const r = await session(f, original, run);
				if (r.refused || paragraphs(r.text) !== paragraphs(original)) {
					const a = paragraphs(original);
					const b = paragraphs(r.text);
					let s = 0;
					while (s < a.length && a[s] === b[s]) s++;
					failures.push(
						`run ${run} (${file}): ${r.refused} refused\n original: …${JSON.stringify(a.slice(Math.max(0, s - 60), s + 80))}\n rejected: …${JSON.stringify(b.slice(Math.max(0, s - 60), s + 80))}\n steps: ${r.log.join(' | ')}`
					);
				}
			}
			expect(failures).toEqual([]);
		}, 600_000);
	}
});
