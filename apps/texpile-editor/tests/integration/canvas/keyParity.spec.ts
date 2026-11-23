// W1's parity spec: every kept row of P0's Linux key files (the DOM editor's outcomes, tests/fixtures/parity/keys) and the live
// rows beside drawn chips run on the canvas, in LaTeX, Typst and Markdown. A row is exact (the same selection and document change),
// excused with a named reason and package (EXCUSES, capped per document by keyParityBudget.json) or listed in KNOWN_GAPS.
// The annotations of each document count all of them. The unstable key groups follow the rules of decisions/.../canvas/README.md
// and have their own tests in keyRules.spec
import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { useTexpile } from '../driver/useTexpile';
import { VisualEditor } from '../driver/visualEditor';
import { probeErrors, settled } from './canvasPage';
import {
	ACCIDENTS,
	CHIP_RULE,
	EXCUSES,
	KNOWN_GAPS,
	LEFT_OUT,
	LIVE_DOM,
	SKIPPED_STARTS,
	decisionWant,
	type ExcuseId,
	type SkippedStart
} from './keyParityRules';

const KEYS = path.resolve(import.meta.dirname, '../../fixtures/parity/keys');
const DOCS = process.env.TEXPILE_PARITY_DOCS ?? '/home/user/texpile-tools/perf-drive/work/docs';
const MISSING_FIGURE = /Failed to load resource: the server responded with a status of 40[34]/;
const DRAWN_CHIP = new Set(['atom', 'character', 'ownLine']);
// P0's caret x and ours at the start of an Up or Down: within 1 px is the same line, the bound of the caret oracles; further apart a face is laid out unlike P0
const SAME_LINE_X = 1;
// a line move lands at the nearest boundary to the x: widths that round differently put it a few characters from P0's
const LINE_ROUNDING = 3;
/** an empty paragraph's node size: P0 recorded a prepared start's document change against the document with it */
const EMPTY_PARAGRAPH = 2;

type KeyRow = [key: number, type: string, anchor: number, head: number, extra?: { unstable?: boolean; caret?: number[][]; ds?: number }];
type KeyStart = {
	cat: string;
	sel: [string, number, number];
	rows: KeyRow[];
	unstable?: boolean;
	prep?: { kind: 'emptyParagraph'; at: number } | { kind: 'clearText'; from: number; to: number };
};
type KeyFixture = {
	environment: {
		folder: string;
		file: string;
		window: [number, number];
		docSize: number;
		profile: string;
		scroller?: { client: [number, number]; box: number[] };
	};
	keys: { id: string; key: string; kind: string }[];
	starts: KeyStart[];
};
type LiveChipRow = { cat: 'chip-before' | 'chip-after'; from: number; key: string; want: string };
type StartFacts = {
	/** P0's caret x at the start, from its Up and Down rows, relative to the scroller; null when it recorded none */
	caretX: number | null;
	/** P0's Home and End heads at the start, which say where its lines broke */
	lineEnds: [number, number] | null;
};
type PlannedRow = {
	label: string;
	cat: string;
	keyId: string;
	chord: string;
	kind: string;
	start: KeyStart;
	want: string;
	ds: number | null;
	facts: StartFacts;
	chipSide: -1 | 1 | null;
};

const fixtureFiles = fs
	.readdirSync(KEYS)
	.filter((name) => name.endsWith('.json') && !/^(caretwalk|platforms|keys-chips\.live)/.test(name))
	.sort();
const fixtures = fixtureFiles.map((name) => ({ name, data: JSON.parse(fs.readFileSync(path.join(KEYS, name), 'utf8')) as KeyFixture }));

function sourceOf(fixture: KeyFixture): { rel: string; text: string } | null {
	const rel = `${fixture.environment.folder}/${fixture.environment.file}`;
	const own = path.join(KEYS, rel);
	const found = fs.existsSync(own) ? own : path.join(DOCS, rel);
	return fs.existsSync(found) ? { rel, text: fs.readFileSync(found, 'utf8') } : null;
}

