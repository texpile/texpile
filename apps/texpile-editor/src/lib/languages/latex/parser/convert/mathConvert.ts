// display math environments to block_math nodes, labels and line labels included
import type { Node, Macro, Environment } from '@unified-latex/unified-latex-types';
import { printRaw } from '@unified-latex/unified-latex-util-print-raw';
import { getTextContent } from '../ast-utils';
import { buildNode, textNode, type PmNode, type ConversionOptions } from '../builders';
import { environmentFacts } from '../signatures/environmentFacts';
import { macroSpan, mathBodyRawSpan, positionSpan, type RawSpan } from './origCapture';
import { bytesSpan, concatSpans, sliceSpans, standsFor, type LeafSpan } from '$lib/editor/visual/sourceSpans';

type MappedText = { text: string; spans: LeafSpan[] };

/** the slice with each macro's bytes cut out; null when one of them has no place in it */
function withoutMacros(body: RawSpan, macros: Macro[]): MappedText | null {
	const parts: { len: number; spans: LeafSpan[] }[] = [];
	let text = '';
	let at = body.from;
	function piece(to: number) {
		const p = body.text.slice(at - body.from, to - body.from);
		parts.push({ len: p.length, spans: bytesSpan(p.length, at) });
		text += p;
	}
	for (const m of macros) {
		const span = macroSpan(m);
		if (!span || span.from < at || span.to > body.to) return null;
		piece(span.from);
		at = span.to;
	}
	piece(body.to);
	return { text, spans: concatSpans(parts) };
}

function trimmed(t: MappedText): MappedText {
	const lead = t.text.length - t.text.trimStart().length;
	const text = t.text.trim();
	return { text, spans: sliceSpans(t.text, t.spans, lead, lead + text.length) };
}

export function createBlockMath(env: Environment, options: ConversionOptions, environment?: string): PmNode[] {
	const numbered = environmentFacts(options, env.env).numbering != null;
	// one slot per row (rows split at \\), so a label on the second row stays on the second row
	// when the serializer puts them back; the old positional list slid every label up past an
	// unlabelled row, and \ref then pointed at the wrong equation
	const lineLabels: string[] = [];
	const contentWithoutLabel: Node[] = [];
	const labelMacros: Macro[] = [];
	let row = 0;

	for (const node of env.content) {
		if (node.type === 'macro' && node.content === 'label') {
			labelMacros.push(node as Macro);
			const mandatoryArgs = (node as Macro).args?.filter((arg) => arg.openMark === '{') || [];
			const labelText = mandatoryArgs[0] ? getTextContent(mandatoryArgs[0].content) : '';
			if (labelText) {
				while (lineLabels.length <= row) lineLabels.push('');
				lineLabels[row] = labelText;
			}
		} else {
			// unified-latex gives the row break a content of '\\' OR the whitespace it swallowed
			if (node.type === 'macro' && (node.content === '\\' || /^\s+$/.test(String(node.content)))) row++;
			contentWithoutLabel.push(node);
		}
	}

	// the exact source with the labels cut out (the serializer puts them back from lineLabels);
	// printRaw only when the slice cannot be trusted
	const body = mathBodyRawSpan(env, [`\\begin{${env.env}}`], [`\\end{${env.env}}`]);
	const sliced = body ? withoutMacros(body, labelMacros) : null;
	let mathContent = sliced?.text ?? printRaw(contentWithoutLabel);
	let spans: LeafSpan[] | null = sliced?.spans ?? null;

	// safety net for labels the tokenizer left embedded in string content, where no AST exists
	const labelRegex = /\\label\s*\{([^}]+)\}/g;
	let match: RegExpExecArray | null;
	while ((match = labelRegex.exec(mathContent)) !== null) {
		if (!lineLabels.includes(match[1])) {
			lineLabels.push(match[1]);
		}
	}
	const stripped = mathContent.replace(/\\label\s*\{[^}]+\}/g, '');
	if (stripped !== mathContent) {
		mathContent = stripped;
		spans = null;
	}

	// the editor expects the multi-line environments wrapped in the content string
	if (environment) {
		const open = `\\begin{${env.env}}`;
		const close = `\\end{${env.env}}`;
		// the wrapper text stands for the source's own \begin and \end
		const whole = positionSpan(env);
		spans =
			spans && body && whole
				? concatSpans([
						{ len: open.length, spans: standsFor(open.length, whole.from, body.from) },
						{ len: mathContent.length, spans },
						{ len: close.length, spans: standsFor(close.length, body.to, whole.to) }
					])
				: null;
		mathContent = `${open}${mathContent}${close}`;
	} else if (spans) {
		const t = trimmed({ text: mathContent, spans });
		mathContent = t.text;
		spans = t.spans;
	}

	// first label becomes the main label, rest stay in lineLabels
	const label = lineLabels.find((l) => l) ?? null;

	return [
		buildNode('block_math', { label, numbered, environment: environment || null, lineLabels, starredEnv: env.env === 'equation*' }, [
			textNode(String(mathContent || '').trim(), null, spans)
		])
	];
}

/** Horizontal-rule macros captured verbatim so borders round-trip exactly. */
