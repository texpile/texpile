import type { FigurePicture, FigureStatement, NewShape } from '$lib/draw/editor/figure/figureLanguage';
import { tikzLanguage as lang } from '$lib/draw/tikz/tikzLanguage';
import { TYPED_TEXTS } from './validityFixtures';

export type TriedEdit = { what: string; next: string | null | undefined };

const SIDES = ['north', 'east', 'south', 'west'] as const;
const SHAPES = ['rectangle', 'rounded', 'terminal', 'circle', 'ellipse', 'diamond', 'slant', 'cylinder'] as const;
const ROUTES = ['straight', 'hv', 'vh', 'bend left', 'curve', 'loop above'] as const;

/** texts the editor lets through, as it checks them before writing */
const writable = TYPED_TEXTS.filter((t) => !lang.textProblem(t));

function styleEdits(source: string, st: FigureStatement): TriedEdit[] {
	const { styleChoices: c } = lang;
	const changes = [
		{ stroke: 'red' },
		{ fill: 'blue!20' },
		...c.widths.map((width) => ({ width })),
		...c.dashes.map((dash) => ({ dash })),
		...c.arrows.map((a) => ({ arrows: a.value })),
		...c.opacities.map((opacity) => ({ opacity })),
		{ corners: 'rounded' as const },
		{ textColor: 'red' },
		...c.textSizes.map((t) => ({ textSize: t.value }))
	];
	return changes.map((change) => ({ what: `style ${JSON.stringify(change)}`, next: lang.writeStyle(source, st, change) }));
}

function textEdits(source: string, st: FigureStatement): TriedEdit[] {
	const edits: TriedEdit[] = [];
	if (lang.readNodeLines(source, st))
		for (const t of writable) {
			edits.push({ what: `text ${t}`, next: lang.writeNodeLines(source, st, [t]) });
			edits.push({ what: `lines ${t}`, next: lang.writeNodeLines(source, st, [t, 'more']) });
		}
	if (st.kind === 'cell' || st.kind === 'branch')
		for (const t of writable) edits.push({ what: `text ${t}`, next: lang.writeText(source, st, t) });
	return edits;
}

function connectorEdits(source: string, st: FigureStatement): TriedEdit[] {
	const c = lang.readConnector(source, st);
	if (!c) return [];
	return [
		...ROUTES.map((route) => ({ what: `route ${route}`, next: lang.writeConnector(source, st, { route }) })),
		{ what: 'bend', next: lang.writeConnector(source, st, { route: 'bend left', bend: 45 }) },
		{ what: 'no label', next: lang.writeConnector(source, st, { label: null }) },
		...writable.map((text) => ({
			what: `label ${text}`,
			next: lang.writeConnector(source, st, { label: { pos: 'midway', side: 'above', ...c.label, text } })
		}))
	];
}

function nodeEdits(source: string, picture: FigurePicture, st: FigureStatement): TriedEdit[] {
	const edits: TriedEdit[] = [];
	if (lang.readNodeBox(source, st)) {
		for (const shape of SHAPES) edits.push({ what: `shape ${shape}`, next: lang.writeNodeBox(source, st, { shape }) });
		edits.push({ what: 'size', next: lang.writeNodeBox(source, st, { w: 2, h: 1 }) });
		if (lang.readNodeBox(source, st)?.state)
			edits.push({ what: 'initial', next: lang.writeNodeBox(source, st, { initial: true, accepting: true }) });
	}
	if (st.kind === 'node' && !picture.layout)
		for (const side of SIDES) edits.push({ what: `step ${side}`, next: lang.addStep(source, 0, st.i, side, 'Step')?.source });
	if (lang.readPlacement(source, st)) edits.push({ what: 'free', next: lang.writePlacement(source, st, { at: [1, 1] }) });
	return edits;
}

function plotEdits(source: string, st: FigureStatement): TriedEdit[] {
	if (st.kind === 'axis')
		return [
			{
				what: 'axis fields',
				next: lang.writeAxis(source, st, { title: 'T', xlabel: '$x$', width: 5, x: [0, 3], grid: 'major', lines: 'box' })
			},
			...writable.map((title) => ({ what: `axis title ${title}`, next: lang.writeAxis(source, st, { title }) })),
			{ what: 'add function', next: lang.addPlot(source, st, 'function') },
			{ what: 'add points', next: lang.addPlot(source, st, 'points') }
		];
	if (st.kind === 'plot')
		return [
			{
				what: 'plot fields',
				next: lang.writePlot(source, st, { expression: 'x^2', domain: [0, 2], color: 'red', mark: '*', line: 'dashed' })
			}
		];
	return [];
}