const chipFixture = JSON.parse(fs.readFileSync(path.join(KEYS, 'keys-chips.live.json'), 'utf8')) as {
	documents: Record<string, LiveChipRow[]>;
};
const chipSources = Object.fromEntries(
	Object.keys(chipFixture.documents).map((rel) => [rel, fs.readFileSync(path.join(KEYS, rel), 'utf8')])
);
const parityDocs: Record<string, string> = {};
for (const { data } of fixtures) {
	const source = sourceOf(data);
	if (source) parityDocs[source.rel] = source.text;
}
/** the most rows of each excuse a document may have; a count that grows fails, one that shrinks is lowered here */
const EXCUSE_BUDGET = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'keyParityBudget.json'), 'utf8')) as Record<
	string,
	Partial<Record<ExcuseId, number>>
>;
// the parity papers' figures point outside the folder the window has a copy of, and load as the rows scroll to them
const texpile = useTexpile({ files: { ...parityDocs, ...chipSources }, expectedErrors: MISSING_FIGURE });
test.describe.configure({ mode: 'parallel', retries: 1 });

function skipReason(cat: string, rel: string): SkippedStart | undefined {
	return SKIPPED_STARTS.find((skip) => skip.cat.test(cat) && (!skip.docs || skip.docs.test(rel)));
}

const SAME_LINE_KEYS = /^(line|paragraph)-/;
// Home and End depend on where the line breaks only; the vertical moves also on the caret x
const LINE_ENDS_KEYS = /^line-(start|end)/;
const VERTICAL_KEYS = /^(line-(up|down)|paragraph-)/;
// the page keys follow the rule recorded in pointer/ (pageKeys.spec), not these rows
const PAGE_KEYS = /^page-/;

/** a text start whose Shift character rows move the anchor was set inside a cluster, where the DOM editor moved the caret */
function movedByDom(start: KeyStart, keys: KeyFixture['keys']): boolean {
	const [type, anchor, head] = start.sel;
	if (type !== 'text' || anchor !== head) return false;
	return start.rows.some(([index, kind, from]) => /^char-(left|right)\+shift$/.test(keys[index].id) && kind === 'text' && from !== head);
}

function factsOf(start: KeyStart, keys: KeyFixture['keys'], scrollerLeft: number | null): StartFacts {
	const row = (id: string) => start.rows.find(([index, , , , extra]) => keys[index].id === id && !extra?.unstable);
	const caret = (id: string) => row(id)?.[4]?.caret?.[0][0];
	const x = caret('line-down') ?? caret('line-up');
	const [home, end] = [row('line-start'), row('line-end')];
	return {
		caretX: x === undefined || scrollerLeft === null ? null : x - scrollerLeft,
		lineEnds: home && end && home[1] === 'text' && end[1] === 'text' ? [home[3], end[3]] : null
	};
}

type LeftOutId = keyof typeof LEFT_OUT;
type LeftOut = Record<LeftOutId, number> & { fixtureRows: number };
const emptyLeftOut = (): LeftOut => ({
	unstableStart: 0,
	unstableRow: 0,
	pageKeys: 0,
	accident: 0,
	movedByDom: 0,
	selectedFormula: 0,
	authorBlock: 0,
	fixtureRows: 0
});

function planFixture(rel: string, data: KeyFixture, left: LeftOut): PlannedRow[] {
	const rows: PlannedRow[] = [];
	const scrollerLeft = data.environment.scroller?.box[0] ?? null;
	for (const start of data.starts) {
		left.fixtureRows += start.rows.length;
		const kind = start.unstable
			? 'unstableStart'
			: (skipReason(start.cat, rel)?.leftOut ?? (movedByDom(start, data.keys) ? 'movedByDom' : null));
		if (kind) {
			left[kind] += start.rows.length;
			continue;
		}
		if (process.env.KEY_PARITY_CATS && !new RegExp(process.env.KEY_PARITY_CATS).test(start.cat)) continue;
		const facts = factsOf(start, data.keys, scrollerLeft);
		for (const [index, type, anchor, head, extra] of start.rows) {
			const key = data.keys[index];
			const label = `${start.cat} ${start.sel.join(' ')} ${key.id}`;
			const skipped = extra?.unstable
				? 'unstableRow'
				: PAGE_KEYS.test(key.id)
					? 'pageKeys'
					: ACCIDENTS.some((a) => a.cat.test(start.cat) && a.key.test(key.id) && (!a.docs || a.docs.test(rel)))
						? 'accident'
						: null;
			if (skipped) {
				left[skipped]++;
				continue;
			}
			const recorded = `${type} ${anchor} ${head}`;
			const want = LIVE_DOM[rel]?.[label] ?? decisionWant(key.id, start, data.keys, recorded) ?? recorded;
			rows.push({
				label,
				cat: start.cat,
				keyId: key.id,
				chord: key.key,
				kind: key.kind,
				start,
				want,
				ds: key.kind === 'move' ? null : (extra?.ds ?? 0),
				facts,
				chipSide: null
			});
		}
	}
	return rows;
}

