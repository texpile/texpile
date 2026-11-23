// the core base against S1.0's recordings: the root, paragraphs by container and headings in three languages
import { readFileSync } from 'node:fs';
import type { Node as PMNode } from 'prosemirror-model';
import { describe, expect, it } from 'vitest';
import { faceElement } from '$lib/editor/canvas';
import { CanvasStyleResolver } from '$lib/editor/canvas/style/canvasStyles';
import type { BaseSettings, StyleLanguage, StyleNodeSource } from '$lib/editor/canvas/style/base/baseTypes';
import { headingNumberLook } from '$lib/editor/canvas/style/base/coreNodeLooks';
import { createStyleBase } from '$lib/editor/canvas/style/base/styleBase';
import type { FaceElement } from '$lib/editor/canvas/tree/faceElement';
import { parseMarkdownFile } from '$lib/languages/markdown/visual/roundtrip';
import { parseTypstFile } from '$lib/languages/typst/visual/roundtrip';
import { parseLatexFile } from '$lib/workspace/latexRoundtrip';
import { loadRecording, parityDocumentPath, runDifferences, styleDifferences, type RecordedRow } from '../parity/parityRecording';
import { parityTokens } from '../parity/parityTokens';

const PARSERS = { latex: parseLatexFile, markdown: parseMarkdownFile, typst: parseTypstFile } as const;
const OWNED_BY_PARAGRAPH = /^layout\.(display|margin|font\.sizePx|lineHeight|textIndent|position)\b/;
const CORE_CONTAINERS = new Set(['doc', 'blockquote']);

type Case = {
	name: string;
	folder: string;
	file: string;
	language: StyleLanguage;
	recording: string;
	viewportWidth?: number;
	pageView?: boolean;
	/** the document has no bold, italic or code run */
	noMarks?: boolean;
};

const CASES: Case[] = [
	{ name: 'LaTeX', folder: 'parity-tex-body', file: 'main.tex', language: 'latex', recording: 'parity-tex-body__main_tex@light.json' },
	{ name: 'Markdown', folder: 'parity-md-body', file: 'main.md', language: 'markdown', recording: 'parity-md-body__main_md@light.json' },
	{
		name: 'Markdown below 768 px',
		folder: 'parity-md-body',
		file: 'main.md',
		language: 'markdown',
		recording: 'parity-md-body__main_md@narrow.json',
		viewportWidth: 700
	},
	{ name: 'Typst', folder: 'parity-typ-body', file: 'main.typ', language: 'typst', recording: 'parity-typ-body__main_typ@light.json' },
	{
		name: 'LaTeX theorems',
		folder: 'parity-tex-theorems',
		file: 'main.tex',
		language: 'latex',
		recording: 'parity-tex-theorems__main_tex@light.json'
	},
	{
		name: 'Typst theorems',
		folder: 'parity-typ-body',
		file: 'thm.typ',
		language: 'typst',
		recording: 'parity-typ-body__thm_typ@light.json',
		noMarks: true
	},
	{
		name: 'Typst slides',
		folder: 'parity-typ-body',
		file: 'slides.typ',
		language: 'typst',
		recording: 'parity-typ-body__slides_typ@light.json',
		noMarks: true
	},
	{
		name: 'Typst grids',
		folder: 'parity-typ-drive',
		file: 'matrix.pristine.typ',
		language: 'typst',
		recording: 'parity-typ-drive__matrix_pristine_typ@light.json'
	}
];

/** each distinct property difference once, with how many rows have it */
function summarize(failures: string[]): string[] {
	const counts = new Map<string, number>();
	for (const failure of failures) {
		const key = failure.replace(/@\d+/, '').replace(/ in \w+/, '');
		counts.set(key, (counts.get(key) ?? 0) + 1);
	}
	return [...counts].map(([key, count]) => `${count}x ${key}`);
}

/** what the list, term and display formula views set on the paragraph beside them (S1.6, S1.7, W12) */
function otherViewsSet(doc: PMNode, pos: number): RegExp | undefined {
	const $pos = doc.resolve(pos);
	if ($pos.parent.type.name === 'list')
		return $pos.parent.attrs.envName === 'thebibliography' ? /^layout\.(margin|textIndent)/ : /^layout\.margin/;
	if ($pos.nodeBefore?.type.name === 'block_math') return /^layout\.margin\.top/;
	return undefined;
}

function tagOf(node: PMNode): string {
	if (node.type.name === 'heading') return `h${node.attrs.level as number}`;
	return { paragraph: 'p', blockquote: 'blockquote', horizontal_rule: 'hr' }[node.type.name] ?? 'div';
}