function diagramEdits(source: string, picture: FigurePicture, st: FigureStatement): TriedEdit[] {
	const edits: TriedEdit[] = [];
	if (st.kind === 'arrow') {
		for (const label of writable) edits.push({ what: `arrow label ${label}`, next: lang.writeArrow(source, st, { label }) });
		edits.push({ what: 'arrow kind', next: lang.writeArrow(source, st, { head: 'hook', line: 'dashed', bend: 'left', side: 'right' }) });
		const cells = picture.statements.filter((s) => s.kind === 'cell');
		for (const cell of cells) edits.push({ what: `arrow end to ${cell.i}`, next: lang.pointArrow(source, 0, st.i, 1, cell.i)?.source });
	}
	if (st.kind === 'branch') {
		for (const t of writable) edits.push({ what: `child ${t}`, next: lang.addBranch(source, st, 'child', t)?.source });
		edits.push({ what: 'sibling', next: lang.addBranch(source, st, 'sibling', 'S')?.source });
		edits.push({ what: 'swap', next: lang.shiftBranch(source, st, 1)?.source });
		for (const onto of picture.statements.filter((s) => s.kind === 'branch' && s.i !== st.i))
			edits.push({ what: `onto ${onto.i}`, next: lang.moveBranch(source, st, onto)?.source });
	}
	for (const [k, part] of lang.readCircuit(source, st).entries())
		edits.push({ what: `part ${k} label`, next: lang.writeCircuit(source, st, k, { label: '$R_2$', type: part.type }) });
	return edits;
}

function arrangeEdits(source: string, picture: FigurePicture, st: FigureStatement): TriedEdit[] {
	const tops = picture.statements.filter((s) => !picture.statements.some((p) => p.kind === 'scope' && p.from < s.from && s.to <= p.to));
	const scopes = picture.statements.filter((s) => s.kind === 'scope' && s.i !== st.i);
	const to = [{ before: tops[0].i }, { after: tops.at(-1)!.i }, ...scopes.map((s) => ({ into: s.i }))];
	return [
		...to.map((t) => ({ what: `order ${JSON.stringify(t)}`, next: lang.moveStatements(source, picture, [st.i], t)?.source })),
		{ what: 'group', next: lang.groupStatements(source, picture, [st.i])?.source },
		{ what: 'ungroup', next: st.kind === 'scope' ? lang.ungroupStatement(source, picture, st.i)?.source : null },
		{ what: 'rename', next: lang.writeLabel(source, st, 'Part') },
		{ what: 'paste', next: lang.appendStatements(source, 0, source.slice(st.from, st.to)) }
	];
}

function dimensionEdits(source: string, st: FigureStatement): TriedEdit[] {
	const points = lang.pathPoints(source, st);
	const edits: TriedEdit[] = [];
	if (points.length >= 2) {
		const [from, to] = [
			{ stmt: st.i, k: 0 },
			{ stmt: st.i, k: 1 }
		];
		for (const kind of ['aligned', 'x', 'y'] as const)
			edits.push({ what: `dimension ${kind}`, next: lang.addDimension(source, 0, { kind, from, to, offset: 0.5 }) });
	}
	if (lang.readNodeBox(source, st))
		edits.push({
			what: 'dimension node',
			next: lang.addDimension(source, 0, { kind: 'node', stmt: st.i, axis: 'x', side: 1, offset: 0.5 })
		});
	if (lang.radii(source, st).length && points.length)
		edits.push({
			what: 'dimension radius',
			next: lang.addDimension(source, 0, { kind: 'radius', center: { stmt: st.i, k: 0 }, length: 0.5, value: 0.5, angle: 45 })
		});
	return edits;
}

/** a delete as the editor makes it: what takes a point from what goes, or stands beside it, lets go of it first */
function deleted(source: string, picture: FigurePicture, st: FigureStatement) {
	const gone = picture.statements.filter((s) => st.from <= s.from && s.to <= st.to).map((s) => s.i);
	const text = lang.letGoOf(
		source,
		0,
		gone,
		() => [1, 1],
		() => [1, 1]
	);
	const again = lang.readPicture(text, 0)?.statements.find((s) => s.i === st.i);
	return again ? lang.removeStatement(text, again) : null;
}

