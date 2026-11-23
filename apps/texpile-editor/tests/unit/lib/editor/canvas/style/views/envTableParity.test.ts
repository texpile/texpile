// @vitest-environment jsdom
// the environment head and the table views against S1.0's recordings of the DOM editor, in both schemes
import { readFileSync } from 'node:fs';
import type { Node as PMNode } from 'prosemirror-model';
import { EditorState } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';
import { composeNodeViews, FaceElement } from '$lib/editor/canvas';
import type { ThemeTokenText } from '$lib/editor/canvas';
import { createStyleBase } from '$lib/editor/canvas/style/base/styleBase';
import type { StyleNodeSource } from '$lib/editor/canvas/style/base/baseTypes';
import { CanvasStyleResolver } from '$lib/editor/canvas/style/canvasStyles';
import { tableViews } from '$lib/editor/visual/extensions/table/canvas/tableViews';
import { tableRulesPlugin } from '$lib/editor/visual/extensions/table/rules/tableRules';
import { proofEndMarkPlugin } from '$lib/languages/latex/visual/extensions/environment/canvas/proofEndMark';
import { environmentViews } from '$lib/languages/latex/visual/extensions/environment/canvas/environmentNodeView';
import { environmentHeadsFor } from '$lib/languages/latex/visual/extensions/environment/environmentHeads';
import { latexTableLook } from '$lib/languages/latex/visual/plugins/table/rules/latexTableLook';
import { documentPackages } from '$lib/languages/latex/intellisense/packages/loadedPackages';
import { templateFeaturesStore } from '$lib/stores/editorStore';
import { parseLatexFile } from '$lib/workspace/latexRoundtrip';
import { createTestCanvasView } from '../../testing/testCanvasView';
import { loadRecording, parityDocumentPath, styleDifferences, type RecordedRow } from '../parity/parityRecording';
import { parityTokens } from '../parity/parityTokens';

const EXTRA_TOKENS = {
	light: {
		'--color-surface-300-700': 'oklch(0.7788 0.01 248)',
		'--faint-text': 'color-mix(in oklab, currentColor 40%, transparent)',
		'--color-surface-500': 'oklch(0.6335 0.03 248.24)',
		'--editor-selection': 'color-mix(in srgb, oklch(0.6266 0.19 252.79) 30%, transparent)'
	},
	dark: {
		'--color-surface-300-700': 'oklch(0.5386 0.02 243.22)',
		'--faint-text': 'color-mix(in oklab, currentColor 40%, transparent)',
		'--color-surface-500': 'oklch(0.6335 0.03 248.24)',
		'--editor-selection': 'color-mix(in srgb, oklch(0.6266 0.19 252.79) 35%, transparent)'
	}
} as const;

function tokensOf(scheme: 'light' | 'dark'): ThemeTokenText {
	const base = parityTokens(scheme);
	const extra: Record<string, string> = EXTRA_TOKENS[scheme];
	return (name) => extra[name] ?? base(name);
}

/** only the elements the canvas builds: the DOM editor's own overlay chrome has no counterpart */
const DOM_ONLY = /\b(svg|path|circle|button\.svelte|button\.table-settings-btn|div\.text)\b|svelte-/;
/** what other views write on these elements (the faces' own text, the paragraphs) and the guide under the pointer */
const OTHER = /^paint\.(cursor)$/;

/** the recording of the theorems document reads its plain theorems with the remark look; plain is checked on the tables document */
const THEOREM_STYLE = /^paint\.cursor$|^layout\.font\.(weight|style)$/;

async function opened(folder: string, scheme: 'light' | 'dark', recording: string) {
	const source = readFileSync(parityDocumentPath(folder, 'main.tex')!, 'utf8');
	const parsed = parseLatexFile(source);
	const names = new Set<string>();
	parsed.doc.descendants((node) => void (node.type.name === 'environment' && names.add(String(node.attrs.name))));
	templateFeaturesStore.current = {
		...templateFeaturesStore.current,
		environmentHeads: environmentHeadsFor(parsed.preamble, names, await documentPackages(parsed.preamble))
	};
	const views = composeNodeViews(tableViews('latex'), environmentViews());
	const state = EditorState.create({ doc: parsed.doc, plugins: [tableRulesPlugin(latexTableLook), proofEndMarkPlugin()] });
	const view = createTestCanvasView(state, { width: 800, props: { language: 'latex', nodeViews: views.nodeViews } });
	const doc: PMNode = parsed.doc;
	const sourceOfNodes: StyleNodeSource = {
		nodeOf: (el) => (el.viewDesc ? { node: el.viewDesc.node, getPos: () => el.viewDesc!.pos() } : null),
		doc: () => doc
	};
	const settings = { language: 'latex', pageView: false, readOnly: false, viewportWidth: 1280, editorFont: null } as const;
	const styles = new CanvasStyleResolver({
		base: createStyleBase(sourceOfNodes, () => settings),
		tokens: tokensOf(scheme),
		viewport: () => ({ width: 1280, height: 860 })
	});
	const rows = loadRecording(recording).rows;
	return { view, styles, rows };
}

