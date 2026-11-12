// what a document numbers, in reading order
import type { Node as PMNode } from 'prosemirror-model';
import type { ChipCountsOf } from '$lib/editor/visual/extensions/drawnChips/footnoteNumbers';
import { numberedKindOf, type NumberedKind } from './numberedNodes';
import { counterChangesIn, withinChangesIn, type CounterChange, type NumberingScheme, type WithinChange } from './numberingScheme';
import { definedFormsIn, NUMBERED_MATH, NUMBERED_MATH_ENVIRONMENTS, type MathOpeners } from './definedForms';
import { texIncludesIn, type TexInclude } from '$lib/workspace/document/texIncludes';
import { codeOnly } from '$lib/languages/latex/texCode';

export type Item = { node: PMNode; pos: number; kind: NumberedKind; counter?: string };
export type NumberEvent =
	// foreign: in a file read in, counted and shown nowhere here
	| { type: 'item'; item: Item; foreign?: true }
	| { type: 'appendix' }
	// \frontmatter and \backmatter: a chapter prints no number and steps nothing until \mainmatter
	| { type: 'matter'; main: boolean }
	| { type: 'change'; change: CounterChange }
	| { type: 'subequations'; open: boolean }
	// its footnotes count in a counter of their own, restarted at each
	| { type: 'minipage' }
	| { type: 'minipage-end' }
	// a file read in here numbers what it holds, which this document does not show
	| { type: 'include'; includes: TexInclude[] }
	| { type: 'form'; counter: string; form: string | null }
	| { type: 'within'; change: WithinChange }
	// math or a float the editor shows as source, numbered where the editor cannot see
	| { type: 'hidden'; counter: 'equation' | 'figure' | 'table' };

const APPENDIX = /\\append(ix|ices)(?![a-zA-Z@])/;
const MATTER = /\\(front|main|back)matter(?![a-zA-Z@])/g;
const HIDDEN_FLOAT = /\\begin\s*\{(figure|table)\*?\}/g;

export type EventScheme = Pick<NumberingScheme, 'mathOpeners' | 'theorems'>;

// first: what the chip says before any math it hides is counted. floats: the floats it holds
type ChipEvents = { code: string; first: NumberEvent[]; floats: NumberEvent[] };
// a long document holds thousands of chips, and each one says the same for as long as it is the same node
const chipEvents = new WeakMap<PMNode, ChipEvents>();

function chipEventsOf(node: PMNode): ChipEvents {
	const kept = chipEvents.get(node);
	if (kept) return kept;
	const text = node.textContent;
	const code = codeOnly(text);
	const first: NumberEvent[] = [];
	for (const m of code.matchAll(MATTER)) first.push({ type: 'matter', main: m[1] === 'main' });
	if (APPENDIX.test(code)) first.push({ type: 'appendix' });
	for (const change of counterChangesIn(text)) first.push({ type: 'change', change });
	const includes = texIncludesIn(code);
	if (includes.length) first.push({ type: 'include', includes });
	for (const change of withinChangesIn(code)) first.push({ type: 'within', change });
	for (const { counter, form } of definedFormsIn(code)) first.push({ type: 'form', counter, form });
	const floats = [...code.matchAll(HIDDEN_FLOAT)].map((m): NumberEvent => ({ type: 'hidden', counter: m[1] as 'figure' | 'table' }));
	const events = { code, first, floats };
	chipEvents.set(node, events);
	return events;
}

export function eventsIn(doc: PMNode, countsOf: ChipCountsOf, scheme: EventScheme): NumberEvent[] {
	const out: NumberEvent[] = [];
	const openers: MathOpeners = scheme.mathOpeners;
	const hidden = openers.macros.length ? new RegExp(String.raw`\\(${openers.macros.join('|')})(?![a-zA-Z@])`) : null;
	const opening = new Set([...NUMBERED_MATH_ENVIRONMENTS, ...openers.environments]);
	// inside a float the editor shows as an environment (one of subfigures), its images are no figures of their own
	function walk(parent: PMNode, start: number, inFloat: boolean): void {
		parent.forEach((node, offset) => {
			const pos = start + offset;
			const chip = node.type.name === 'raw_latex' || node.type.name === 'inline_latex';
			if (chip) {
				const { code, first, floats } = chipEventsOf(node);
				out.push(...first);
				// a footnote or a box shown as source can hold numbered math too
				if (hidden?.test(code) || NUMBERED_MATH.test(code)) out.push({ type: 'hidden', counter: 'equation' });
				out.push(...floats);
			}
			if (node.type.name === 'includedoc') {
				const includes = texIncludesIn(`\\${String(node.attrs.command)}{${String(node.attrs.path)}}`);
				if (includes.length) out.push({ type: 'include', includes });
				return;
			}
			const kind = numberedKindOf(node, countsOf);
			if (node.type.name === 'float_caption' && !node.attrs.starred)
				out.push({ type: 'item', item: { node, pos, kind: 'theorem', counter: String(node.attrs.float) } });
			if (kind && !(inFloat && (kind === 'figure' || kind === 'table'))) out.push({ type: 'item', item: { node, pos, kind } });
			if (chip || kind === 'equation') return;
			const env = node.type.name === 'environment' ? String(node.attrs.name) : null;
			if (env && Object.hasOwn(scheme.theorems, env))
				out.push({ type: 'item', item: { node, pos, kind: 'theorem', counter: scheme.theorems[env] } });
			const float = env ? (/^(figure|table)\*?$/.exec(env)?.[1] as 'figure' | 'table' | undefined) : undefined;
			if (float) out.push({ type: 'hidden', counter: float });
			if (env && opening.has(env)) out.push({ type: 'hidden', counter: 'equation' });
			if (env === 'appendix' || env === 'appendices') out.push({ type: 'appendix' });
			if (env === 'subequations') out.push({ type: 'subequations', open: true });
			if (env === 'minipage') out.push({ type: 'minipage' });
			walk(node, pos + 1, inFloat || !!float || node.type.name === 'figure_group');
			if (env === 'subequations') out.push({ type: 'subequations', open: false });
			if (env === 'minipage') out.push({ type: 'minipage-end' });
		});
	}
	walk(doc, 0, false);
	return out;
}
