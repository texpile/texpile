// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import type { Node as PMNode, NodeSpec } from 'prosemirror-model';
import { describe, expect, it } from 'vitest';
import type { MathLayout } from 'mathlive';
import type { ComputedStyle, FaceInputKey } from '$lib/editor/canvas';
import { formulaContent, formulaLaidOut } from '$lib/editor/canvas/math/mathReplaced';
import { FormulaLayoutCache } from '$lib/editor/canvas/math/mathLayoutCache';
import { windowInvalidation } from '$lib/editor/canvas';
import { retypesetStaticMath } from '$lib/editor/visual/extensions/mathlivebridge/mathStatic';
import { CanvasStyleResolver } from '$lib/editor/canvas/style/canvasStyles';
import { createStyleBase } from '$lib/editor/canvas/style/base/styleBase';
import { parseLatexFile } from '$lib/workspace/latexRoundtrip';
import { recordingContext } from '../paint/recordingContext';
import { loadRecording, parityDocumentPath, styleDifferences } from '../style/parity/parityRecording';
import { parityTokens } from '../style/parity/parityTokens';
import { BLACK, formulaIn, measure, NO_STRUT, NUMBER_TEXT, paintedNumbers, schemaFor, style, viewOf } from './mathViewFixture';

describe('the math views', () => {
	it("draws the number the language hands a display after it, and a per-row environment's as a column", () => {
		const schema = schemaFor({});
		const single = viewOf(schema.nodes.block_math.create({ numbered: true, environment: 'equation' }, schema.text('x')), 'latex', {
			numbers: ['(3)']
		});
		expect(single.el.generatedAfter?.textContent).toBe('(3)');
		expect(single.el.generatedAfter?.generated).toBe(true);
		expect(single.el.querySelector('.equation-numbers')).toBeNull();
		const rows = viewOf(
			schema.nodes.block_math.create({ numbered: true, environment: 'align' }, schema.text('\\begin{align}a\\\\b\\end{align}')),
			'latex',
			{
				numbers: ['(4)', '(5)']
			}
		);
		const painted = paintedNumbers(rows.el);
		expect(painted.map((number) => number.text)).toEqual(['(4)', '(5)']);
		expect(painted[1].y, 'each on its own row').toBeGreaterThan(painted[0].y + 8);
		expect(rows.el.generatedAfter).toBeNull();
		const none = viewOf(schema.nodes.block_math.create({ numbered: false }, schema.text('x')), 'latex');
		expect(none.el.generatedAfter).toBeNull();
	});

	it('A12: puts each number on the baseline of its row and none on a \\nonumber row', () => {
		const schema = schemaFor({});
		const rows = viewOf(
			schema.nodes.block_math.create(
				{ numbered: true, environment: 'align' },
				schema.text('\\begin{align}a &= 1 \\nonumber \\\\ b &= 2 \\\\ c &= 3\\end{align}')
			),
			'latex',
			{ numbers: ['(1)', '(2)'] }
		);
		const painted = paintedNumbers(rows.el);
		expect(painted.map((number) => number.text)).toEqual(['(1)', '(2)']);
		const formula = formulaIn(rows.el);
		const laid = formulaLaidOut(formula)!;
		const baselines = laid.layout.rows.map((row) => laid.placing.ascent + row.baseline * laid.placing.size);
		expect(baselines).toHaveLength(3);
		expect(painted[0].y).toBeCloseTo(baselines[1], 1);
		expect(painted[1].y).toBeCloseTo(baselines[2], 1);
	});

	it('draws a tagged row its tag, which steps no count, where the language hands no numbers', () => {
		const schema = schemaFor({});
		const rows = viewOf(
			schema.nodes.block_math.create(
				{ numbered: true, environment: 'gather' },
				schema.text('\\begin{gather}a \\\\ b \\tag{*} \\\\ c \\tag*{T} \\\\ d\\end{gather}')
			),
			'latex',
			{ counted: 2 }
		);
		expect(paintedNumbers(rows.el).map((number) => number.text)).toEqual(['(1)', '(*)', 'T', '(2)']);
	});

	it('draws the number Typst hands a display, which carries no numbered attribute', () => {
		const schema = schemaFor({});
		const typst = viewOf(schema.nodes.block_math.create({}, schema.text('x')), 'typst', { numbers: ['(1)'] });
		expect(typst.el.generatedAfter?.textContent).toBe('(1)');
		expect(typst.el.querySelector('.equation-numbers')).toBeNull();
	});

	it('counts its own numbers where the language hands none, from the numbered rows before it', () => {
		const schema = schemaFor({});
		const rows = viewOf(
			schema.nodes.block_math.create({ numbered: true, environment: 'align' }, schema.text('\\begin{align}a \\\\ b\\end{align}')),
			'latex',
			{
				counted: 6
			}
		);
		expect(paintedNumbers(rows.el).map((number) => number.text)).toEqual(['(5)', '(6)']);
	});

	it('draws an inline formula as a replaced element in its span', () => {
		const schema = schemaFor({});
		const { el, keys } = viewOf(schema.nodes.inline_math.create(null, schema.text('x^2')), 'latex');
		expect(el.outerHTML).toBe('<span class="inline-math"><span class="math-formula"></span></span>');
		expect(el.firstElementChild!.replaced).not.toBeNull();
		expect(keys).toContainEqual({ kind: 'store', name: 'mathMacros' });
	});

	it('frames an empty formula in the error color, over the selected frame, so it can be seen and clicked', () => {
		const schema = schemaFor({});
		const empty = viewOf(schema.nodes.inline_math.create({}, schema.text(' ')), 'latex');
		const filled = viewOf(schema.nodes.inline_math.create({}, schema.text('x')), 'latex');
		expect(formulaIn(empty.el).style.outline).toBe('1px solid var(--color-error-500)');
		expect(formulaIn(filled.el).style.outline).toBe('');
		empty.spec.selectNode!();
		filled.spec.selectNode!();
		expect(formulaIn(empty.el).style.outline).toBe('1px solid var(--color-error-500)');
		expect(formulaIn(filled.el).style.outline).toBe('1px solid var(--mathfield-focus-border)');
		filled.spec.deselectNode!();
		expect(formulaIn(filled.el).style.outline).toBe('');
	});

	it('frames a selected display on its field, and no selected formula in a read-only view', () => {
		const schema = schemaFor({});
		const display = viewOf(schema.nodes.block_math.create(null, schema.text('x')), 'latex');
		display.spec.selectNode!();
		expect(display.el.querySelector('.math-static-placeholder')!.style.outline).toBe('1px solid var(--mathfield-focus-border)');
		expect(formulaIn(display.el).style.outline).toBe('');
		const readOnly = viewOf(schema.nodes.inline_math.create(null, schema.text('x')), 'latex', { editable: false });
		readOnly.spec.selectNode!();
		expect(formulaIn(readOnly.el).style.outline).toBe('');
		expect(readOnly.el.classList.contains('math-selected')).toBe(true);
	});

	it('keeps its elements through an edit and draws the new formula in them', () => {
		const schema = schemaFor({});
		const view = viewOf(schema.nodes.block_math.create({ numbered: true, environment: 'align' }, schema.text('a')), 'latex', {
			counted: 1
		});
		expect(
			view.update(
				schema.nodes.block_math.create({ numbered: true, environment: 'align' }, schema.text('\\begin{align}a \\\\ b\\end{align}'))
			)
		).toBe(true);
		expect(paintedNumbers(view.el)).toHaveLength(2);
		expect(view.update(schema.nodes.inline_math.create(null, schema.text('a')))).toBe(false);
	});

	it('centers a display in its container with the attributes the CSS reads', () => {
		const schema = schemaFor({});
		const node = schema.nodes.block_math.create({ label: 'eq:a', numbered: true, environment: 'align' }, schema.text('a &= b'));
		const { el } = viewOf(node, 'latex');
		expect(el.className).toBe('block-math-container');
		expect(el.style.justifyContent).toBe('safe center');
		expect(el.getAttribute('data-label')).toBe('eq:a');
		expect(el.getAttribute('data-environment')).toBe('align');
		expect(el.getAttribute('data-continues')).toBe('true');
		expect(el.querySelector('.math-static-placeholder > .math-formula')).not.toBeNull();
	});

	it('builds the blocks holding LaTeX formulas again when the paper’s macros change', () => {
		const heard: FaceInputKey[] = [];
		const stop = windowInvalidation(window).listen((key) => heard.push(key));
		retypesetStaticMath();
		stop();
		expect(heard).toContainEqual({ kind: 'store', name: 'mathMacros' });
	});

	it('reads Typst math without the paper’s macros and leaves a Markdown display plain', () => {
		const typst = schemaFor({ mathSyntax: 'typst' } as Partial<NodeSpec>);
		expect(viewOf(typst.nodes.inline_math.create(null, typst.text('x')), 'typst').keys).toEqual([]);
		const markdown = schemaFor({ plainDisplay: true } as Partial<NodeSpec>);
		expect(viewOf(markdown.nodes.block_math.create(null, markdown.text('x')), 'markdown').el.hasAttribute('data-continues')).toBe(false);
	});
});