function planChipRows(rel: string): PlannedRow[] {
	return chipFixture.documents[rel].map((row) => {
		const label = `${row.cat} ${row.from} ${row.key}`;
		return {
			label,
			cat: row.cat,
			keyId: row.key,
			chord: row.key,
			kind: 'move',
			start: { cat: row.cat, sel: ['text', row.from, row.from], rows: [] },
			want: CHIP_RULE[rel]?.[label] ?? row.want,
			ds: null,
			facts: { caretX: null, lineEnds: null },
			chipSide: row.cat === 'chip-before' ? 1 : -1
		};
	});
}

type Placed = { startX: number; chipPolicy: string | null; lineEnds: [number, number] | null };
type Read = { got: string; ds: number; ctx?: string };

const selectionType = `({ text: 'text', node: 'node', gapcursor: 'gap', cell: 'cell', all: 'all' })[s.toJSON().type]`;

/** reads the selection and the document size change the last key left, puts the document back, and sets the next row's start as P0 did */
function advance(
	page: VisualEditor['page'],
	next: PlannedRow | null,
	read: boolean
): Promise<{ read: Read | null; placed: Placed | null }> {
	return page.evaluate(
		async ({ next, read, typeOf }) => {
			const store = await import(/* @vite-ignore */ '/src/lib/stores/editorStore.ts' as string);
			const view = store.editorViewStore.current;
			const originalDoc = (window as unknown as { __keyParityOriginal: typeof view.state.doc }).__keyParityOriginal;
			const out: { read: Read | null; placed: Placed | null } = { read: null, placed: null };
			if (read) {
				const s = view.state.selection;
				const type = new Function('s', `return ${typeOf}`)(s);
				out.read = {
					got: `${type} ${s.anchor} ${s.head}`,
					ds: view.state.doc.content.size - originalDoc.content.size,
					ctx: view.state.doc.textBetween(Math.max(0, s.head - 10), Math.min(view.state.doc.content.size, s.head + 10), '|', '#')
				};
			}
			if (!view.state.doc.eq(originalDoc))
				view.dispatch(view.state.tr.replaceWith(0, view.state.doc.content.size, originalDoc.content).setMeta('addToHistory', false));
			if (!next) return out;
			const prep = next.start.prep;
			if (prep?.kind === 'emptyParagraph')
				view.dispatch(view.state.tr.insert(prep.at, view.state.schema.nodes.paragraph.createAndFill()).setMeta('addToHistory', false));
			else if (prep?.kind === 'clearText') view.dispatch(view.state.tr.delete(prep.from, prep.to).setMeta('addToHistory', false));
			const [kind, anchor, head] = next.start.sel;
			const json =
				kind === 'gap' ? { type: 'gapcursor', pos: head } : kind === 'node' ? { type: 'node', anchor } : { type: kind, anchor, head };
			let base = view.state.selection.constructor;
			while (Object.getPrototypeOf(base).fromJSON) base = Object.getPrototypeOf(base);
			view.focus();
			view.dispatch(view.state.tr.setSelection(base.atStart(view.state.doc)));
			view.dispatch(view.state.tr.setSelection(base.fromJSON(view.state.doc, json)).scrollIntoView());
			// the start's lines are laid out, not estimated, before they are read; two frames let the input surface follow the selection, as P0's capture waited before each press
			await (window as unknown as { __canvasProbe: { active(): { settle(): Promise<void> } } }).__canvasProbe.active().settle();
			await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
			const scrollerLeft = (view.canvas.scroller as HTMLElement).getBoundingClientRect().left;
			out.placed = { startX: view.coordsAtPos(view.state.selection.head).left - scrollerLeft, chipPolicy: null, lineEnds: null };
			if (view.state.selection.$head.parent.inlineContent) {
				const line = view.canvas.geometry.lineOf(view.canvas.head());
				if (line) out.placed.lineEnds = [line.from, line.to];
			}
			if (next.chipSide) {
				const { caretPolicyAt } = await import(/* @vite-ignore */ '/src/lib/editor/canvas/index.ts' as string);
				const $head = view.state.selection.$head;
				const chip = next.chipSide > 0 ? $head.pos : $head.pos - ($head.nodeBefore?.nodeSize ?? 0);
				out.placed.chipPolicy = caretPolicyAt(view, chip);
			}
			return out;
		},
		{ next, read, typeOf: selectionType }
	);
}