function elementAt(root: FaceElement, path: string): FaceElement | null {
	let el: FaceElement | null = root;
	for (const step of path ? path.split('>') : []) {
		const [, tag, index] = /^([a-z0-9]+)[^:]*:(\d+)$/.exec(step) ?? [];
		const next: FaceElement | undefined = el?.children[Number(index)];
		el = next && next.tagName.toLowerCase() === tag ? next : null;
		if (!el) return null;
	}
	return el;
}

function compare(
	rows: RecordedRow[],
	types: string[],
	find: (row: RecordedRow) => FaceElement | null,
	styles: CanvasStyleResolver,
	skip?: RegExp
) {
	const failures: string[] = [];
	let compared = 0;
	for (const row of rows) {
		if (!types.includes(row.nodeType) || DOM_ONLY.test(row.path)) continue;
		const el = find(row);
		if (!el) continue;
		const style = styles.styleOf(el, row.pseudo === '' ? undefined : (row.pseudo as 'before' | 'after'));
		if (!style) continue;
		compared++;
		for (const difference of styleDifferences(row, style, undefined, skip ?? OTHER))
			failures.push(`${row.nodeType} ${row.path || '(root)'}${row.pseudo ? '::' + row.pseudo : ''}: ${difference}`);
	}
	return { failures, compared };
}

function distinct(failures: string[]): string[] {
	const counts = new Map<string, number>();
	for (const f of failures) {
		const key = f.replace(/\d{3,}/g, '#');
		counts.set(key, (counts.get(key) ?? 0) + 1);
	}
	return [...counts].map(([key, count]) => `${count}x ${key}`);
}

for (const scheme of ['light', 'dark'] as const) {
	const theorems = parityDocumentPath('parity-tex-theorems', 'main.tex');
	describe.skipIf(!theorems)(`environments against the ${scheme} recording`, async () => {
		if (!theorems) return;
		const { view, styles, rows } = await opened('parity-tex-theorems', scheme, `parity-tex-theorems__main_tex@${scheme}.json`);
		it('styles the head, its name and the body as recorded', () => {
			const found = compare(
				rows,
				['environment'],
				(row) => {
					const root = view.nodeDOM(row.pos);
					return root instanceof FaceElement ? elementAt(root, row.path) : null;
				},
				styles,
				THEOREM_STYLE
			);
			expect(found.compared).toBeGreaterThan(20);
			expect(distinct(found.failures)).toEqual([]);
		});
	});

	describe.skipIf(!theorems)(`the end of proof square against the ${scheme} recording`, async () => {
		if (!theorems) return;
		const { view, styles, rows } = await opened('parity-tex-theorems', scheme, `parity-tex-theorems__main_tex@${scheme}.json`);
		it('floats the square after the last paragraph of a proof as recorded', () => {
			const squares = rows.filter((row) => row.nodeType === 'paragraph' && row.pseudo === 'after' && row.path === '');
			const found = compare(
				squares,
				['paragraph'],
				(row) => {
					const root = view.nodeDOM(row.pos);
					return root instanceof FaceElement ? root : null;
				},
				styles,
				THEOREM_STYLE
			);
			expect(found.compared).toBeGreaterThan(5);
			expect(distinct(found.failures)).toEqual([]);
		});
	});

	const tables = parityDocumentPath('parity-tex-tables', 'main.tex');
	describe.skipIf(!tables)(`tables against the ${scheme} recording`, async () => {
		if (!tables) return;
		const { view, styles, rows } = await opened('parity-tex-tables', scheme, `parity-tex-tables__main_tex@${scheme}.json`);
		it('styles the float, its caption, the grid, rows and cells as recorded', () => {
			const found = compare(
				rows,
				['table_wrapper', 'table_caption', 'table', 'table_row', 'table_cell', 'environment'],
				(row) => {
					const root = view.nodeDOM(row.pos);
					return root instanceof FaceElement ? elementAt(root, row.path) : null;
				},
				styles
			);
			expect(found.compared).toBeGreaterThan(100);
			expect(distinct(found.failures)).toEqual([]);
		});
	});
}