/** what the editor can do to one statement, each tried on the source as it is */
export function statementEdits(source: string, picture: FigurePicture, st: FigureStatement): TriedEdit[] {
	const info = lang.describe(source, st);
	const moving: TriedEdit[] = info.movable
		? [
				{ what: 'move', next: lang.shiftStatement(source, st, 0.5, 0.25) },
				{ what: 'duplicate', next: lang.duplicateStatement(source, st, 0.5, 0.25) },
				{ what: 'stretch', next: lang.stretchStatement(source, st, [0, 0], 1.5, 0.75) },
				{ what: 'flip', next: lang.stretchStatement(source, st, [0, 0], -1, 1) },
				{ what: 'rotate', next: lang.rotateStatement(source, st, [0, 0], 30) }
			]
		: [];
	return [
		...moving,
		{ what: 'delete', next: deleted(source, picture, st) },
		...(info.target ? styleEdits(source, st) : []),
		...textEdits(source, st),
		...connectorEdits(source, st),
		...nodeEdits(source, picture, st),
		...plotEdits(source, st),
		...diagramEdits(source, picture, st),
		...(picture.layout ? [] : arrangeEdits(source, picture, st)),
		...dimensionEdits(source, st)
	];
}

/** what the editor can add to a picture */
export function pictureEdits(source: string, picture: FigurePicture): TriedEdit[] {
	const node = picture.statements.find((s) => s.kind === 'node');
	const cells = picture.statements.filter((s) => s.kind === 'cell');
	const shapes: [string, NewShape][] = [
		['line', { tool: 'line', from: [0, 0], to: [1, 1], via: [[0.5, 0]] }],
		['arrow', { tool: 'arrow', from: [0, 0], to: [1, 1] }],
		['curve', { tool: 'curve', from: [0, 0], to: [1, 1] }],
		['rect', { tool: 'rect', from: [0, 0], to: [1, 1] }],
		...SHAPES.map((shape): [string, NewShape] => [`box ${shape}`, { tool: 'box', from: [0, 0], to: [1, 1], shape }]),
		['plot', { tool: 'plot', at: [0, 0] }],
		['state', { tool: 'state', at: [0, 0] }],
		['circle', { tool: 'ellipse', from: [0, 0], to: [1, 1], circle: true }],
		['ellipse', { tool: 'ellipse', from: [0, 0], to: [2, 1], circle: false }],
		[
			'pen',
			{
				tool: 'pen',
				points: [
					[0, 0],
					[1, 1],
					[2, 0]
				]
			}
		],
		[
			'polygon',
			{
				tool: 'polygon',
				points: [
					[0, 0],
					[1, 1],
					[2, 0]
				]
			}
		],
		['axes', { tool: 'axes', from: [0, 0], to: [2, 2] }],
		// typed text is written by the text edits, into what this adds
		['text', { tool: 'text', at: [0, 0], text: 'Text' }],
		...lang.circuitParts.map((p): [string, NewShape] => [
			`part ${p.id}`,
			p.placed === 'path' ? { tool: 'component', part: p.id, from: [0, 0], to: [2, 0] } : { tool: 'component', part: p.id, at: [0, 0] }
		])
	];
	if (node) shapes.push(['arrow to a node', { tool: 'arrow', from: [0, 0], to: { ref: node.i, at: [0, 0] } }]);
	if (cells.length > 1)
		shapes.push(['cell arrow', { tool: 'arrow', from: { ref: cells[0].i, at: [0, 0] }, to: { ref: cells[1].i, at: [0, 0] } }]);
	const grid = lang.readGrid(source, picture);
	return [
		...shapes.map(([what, shape]) => ({ what: `add ${what}`, next: lang.addShape(source, 0, shape) })),
		...lang.libraryElements.map((e) => ({ what: `library ${e.id}`, next: lang.addElement(source, 0, e) })),
		{ what: 'canvas size', next: picture.layout ? null : lang.writeFrame(source, picture, { x1: -1, y1: -1, x2: 10, y2: 8 }) },
		...(grid
			? [
					{ what: 'cell in a new row', next: lang.addCell(source, 0, grid.rows + 1, 1, 'X')?.source },
					{ what: 'cell in a new column', next: lang.addCell(source, 0, 1, grid.cols + 1, 'X')?.source },
					...cells.map((c) => ({ what: `move cell ${c.i}`, next: lang.moveCell(source, 0, c.i, grid.rows + 1, grid.cols + 1)?.source }))
				]
			: [])
	];
}