function setup(doc: PMNode, language: StyleLanguage, scheme: 'light' | 'dark', extra: Partial<BaseSettings> = {}) {
	const refs = new WeakMap<FaceElement, { node: PMNode; getPos: () => number }>();
	const source: StyleNodeSource = { nodeOf: (el) => refs.get(el) ?? null, doc: () => doc };
	const settings: BaseSettings = { language, pageView: false, readOnly: false, viewportWidth: 1280, editorFont: null, ...extra };
	const styles = new CanvasStyleResolver({
		base: createStyleBase(source, () => settings),
		tokens: parityTokens(scheme),
		viewport: () => ({ width: 1280, height: 860 })
	});
	/** the element of the node at pos, under an unstyled div for each container above it */
	function elementAt(pos: number): { el: FaceElement; core: boolean } {
		const $pos = doc.resolve(pos);
		let parent: FaceElement | null = null;
		let core = true;
		for (let depth = 1; depth <= $pos.depth; depth++) {
			const container = faceElement(tagOf($pos.node(depth)));
			refs.set(container, { node: $pos.node(depth), getPos: () => $pos.before(depth) });
			core &&= CORE_CONTAINERS.has($pos.node(depth).type.name);
			parent?.appendChild(container);
			parent ??= container;
			if (parent !== container) parent = container;
		}
		const node = doc.nodeAt(pos)!;
		const el = faceElement(tagOf(node));
		refs.set(el, { node, getPos: () => pos });
		parent?.appendChild(el);
		return { el, core };
	}
	return { styles, elementAt };
}

function coreRows(recording: ReturnType<typeof loadRecording>, doc: PMNode, types: string[]): RecordedRow[] {
	return recording.rows.filter(
		(row) => row.path === '' && row.pseudo === '' && types.includes(row.nodeType) && doc.nodeAt(row.pos)?.type.name === row.nodeType
	);
}

for (const entry of CASES) {
	const path = parityDocumentPath(entry.folder, entry.file);
	describe.skipIf(!path)(`core base against the ${entry.name} recording`, () => {
		if (!path) return;
		const { doc } = PARSERS[entry.language](readFileSync(path!, 'utf8')) as { doc: PMNode };
		const recording = loadRecording(entry.recording);
		const { styles, elementAt } = setup(doc, entry.language, 'light', { viewportWidth: entry.viewportWidth ?? 1280 });

		it('styles headings, blockquotes and rules as recorded', () => {
			const rows = coreRows(recording, doc, ['heading', 'blockquote', 'horizontal_rule']);
			expect(rows.length).toBeGreaterThan(0);
			const failures = rows.flatMap((row) => {
				const { el } = elementAt(row.pos);
				return styleDifferences(row, styles.styleOf(el)!).map((difference) => `${row.nodeType}@${row.pos} ${difference}`);
			});
			expect(summarize(failures)).toEqual([]);
		});

		it('spaces a paragraph by its container', () => {
			const rows = coreRows(recording, doc, ['paragraph']);
			expect(rows.length).toBeGreaterThan(0);
			const failures = rows.flatMap((row) => {
				const { el, core } = elementAt(row.pos);
				return styleDifferences(row, styles.styleOf(el)!, core ? undefined : OWNED_BY_PARAGRAPH, otherViewsSet(doc, row.pos)).map(
					(difference) => `paragraph@${row.pos} in ${doc.resolve(row.pos).parent.type.name} ${difference}`
				);
			});
			expect(summarize(failures)).toEqual([]);
		});

		it('wraps a mark run in its tag as recorded', () => {
			const marks = recording.runs.filter((run) => run.chain.length === 1 && ['strong', 'em', 'code', 's'].includes(run.chain[0]));
			if (entry.noMarks) return;
			expect(marks.length).toBeGreaterThan(0);
			const failures = marks.flatMap((run) => {
				const { el } = elementAt(run.block);
				const level = { tag: run.chain[0], classes: [], attrs: {}, hovered: false };
				const style = styles.runStyle(el, { key: run.chain[0], levels: [level] });
				return runDifferences(run.style, style).map((difference) => `${run.chain[0]} ${difference}`);
			});
			expect(summarize(failures)).toEqual([]);
		});

		it('draws the heading number as recorded', () => {
			const row = recording.rows.find((r) => r.nodeType === 'heading' && r.path === '' && r.pseudo === 'before');
			if (!row) return;
			const { el } = elementAt(row.pos);
			const part = faceElement('span');
			Object.assign(part.style, headingNumberLook(doc.nodeAt(row.pos)!.attrs.level as number));
			el.generatedBefore = part;
			const failures = styleDifferences(row, styles.styleOf(el, 'before')!, /^(paint\.(color|userSelect)|layout\.(font\.weight|margin))/);
			expect(failures).toEqual([]);
		});
	});
}

describe('the root against the recordings', () => {
	const path = parityDocumentPath('parity-tex-body', 'main.tex');
	// A1 keeps three caret lines of room under the document, where the DOM editor had 2rem
	const ROOT_ONLY = /^layout\.(flex|padding\.bottom)/;
	it.skipIf(!path)('styles the editor root, the page view sheet included, in both schemes', () => {
		const { doc } = parseLatexFile(readFileSync(path!, 'utf8')) as { doc: PMNode };
		const failures: string[] = [];
		for (const [name, scheme, pageView] of [
			['parity-tex-body__main_tex@light.json', 'light', false],
			['parity-tex-body__main_tex@dark.json', 'dark', false],
			['parity-tex-body__main_tex@page-light.json', 'light', true],
			['parity-tex-body__main_tex@page-dark.json', 'dark', true]
		] as const) {
			const { styles } = setup(doc, 'latex', scheme, { pageView });
			const { layout, paint } = styles.rootStyle();
			for (const difference of styleDifferences(loadRecording(name).root, { layout, paint }, undefined, ROOT_ONLY))
				failures.push(`${name} ${difference}`);
		}
		expect(failures).toEqual([]);
	});
});
