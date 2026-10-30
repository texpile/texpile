// what a document numbers, in reading order
import type { Node as PMNode } from 'prosemirror-model';
import { numberedKindOf, type NumberedKind } from './numberedNodes';
import { counterChangesIn, withinChangesIn, type CounterChange, type WithinChange } from './numberingScheme';
import { definedFormsIn, NUMBERED_MATH, NUMBERED_MATH_ENVIRONMENTS, type MathOpeners } from './definedForms';
import { texIncludesIn, type TexInclude } from '$lib/workspace/document/texIncludes';
import { codeOnly } from '$lib/languages/latex/texCode';

export type FootnoteMarks = (source: string) => (number | null)[];
export type Item = { node: PMNode; pos: number; kind: NumberedKind };
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

export function eventsIn(doc: PMNode, footnoteMarks: FootnoteMarks, openers: MathOpeners): NumberEvent[] {
	const out: NumberEvent[] = [];
	const hidden = openers.macros.length ? new RegExp(String.raw`\\(${openers.macros.join('|')})(?![a-zA-Z@])`) : null;
	const opening = new Set([...NUMBERED_MATH_ENVIRONMENTS, ...openers.environments]);
	// inside a float the editor shows as an environment (one of subfigures), its images are no figures of their own
	function walk(parent: PMNode, start: number, inFloat: boolean): void {
		parent.forEach((node, offset) => {
			const pos = start + offset;
			const chip = node.type.name === 'raw_latex' || node.type.name === 'inline_latex';
			if (chip) {
				const text = node.textContent;
				const code = codeOnly(text);
				for (const m of code.matchAll(MATTER)) out.push({ type: 'matter', main: m[1] === 'main' });
				if (APPENDIX.test(code)) out.push({ type: 'appendix' });
				for (const change of counterChangesIn(text)) out.push({ type: 'change', change });
				const includes = texIncludesIn(code);
				if (includes.length) out.push({ type: 'include', includes });
				for (const change of withinChangesIn(code)) out.push({ type: 'within', change });
				for (const { counter, form } of definedFormsIn(code)) out.push({ type: 'form', counter, form });
				// a footnote or a box shown as source can hold numbered math too
				if (hidden?.test(code) || NUMBERED_MATH.test(code)) out.push({ type: 'hidden', counter: 'equation' });
				for (const m of code.matchAll(HIDDEN_FLOAT)) out.push({ type: 'hidden', counter: m[1] as 'figure' | 'table' });
			}
			if (node.type.name === 'includedoc') {
				const includes = texIncludesIn(`\\${String(node.attrs.command)}{${String(node.attrs.path)}}`);
				if (includes.length) out.push({ type: 'include', includes });
				return;
			}
			const kind = numberedKindOf(node, footnoteMarks);
			if (kind && !(inFloat && (kind === 'figure' || kind === 'table'))) out.push({ type: 'item', item: { node, pos, kind } });
			if (chip || kind === 'equation') return;
			const env = node.type.name === 'environment' ? String(node.attrs.name) : null;
			const float = env ? (/^(figure|table)\*?$/.exec(env)?.[1] as 'figure' | 'table' | undefined) : undefined;
			if (float) out.push({ type: 'hidden', counter: float });
			if (env && opening.has(env)) out.push({ type: 'hidden', counter: 'equation' });
			if (env === 'appendix' || env === 'appendices') out.push({ type: 'appendix' });
			if (env === 'subequations') out.push({ type: 'subequations', open: true });
			if (env === 'minipage') out.push({ type: 'minipage' });
			walk(node, pos + 1, inFloat || !!float);
			if (env === 'subequations') out.push({ type: 'subequations', open: false });
			if (env === 'minipage') out.push({ type: 'minipage-end' });
		});
	}
	walk(doc, 0, false);
	return out;
}