/** the viewport that gives the canvas the scroller P0 had, so the lines break where P0's did */
async function fitScroller(page: VisualEditor['page'], client: [number, number]): Promise<void> {
	await page.setViewportSize({ width: client[0], height: client[1] });
	for (let attempt = 0; attempt < 3; attempt++) {
		const size = await page.evaluate(async () => {
			const store = await import(/* @vite-ignore */ '/src/lib/stores/editorStore.ts' as string);
			const scroller = store.editorViewStore.current.canvas.scroller as HTMLElement;
			return { w: scroller.clientWidth, h: scroller.clientHeight };
		});
		if (size.w === client[0] && size.h === client[1]) return;
		const view = page.viewportSize()!;
		await page.setViewportSize({ width: view.width + client[0] - size.w, height: view.height + client[1] - size.h });
	}
}

/** where the canvas breaks the start's line or places its caret differently from P0, a line move there is not comparable */
function sameLineDiffers(keyId: string, facts: StartFacts, placed: Placed): boolean {
	if (!LINE_ENDS_KEYS.test(keyId) && facts.caretX !== null && Math.abs(placed.startX - facts.caretX) > SAME_LINE_X) return true;
	const { lineEnds } = facts;
	return lineEnds !== null && placed.lineEnds !== null && (lineEnds[0] !== placed.lineEnds[0] || lineEnds[1] !== placed.lineEnds[1]);
}

type Span = [from: number, to: number];

/** the positions a row's selection stands at, from `type anchor head` */
function positionsOf(outcome: string): number[] {
	return outcome.split(' ').slice(1).map(Number);
}

/** where a start's preparation moved the positions after it, and by how much */
function prepShift(prep: KeyStart['prep']): [at: number, size: number] | null {
	if (!prep) return null;
	return prep.kind === 'emptyParagraph' ? [prep.at, EMPTY_PARAGRAPH] : [prep.to, prep.from - prep.to];
}

/** `shift`: what a start's preparation moved the spans after it by */
function inSpan(spans: Span[], outcome: string, shift: [at: number, size: number] | null): boolean {
	return positionsOf(outcome).some((pos) =>
		spans.some(([from, to]) => {
			const moved = shift && from >= shift[0] ? shift[1] : 0;
			return pos >= from + moved && pos <= to + moved;
		})
	);
}

/** a line move that lands a few characters from P0's, where the measured widths put a boundary on the other side of the x */
function withinOneStop(want: string, got: string): boolean {
	const [wantType, ...wantAt] = want.split(' ').map((part, index) => (index ? Number(part) : part));
	const [gotType, ...gotAt] = got.split(' ').map((part, index) => (index ? Number(part) : part));
	return (
		wantType === 'text' &&
		gotType === 'text' &&
		wantAt.every((at, index) => Math.abs((at as number) - (gotAt[index] as number)) <= LINE_ROUNDING) &&
		want !== got
	);
}

/** where P0's selection stayed put, or ended on a gap or a node, and the canvas ends in text or on a node */
function steppedOnByCanvas(row: PlannedRow, got: string): 'stayed' | 'gapOrNode' | null {
	const [wantType] = row.want.split(' ');
	if (row.want === row.start.sel.join(' ')) return got.startsWith('text ') || got.startsWith('node ') ? 'stayed' : null;
	return got.startsWith('text ') && (wantType === 'gap' || wantType === 'node') ? 'gapOrNode' : null;
}

type Blocks = { faceless: Span[]; island: Span[]; textblocks: Span[] };
type ExcusedRow = { label: string; why: string; want: string; got: string; ds: number; wantDs: number | null };

type ReplayDocument = {
	rel: string;
	rows: PlannedRow[];
	left: LeftOut;
	docSize: number | null;
	scroller: { client: [number, number]; left: number } | null;
};