describe('the replaced formula', () => {
	it('takes its size and baseline from the layout at the element’s font size', () => {
		const layouts = new FormulaLayoutCache(measure);
		const source = { syntax: 'latex' as const, source: '\\frac{a}{b}', display: true };
		const layout = layouts.layout(source, 'serif');
		const size = formulaContent(source, layouts, () => ({ ascent: 0, descent: 0 })).intrinsic(style(20))!;
		expect(size.width).toBeCloseTo(layout.width * 20);
		expect(size.height).toBeCloseTo((layout.ascent + layout.descent) * 20);
		expect(size.baseline).toBeCloseTo(layout.ascent * 20);
	});

	// the static markup is a line-height 1.2 line, so a flat formula is as tall as that line of its font
	it('is at least as tall as a line of the font around it', () => {
		const layouts = new FormulaLayoutCache(measure);
		const source = { syntax: 'latex' as const, source: 'x', display: false };
		const layout = layouts.layout(source, 'serif');
		const size = formulaContent(source, layouts, () => ({ ascent: 30, descent: 10 })).intrinsic(style(20))!;
		expect(size.baseline).toBe(30);
		expect(size.height).toBe(30 + Math.max(10, layout.descent * 20));
	});

	it('stands an empty formula on the line of the text around it, as tall as the frame the DOM editor drew', () => {
		const layouts = new FormulaLayoutCache(measure);
		const strut = (_style: ComputedStyle, lineHeight: number) => ({ ascent: lineHeight * 0.75, descent: lineHeight * 0.25 });
		const around = { layout: { font: { sizePx: 20, families: 'serif' }, lineHeight: 32 }, paint: {} } as unknown as ComputedStyle;
		const empty = formulaContent({ syntax: 'latex', source: ' ', display: false }, layouts, strut).intrinsic(around)!;
		expect(empty.height).toBe(32);
		const flat = formulaContent({ syntax: 'latex', source: '-', display: false }, layouts, strut).intrinsic(around)!;
		expect(flat.height).toBeCloseTo(24);
	});

	it('paints its glyphs on its baseline at the element’s size and color', () => {
		const layouts = new FormulaLayoutCache(measure);
		const source = { syntax: 'latex' as const, source: 'x', display: false };
		const content = formulaContent(source, layouts, () => ({ ascent: 0, descent: 0 }));
		content.intrinsic(style(20));
		const { context, draws } = recordingContext();
		const ascent = layouts.layout(source, 'serif').ascent;
		content.paint(context, { x: 10, y: 100, width: 50, height: 50 }, { color: { r: 255, g: 0, b: 0, a: 1 } } as never, () => BLACK);
		const text = draws.find((draw) => draw.call === 'fillText')!;
		expect(text.args).toEqual(['x', 10, 100 + ascent * 20]);
		expect(text.font).toBe('italic 400 20px KaTeX_Math');
		expect(text.fillStyle).toMatch(/255, 0, 0|#ff0000/i);
	});

	it('paints MathLive’s roles in the theme tokens of the app’s mode, and a closed fence in the formula’s color', () => {
		const glyphs = (text: string, role: 'placeholder' | 'latex' | 'smartFence') =>
			({ kind: 'glyphs', x: 0, y: 0, text, font: '1em serif', color: { role }, opacity: 1 }) as const;
		const layout = {
			width: 1,
			ascent: 1,
			descent: 0,
			items: [glyphs('p', 'placeholder'), glyphs('l', 'latex'), glyphs(')', 'smartFence')],
			atoms: new Map(),
			selection: [],
			macroCalls: []
		} as unknown as MathLayout;
		const content = formulaContent({ syntax: 'latex', source: 'x', display: false }, { layout: () => layout, keyOf: () => '' }, NO_STRUT);
		content.intrinsic(style(20));
		const { context, draws } = recordingContext();
		const tokens: Record<string, { r: number; g: number; b: number; a: number }> = {
			'--math-placeholder': { r: 0.2, g: 0.4, b: 0.6, a: 1 },
			'--math-latex': { r: 0.4, g: 0.6, b: 0.8, a: 1 }
		};
		content.paint(
			context,
			{ x: 0, y: 0, width: 50, height: 50 },
			{ color: { r: 0.6, g: 0.8, b: 1, a: 1 } } as never,
			(name) => tokens[name] ?? BLACK
		);
		const color = (text: string) => draws.find((draw) => draw.call === 'fillText' && draw.args[0] === text)?.fillStyle;
		expect([color('p'), color('l'), color(')')]).toEqual(['rgba(51, 102, 153, 1)', 'rgba(102, 153, 204, 1)', 'rgba(153, 204, 255, 1)']);
	});
});

// the recordings hold no translate on the numbers, which app.css moves up by half their height
const UNRECORDED = /^layout\.transform\b/;

describe('the display view against the recording of parity-tex-body', () => {
	const path = parityDocumentPath('parity-tex-body', 'main.tex');
	it.skipIf(!path)('styles the container, the row numbers and the number after a display as recorded', () => {
		const { doc } = parseLatexFile(readFileSync(path!, 'utf8')) as { doc: PMNode };
		const recording = loadRecording('parity-tex-body__main_tex@light.json');
		const settings = { language: 'latex' as const, pageView: false, readOnly: false, viewportWidth: 1280, editorFont: null };
		const styles = new CanvasStyleResolver({
			base: createStyleBase({ nodeOf: () => null, doc: () => doc }, () => settings),
			tokens: parityTokens('light'),
			viewport: () => ({ width: 1280, height: 860 })
		});
		const rows = recording.rows.filter((row) => row.nodeType === 'block_math');
		const failures: string[] = [];
		const parts = new Set<string>();
		for (const pos of new Set(rows.map((row) => row.pos))) {
			const { el } = viewOf(doc.nodeAt(pos)!, 'latex', { counted: 1 });
			for (const row of rows.filter((r) => r.pos === pos)) {
				const part =
					row.pseudo === 'after'
						? styles.styleOf(el, 'after')
						: row.path === ''
							? styles.styleOf(el)
							: row.path.endsWith('span.equation-number-line:0')
								? styles.styleOf(el.querySelector('.equation-numbers')!)
								: undefined;
				if (part === undefined) continue;
				parts.add(row.pseudo || row.path || 'container');
				if (!part) failures.push(`${pos} ${row.pseudo || row.path}: not drawn`);
				else
					failures.push(
						// the numbers are one element now, each painted on its row: what the DOM's lines wore is its color and font
						...styleDifferences(row, part, row.path ? NUMBER_TEXT : undefined, UNRECORDED).map(
							(difference) => `${pos} ${row.pseudo || row.path || 'container'} ${difference}`
						)
					);
			}
		}
		expect([...parts].sort()).toEqual(['after', 'container', 'div.equation-numbers:0>span.equation-number-line:0']);
		expect(failures).toEqual([]);
	});
});
