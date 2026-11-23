// @vitest-environment jsdom
// the drawn chips' looks against S1.0's recordings of the DOM editor: every chip of a document that stands in the core's
// containers, its parts and pseudo-parts, resolved from the looks alone
import { readFileSync } from 'node:fs';
import type { Node as PMNode } from 'prosemirror-model';
import { DecorationSet } from 'prosemirror-view';
import { describe, expect, it } from 'vitest';
import {
	faceElement,
	islandNodeViews,
	type CanvasNodeView,
	type CanvasNodeViewConstructor,
	type FaceElement,
	type VisualView
} from '$lib/editor/canvas';
import { CanvasStyleResolver } from '$lib/editor/canvas/style/canvasStyles';
import type { BaseSettings, StyleLanguage, StyleNodeSource } from '$lib/editor/canvas/style/base/baseTypes';
import { createStyleBase } from '$lib/editor/canvas/style/base/styleBase';
import { drawnChipOf, registerChipDrawing } from '$lib/editor/visual/extensions/drawnChips/chipShows';
import { rawChipViews } from '$lib/editor/visual/extensions/raw-latex/rawChipViews';
import { registerLatexCoreDrawing } from '$lib/languages/latex/visual/core/faces/latexCoreDrawing';
import { TYPST_CHIP_DRAWING } from '$lib/languages/typst/visual/extensions/typstChipKind';
import { typSchema } from '$lib/languages/typst/visual/schema';
import { parseTypstFile } from '$lib/languages/typst/visual/roundtrip';
import type { GlossEntry } from '$lib/languages/latex/visual/core';
import { templateFeaturesStore } from '$lib/stores/editorStore';
import { parseLatexFile } from '$lib/workspace/latexRoundtrip';
import { loadRecording, parityDocumentPath, styleDifferences, type RecordedRow } from '../../../../canvas/style/parity/parityRecording';
import { parityTokens } from '../../../../canvas/style/parity/parityTokens';

type Case = { name: string; folder: string; file: string; language: StyleLanguage; recording: string; shows?: string };
const CASES: Case[] = [
	{
		name: 'LaTeX body',
		folder: 'parity-tex-body',
		file: 'main.tex',
		language: 'latex',
		recording: 'parity-tex-body__main_tex@light.json',
		shows: 'drawn-definition'
	},
	{ name: 'LaTeX 2304', folder: 'p2304', file: 'main.tex', language: 'latex', recording: 'p2304__main_tex@light.json' },
	{
		name: 'LaTeX theorems',
		folder: 'parity-tex-theorems',
		file: 'main.tex',
		language: 'latex',
		recording: 'parity-tex-theorems__main_tex@light.json'
	},
	{
		name: 'LaTeX title block',
		folder: 'parity-tex-classes',
		file: 'aastex.tex',
		language: 'latex',
		recording: 'parity-tex-classes__aastex_tex@light.json',
		shows: 'title-matter'
	},
	{
		name: 'Typst drawn',
		folder: 'parity-typ-drive',
		file: 'drawn.pristine.typ',
		language: 'typst',
		recording: 'parity-typ-drive__drawn_pristine_typ@light.json'
	},
	{
		name: 'Typst body',
		folder: 'parity-typ-body',
		file: 'main.typ',
		language: 'typst',
		recording: 'parity-typ-body__main_typ@light.json',
		shows: 'drawn-definition'
	}
];
// the body document's \\newacronym and \\newglossaryentry
const GLOSSARY: GlossEntry[] = [
	{ key: 'tex', description: 'Tau Epsilon Chi', acronym: true, line: 41, short: 'TeX', long: 'Tau Epsilon Chi' },
	{ key: 'kernel', description: 'the core of a system', acronym: false, line: 42, short: 'kernel', long: '' }
];
const CORE_CONTAINERS = new Set(['doc', 'paragraph']);
/** the parts the DOM editor drew with elements the canvas paints as one replaced box */
const REPLACED_PARTS = /svg|path|vspace-shaft|vspace-head|math-static-placeholder:\d+>/;
/** a formula is one replaced element, an inline box as MathLive's inline-block placeholder was */
const FORMULA = /math-static-placeholder:\d+$/;
// deviations.json: a chip that owns its line is a block box
const SELECTION_STATE = '^paint\\.userSelect\\b';
const LINE_BOX = '^layout\\.(display|width|verticalAlign)\\b';
// theme tokens beyond the base's own (S1.0 tokens.json, light)
const EXTRA_TOKENS: Record<string, string> = {
	'--faint-text': 'color-mix(in oklab, currentColor 40%, transparent)',
	'--text-xs': '12.804px',
	'--text-xs--line-height': '1.4067',
	'--color-ref-fg': 'oklch(0.546 0.245 262.881)',
	'--color-ref-broken-fg': 'oklch(0.505 0.213 27.518)',
	'--color-surface-500': 'oklch(0.6335 0.03 248.24)'
};

/** the properties the DOM editor's state or box decided, which deviations.json accepts */
function skipped(ownsLine: boolean, selected: boolean): RegExp | undefined {
	const parts = [ownsLine && LINE_BOX, selected && SELECTION_STATE].filter(Boolean);
	return parts.length ? new RegExp(parts.join('|')) : undefined;
}