// a Typst table's measured widths follow the pane fitScroller resized, and are written on the first edit after it
const DOC_JSON = `return JSON.stringify(view.state.doc.toJSON(), (key, value) => (key === 'colwidth' ? undefined : value));`;

async function replay({ rel, rows, left, docSize, scroller }: ReplayDocument): Promise<void> {
	const { page, root } = texpile();
	const visual = new VisualEditor(page, root);
	await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
	await visual.open(rel);
	await settled(page);
	if (scroller) await fitScroller(page, scroller.client);
	await settled(page);
	const size = await visual.evalView<number>('return view.state.doc.content.size;');
	test.skip(docSize !== null && size !== docSize, `${rel} parses to ${size}, P0's document to ${docSize}`);
	const original = await visual.evalView<string>(DOC_JSON);
	// every row puts this same document back: one built from JSON per row left gigabytes for the collector in Electron
	await visual.evalView('window.__keyParityOriginal = view.state.doc; return true;');
	const blocks = await visual.evalView<Blocks>(
		`return import('/src/lib/editor/canvas/index.ts').then(async ({ caretPolicyAt }) => {
			const { chipShows } = await import('/src/lib/editor/visual/extensions/drawnChips/chipShows.ts');
			const out = { faceless: [], island: [], textblocks: [] };
			view.state.doc.descendants((node, pos) => {
				const span = [pos, pos + node.nodeSize];
				if (node.type.spec.tableRole === 'table' || node.type.name === 'table_wrapper') out.textblocks.push(span);
				if (node.type.name === 'code_block') out.island.push(span);
				else if (node.type.name === 'raw_latex' || node.type.name === 'inline_latex') {
					if (chipShows(node) === 'island') out.island.push(span);
					else if (caretPolicyAt(view, pos) === 'island') out.faceless.push(span);
				}
				if (node.isTextblock) {
					let atoms = false;
					node.forEach((child) => { if (!child.isText) atoms = true; });
					if (atoms) out.textblocks.push(span);
				}
			});
			return out;
		});`
	);

	const differ: string[] = [];
	const excused: ExcusedRow[] = [];
	const usedGaps = new Set<(typeof KNOWN_GAPS)[number]>();
	const counts = { exact: 0, known: 0, ...Object.fromEntries(Object.keys(EXCUSES).map((id) => [id, 0])) } as Record<
		ExcuseId | 'exact' | 'known',
		number
	>;
	let awaiting: PlannedRow | null = null;
	const excuseOf = (row: PlannedRow, got: string, ds: number, prep: ReturnType<typeof prepShift>): ExcuseId | null => {
		const touches = (spans: Span[]) =>
			inSpan(spans, row.want, prep) || inSpan(spans, got, prep) || inSpan(spans, row.start.sel.join(' '), prep);
		if (touches(blocks.faceless)) return 'rawFace';
		if (touches(blocks.island)) return 'islandCaret';
		if (VERTICAL_KEYS.test(row.keyId) && (inSpan(blocks.textblocks, row.want, prep) || inSpan(blocks.textblocks, got, prep)))
			return 'destination';
		if (VERTICAL_KEYS.test(row.keyId) && withinOneStop(row.want, got)) return 'rounding';
		const stepped = steppedOnByCanvas(row, got);
		if (stepped && (row.kind === 'move' || ds === (row.ds ?? 0))) return stepped;
		return null;
	};
	const judge = async (row: PlannedRow, got: Read) => {
		const prep = prepShift(row.start.prep);
		const ds = got.ds - (prep ? prep[1] : 0);
		if (got.got === row.want && (row.ds === null || ds === row.ds)) {
			counts.exact++;
			return;
		}
		const excuse = excuseOf(row, got.got, ds, prep);
		const gap = excuse ? undefined : KNOWN_GAPS.find((known) => known.docs.test(rel) && known.row.test(`${row.label} [${row.chord}]`));
		if (gap) usedGaps.add(gap);
		if (excuse || gap) {
			counts[excuse ?? 'known']++;
			if (process.env.KEY_PARITY_OUT)
				excused.push({ label: `${row.label} [${row.chord}]`, why: excuse ?? 'known', want: row.want, got: got.got, ds, wantDs: row.ds });
			return;
		}
		if (got.got !== row.want) differ.push(`${row.label} [${row.chord}]: want ${row.want}, got ${got.got} (${got.ctx})`);
		else differ.push(`${row.label}: the document grows by ${ds}, P0's by ${row.ds}`);
	};
	for (const row of [...rows, null]) {
		const { read, placed } = await advance(page, row, awaiting !== null);
		if (awaiting && read) await judge(awaiting, read);
		awaiting = null;
		if (!row || !placed) continue;
		if (SAME_LINE_KEYS.test(row.keyId) && sameLineDiffers(row.keyId, row.facts, placed)) {
			counts.layout++;
			if (process.env.KEY_PARITY_OUT)
				excused.push({
					label: `${row.label} [${row.chord}]`,
					why: 'layout',
					want: `x ${row.facts.caretX} ends ${row.facts.lineEnds}`,
					got: `x ${placed.startX} ends ${placed.lineEnds}`,
					ds: 0,
					wantDs: row.ds
				});
			continue;
		}
		if (row.chipSide && !DRAWN_CHIP.has(placed.chipPolicy ?? '')) {
			counts.chipFace++;
			continue;
		}
		if (row.keyId.startsWith('paste')) await page.evaluate(() => navigator.clipboard.writeText('PASTE-PROBE'));
		await page.keyboard.press(row.chord);
		awaiting = row;
	}
	const share = (id: ExcuseId) => ({ type: `${id}: ${EXCUSES[id].owner}`, description: `${counts[id]} rows: ${EXCUSES[id].reason}` });
	test.info().annotations.push(
		{ type: 'rows in the fixture', description: String(left.fixtureRows) },
		...Object.entries(LEFT_OUT).map(([id, { owner, reason }]) => ({
			type: `left out ${id}: ${owner}`,
			description: `${left[id as LeftOutId]} rows: ${reason}`
		})),
		{ type: 'rows replayed', description: String(rows.length) },
		{ type: 'rows that match P0 exactly', description: String(counts.exact) },
		{ type: 'rows listed in KNOWN_GAPS', description: String(counts.known) },
		...(Object.keys(EXCUSES) as ExcuseId[]).map(share)
	);
	if (process.env.KEY_PARITY_OUT)
		fs.writeFileSync(
			path.join(process.env.KEY_PARITY_OUT, `${rel.replace(/\//g, '_')}.json`),
			JSON.stringify({ rows: rows.length, left, ...counts, differ, excused }, null, 1)
		);
	expect(differ.slice(0, 60)).toEqual([]);
	// the gap list and the budgets are kept on the harness: Electron breaks a few lines of the long papers elsewhere
	const ratchet = test.info().project.name === 'canvas-web';
	if (ratchet && !process.env.KEY_PARITY_CATS)
		expect(
			KNOWN_GAPS.filter((known) => known.docs.test(rel) && !usedGaps.has(known)).map((known) => String(known.row)),
			'KNOWN_GAPS entries that no row matches any more'
		).toEqual([]);
	if (ratchet)
		for (const id of Object.keys(EXCUSES) as ExcuseId[])
			expect(counts[id], `${id} rows against EXCUSE_BUDGET (keyParityBudget.json)`).toBeLessThanOrEqual(EXCUSE_BUDGET[rel]?.[id] ?? 0);
	if (rows.length) expect(counts.exact, 'rows that match P0 exactly').toBeGreaterThan(0);
	expect(await visual.evalView<string>(DOC_JSON), 'the document is back as it was').toBe(original);
	expect(await probeErrors(page)).toEqual([]);
}

for (const { name, data } of fixtures) {
	const rel = `${data.environment.folder}/${data.environment.file}`;
	test(`${rel}: P0's key outcomes`, async () => {
		test.skip(!(rel in parityDocs), `no ${path.join(DOCS, rel)}`);
		test.setTimeout(900_000);
		const { scroller: p0 } = data.environment;
		const scroller = p0 ? { client: p0.client, left: p0.box[0] } : null;
		const left = emptyLeftOut();
		await replay({ rel, rows: planFixture(rel, data, left), left, docSize: data.environment.docSize, scroller });
	});
	void name;
}

for (const rel of Object.keys(chipFixture.documents)) {
	test(`${rel}: the DOM editor's arrows and word moves beside drawn chips`, async () => {
		test.setTimeout(300_000);
		await replay({ rel, rows: planChipRows(rel), left: emptyLeftOut(), docSize: null, scroller: null });
	});
}
