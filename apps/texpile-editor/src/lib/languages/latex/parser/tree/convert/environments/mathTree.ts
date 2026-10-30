// display math environments to formula blocks, labels and line labels included
import { buildNode, textNode, type PmNode } from '../../../builders';
import { tableEnvFacts } from '../../../signatures/environmentFacts';
import { bytesSpan, concatSpans, sliceSpans, standsFor, type LeafSpan } from '$lib/editor/visual/sourceSpans';
import { PieceCursor } from '../../walk/pieceCursor';
import { bodyOf, type Stretch } from '../../walk/stretch';
import { mandatoryArgs } from '../../walk/treeArgs';
import type { TreeEnvironment } from '../../walk/treeEnvironment';
import type { TreeImport, Span } from '../treeImport';
import { commandName } from '../treeCalls';
import { argTextContent } from '../macroTree';
import { readCallAt } from '../inlineTree';

// multline and eqnarray need their environment or the serializer drops the line labels, flalign its & columns
const FORMULAS: [name: string, environment?: string][] = [
	['equation'],
	['align', 'align'],
	['alignat', 'alignat'],
	['flalign', 'flalign'],
	['gather', 'gather'],
	['multline', 'multline'],
	['eqnarray', 'eqnarray']
];

const ENVIRONMENT_OF = new Map<string, string | undefined>([
	...FORMULAS.flatMap(([name, environment]): [string, string | undefined][] => [
		[name, environment],
		[`${name}*`, environment]
	]),
	['displaymath', undefined],
	['math', undefined]
]);

export const FORMULA_ENVIRONMENTS: ReadonlySet<string> = new Set(ENVIRONMENT_OF.keys());

type MappedText = { text: string; spans: LeafSpan[] };

function withoutLabels(im: TreeImport, body: Span, labels: Span[]): MappedText {
	const parts: { len: number; spans: LeafSpan[] }[] = [];
	let text = '';
	let at = body.from;
	for (const l of [...labels, { from: body.to, to: body.to }]) {
		const piece = im.src.slice(at, l.from);
		parts.push({ len: piece.length, spans: bytesSpan(piece.length, at) });
		text += piece;
		at = l.to;
	}
	return { text, spans: concatSpans(parts) };
}

const CONTAINERS = new Set(['Group', 'Environment', 'InlineMath', 'DisplayMath', 'BracketMath', 'ParenMath', 'OwnMath']);

// a label inside a group, which has no row of its own
function nestedLabels(im: TreeImport, s: Stretch, labels: Span[], nested: string[]): void {
	const cursor = new PieceCursor(im.src, s);
	for (let p = cursor.next(); p; p = cursor.next()) {
		if (p.kind !== 'node') continue;
		if (CONTAINERS.has(p.node.name)) nestedLabels(im, bodyOf(p.node), labels, nested);
		else if (p.node.name === 'ControlWord' && commandName(im, p) === 'label') {
			const call = readCallAt(im, cursor, p);
			const text = argTextContent(im, mandatoryArgs(call)[0]);
			// a \label{} names nothing to put back, so it stays in the math
			if (!text) continue;
			labels.push(call);
			nested.push(text);
		}
	}
}

export function blockMathOf(im: TreeImport, env: TreeEnvironment): PmNode[] {
	const environment = ENVIRONMENT_OF.get(env.name);
	const numbered = tableEnvFacts(im.readings.table, env.name).numbering != null;
	// one slot per row, so a label on the second row stays on the second row when the serializer puts them back
	const lineLabels: string[] = [];
	const labels: Span[] = [];
	const nested: string[] = [];
	const body = bodyOf(env.node);
	const cursor = new PieceCursor(im.src, body);
	let row = 0;
	for (let p = cursor.next(); p; p = cursor.next()) {
		if (p.kind === 'node' && CONTAINERS.has(p.node.name)) nestedLabels(im, bodyOf(p.node), labels, nested);
		if (p.kind !== 'node' || (p.node.name !== 'ControlWord' && p.node.name !== 'ControlSymbol')) continue;
		const name = commandName(im, p);
		if (name === '\\') row++;
		if (name !== 'label') continue;
		const call = readCallAt(im, cursor, p);
		const text = argTextContent(im, mandatoryArgs(call)[0]);
		if (!text) continue;
		labels.push(call);
		while (lineLabels.length <= row) lineLabels.push('');
		lineLabels[row] = text;
	}
	for (const label of nested) if (!lineLabels.includes(label)) lineLabels.push(label);
	let { text, spans }: { text: string; spans: LeafSpan[] | null } = withoutLabels(im, body, labels);
	if (environment) {
		// the editor holds the multi-line environments wrapped; the wrapper stands for the source's own \begin and \end
		const open = `\\begin{${env.name}}`;
		const close = `\\end{${env.name}}`;
		spans = spans
			? concatSpans([
					{ len: open.length, spans: standsFor(open.length, env.from, body.from) },
					{ len: text.length, spans },
					{ len: close.length, spans: standsFor(close.length, body.to, env.to) }
				])
			: null;
		text = `${open}${text}${close}`;
	} else if (spans) {
		const lead = text.length - text.trimStart().length;
		const trimmed = text.trim();
		spans = sliceSpans(text, spans, lead, lead + trimmed.length);
		text = trimmed;
	}
	const label = lineLabels.find((l) => l) ?? null;
	return [
		buildNode('block_math', { label, numbered, environment: environment ?? null, lineLabels, starredEnv: env.name === 'equation*' }, [
			textNode(text.trim(), null, spans)
		])
	];
}