const tagOf = (node: PMNode): string => (node.type.name === 'paragraph' ? 'p' : 'div');

function parse(entry: Case, source: string): PMNode {
	if (entry.language === 'typst') {
		registerChipDrawing(typSchema, TYPST_CHIP_DRAWING);
		return (parseTypstFile(source) as { doc: PMNode }).doc;
	}
	registerLatexCoreDrawing();
	templateFeaturesStore.current = { ...templateFeaturesStore.current, glossary: GLOSSARY };
	return (parseLatexFile(source) as { doc: PMNode }).doc;
}

function elementOfPath(root: FaceElement, path: string): FaceElement | null {
	let at: FaceElement | undefined = root;
	for (const step of path.split('>').filter(Boolean)) {
		const [, tag, index] = /^([^:]+):(\d+)$/.exec(step) ?? [];
		const child: FaceElement | undefined = at?.children[Number(index)];
		if (!child || child.tagName.toLowerCase() !== tag.split('.')[0]) return null;
		at = child;
	}
	return at ?? null;
}

for (const entry of CASES) {
	const path = parityDocumentPath(entry.folder, entry.file);
	describe.skipIf(!path)(`the chip looks against the ${entry.name} recording`, () => {
		if (!path) return;
		const doc = parse(entry, readFileSync(path!, 'utf8'));
		const recording = loadRecording(entry.recording);
		const nodeViews = rawChipViews(islandNodeViews());
		const refs = new WeakMap<FaceElement, { node: PMNode; getPos: () => number }>();
		const source: StyleNodeSource = { nodeOf: (el) => refs.get(el) ?? null, doc: () => doc };
		const settings: BaseSettings = { language: entry.language, pageView: false, readOnly: false, viewportWidth: 1280, editorFont: null };
		const tokens = parityTokens('light');
		const styles = new CanvasStyleResolver({
			base: createStyleBase(source, () => settings),
			tokens: (name) => EXTRA_TOKENS[name] ?? tokens(name),
			viewport: () => ({ width: 1280, height: 860 })
		});

		/** the chip's element under the elements of its containers, or null when another view styles them */
		function chipAt(pos: number, node: PMNode): CanvasNodeView | null {
			const $pos = doc.resolve(pos);
			if (node.marks.length) return null;
			let parent: FaceElement | null = null;
			for (let depth = 1; depth <= $pos.depth; depth++) {
				if (!CORE_CONTAINERS.has($pos.node(depth).type.name)) return null;
				const container = faceElement(tagOf($pos.node(depth)));
				refs.set(container, { node: $pos.node(depth), getPos: () => $pos.before(depth) });
				parent?.appendChild(container);
				parent = container;
			}
			const make = nodeViews[node.type.name] as CanvasNodeViewConstructor;
			const view = make(node, {} as VisualView, () => pos, [], DecorationSet.empty);
			parent?.appendChild(view.dom);
			return view;
		}

		it('styles every chip and part as recorded', () => {
			const chips = new Set<number>();
			const failures: string[] = [];
			let compared = 0;
			const labels: string[] = [];
			for (const row of recording.rows) {
				const node = row.pos < 0 ? null : doc.nodeAt(row.pos);
				if (node && node.type.name === row.nodeType && drawnChipOf(node)) chips.add(row.pos);
			}
			for (const pos of chips) {
				const node = doc.nodeAt(pos)!;
				const view = chipAt(pos, node);
				if (!view) continue;
				const { dom } = view;
				// deviations.json: a chip the DOM editor left as source
				if (recording.rows.some((r: RecordedRow) => r.pos === pos && r.path.startsWith('div.cm-editor'))) continue;
				// the recording of a selected chip carries the DOM's selection state
				const selected = recording.rows.some((r: RecordedRow) => r.pos === pos && !r.path && (r.paint.outline?.width ?? 0) > 0);
				if (selected) view.selectNode!();
				for (const row of recording.rows.filter((r: RecordedRow) => r.pos === pos)) {
					const el = elementOfPath(dom, row.path);
					const label = `${node.type.name}@${pos} ${row.path || '(chip)'}${row.pseudo ? '::' + row.pseudo : ''}`;
					if (!el) {
						if (!REPLACED_PARTS.test(row.path)) failures.push(`${label} has no element`);
						continue;
					}
					const style = styles.styleOf(el, (row.pseudo || undefined) as 'before' | 'after' | undefined);
					if (!style) {
						failures.push(`${label} has no style`);
						continue;
					}
					compared++;
					labels.push(label);
					const ownsLine = !row.path && !row.pseudo && dom.classList.contains('drawn-chip-line');
					const skip = skipped(ownsLine, selected);
					const formulaSkip = FORMULA.test(row.path) ? new RegExp(`^layout\\.display\\b${skip ? `|${skip.source}` : ''}`) : skip;
					for (const difference of styleDifferences(row, style, undefined, formulaSkip)) failures.push(`${label} ${difference}`);
				}
			}
			expect(compared).toBeGreaterThan(0);
			if (entry.shows) expect(labels.some((label) => label.includes(entry.shows!))).toBe(true);
			expect(failures).toEqual([]);
		});
	});
}
