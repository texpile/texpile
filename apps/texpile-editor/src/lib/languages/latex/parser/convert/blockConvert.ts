// one AST node to its block-level PM nodes, dispatching to the env/macro handler tables
// mutually recursive with convertNodesToBlocks in converter.ts; ESM live bindings make the circular import safe
import type { Node, Macro, Environment } from '@unified-latex/unified-latex-types';
import { printRaw } from '@unified-latex/unified-latex-util-print-raw';
import { type RawStamped } from '../ast-utils';
import { buildNode, textNode, nodeToLatexString, type PmNode, type ConversionContext, type ConversionOptions } from '../builders';
import { ignoredMacros } from '../macros';
import { convertNodesToBlocks } from '../converter';
import { macroHandlers } from './macroHandlers';
import { envHandlers, formulaHandlers, transparentEnvironments, verbatimHandlers } from './envHandlers';
import { staysRawEnvironment } from './blockKinds';
import { environmentFacts } from '../signatures/environmentFacts';
import { holdsMath } from '../../knowledge/environments/envFacts';
import {
	nodeRawSpan,
	displayRawSpan,
	mathBodyRawSpan,
	envBeginEnd,
	prefixSpans,
	rawTextNode,
	trimmedRaw,
	macroSpan,
	type RawSpan
} from './origCapture';
import { bytesSpan, noteSpans, spansOf, standsFor } from '$lib/editor/visual/sourceSpans';

/**
 * An environment with no registered signature gets its arguments parsed as body: `[1]` after
 * `\begin{algorithmic}` as loose strings, `{1.5}` after `\begin{spacing}` as a group. Anything
 * glued to the \begin is an argument and belongs on the node's `args`, not in the first paragraph.
 */
function startOf(n: Node): number | undefined {
	return (n as { position?: { start?: { offset?: number } } }).position?.start?.offset;
}

function endOf(n: Node): number | undefined {
	return (n as { position?: { end?: { offset?: number } } }).position?.end?.offset;
}

function hoistLeadingEnvArgs(env: Environment): { args: string; rest: Node[] } {
	const content = env.content;
	const none = { args: '', rest: content };
	// glued means no whitespace in the SOURCE: the parser drops the newline after \begin, so a
	// `{\bfseries Title}` on the next line looks adjacent in the AST and is body
	let cursor = envBeginEnd(env);
	if (cursor == null) return none;
	const parts: string[] = [];
	let i = 0;
	while (i < content.length) {
		const n = content[i];
		if (startOf(n) !== cursor) break;
		if (n.type === 'group') {
			parts.push(printRaw(n));
			cursor = endOf(n) ?? -1;
			i++;
			continue;
		}
		if (n.type === 'string' && n.content === '[') {
			const close = content.findIndex((c, k) => k > i && c.type === 'string' && c.content === ']');
			if (close < 0) break;
			parts.push(printRaw(content.slice(i, close + 1)));
			cursor = endOf(content[close]) ?? -1;
			i = close + 1;
			continue;
		}
		break;
	}
	return i > 0 ? { args: parts.join(''), rest: content.slice(i) } : none;
}

function rawEnvironmentChip(node: Node): PmNode {
	return buildNode('raw_latex', null, [rawTextNode(nodeRawSpan(node), nodeToLatexString(node))]);
}

// a diagram or table set in a display (tikzcd, tabular) is no formula the math field can draw; only a clean source
// slice becomes a chip, as a printed one loses the comments
function nonMathSlice(node: Node, options: ConversionOptions, slice: (node: Node) => RawSpan | null): RawSpan | null {
	const holdsNonMath = ((node as { content?: Node[] }).content ?? []).some((n) => {
		if (n.type !== 'environment' && n.type !== 'mathenv') return false;
		const name = (n as { env: string | { content?: string } }).env;
		return !holdsMath(environmentFacts(options, typeof name === 'string' ? name : (name?.content ?? '')));
	});
	return holdsNonMath ? slice(node) : null;
}

export function convertNodeToBlock(node: Node, ctx: ConversionContext, options: ConversionOptions): PmNode[] | null {
	switch (node.type) {
		case 'verbatim': {
			// the tokenizer's verbatim-bodied environments; one without a code widget (comment, smfart's abstract) stays a chip
			const env = node as unknown as Environment;
			const verbatimHandler = verbatimHandlers[env.env];
			if (verbatimHandler) return verbatimHandler(env, ctx, options);
			return [rawEnvironmentChip(node)];
		}
		case 'environment': {
			const env = node as Environment;
			const envHandler = envHandlers[env.env];
			if (envHandler) return envHandler(env, ctx, options);
			if (transparentEnvironments.has(env.env)) return convertNodesToBlocks(env.content, options);

			if (staysRawEnvironment(environmentFacts(options, env.env))) return [rawEnvironmentChip(node)];
			if (options.unknownHandling === 'ignore') return null;

			// default: auto-wrap any other environment as editable, carrying the \begin args
			// verbatim so e.g. minipage keeps its {width}.
			const attached = env.args && env.args.length ? printRaw(env.args) : '';
			const leading = attached ? { args: '', rest: env.content } : hoistLeadingEnvArgs(env);
			const envInner = convertNodesToBlocks(leading.rest, options);
			return [
				buildNode(
					'environment',
					{ name: env.env, args: attached + leading.args },
					envInner.length > 0 ? envInner : [buildNode('paragraph')]
				)
			];
		}
		case 'mathenv': {
			// the declared type says `env: string`, but some math envs hand back a nested node
			// instead; same declared-vs-actual gap as codeBlockFromVerbatimEnv's verbatim body.
			const mathEnv = node as Omit<Environment, 'env'> & { env: string | { content?: string } };
			const envName = typeof mathEnv.env === 'string' ? mathEnv.env : mathEnv.env?.content || 'equation';
			const formulaHandler = formulaHandlers[envName];
			const diagram = nonMathSlice(node, options, nodeRawSpan);
			if (diagram) return [buildNode('raw_latex', null, [rawTextNode(diagram, diagram.text)])];
			if (formulaHandler) return formulaHandler({ ...(mathEnv as object), env: envName } as Environment, ctx, options);
			return [rawEnvironmentChip(node)];
		}
		case 'displaymath': {
			const diagram = nonMathSlice(node, options, displayRawSpan);
			if (diagram) return [buildNode('raw_latex', null, [rawTextNode(diagram, diagram.text)])];
			// slice the exact source between the delimiters; printRaw fallback
			const body = mathBodyRawSpan(node, ['\\[', '$$'], ['\\]', '$$']);
			const sliced = body ? trimmedRaw(body) : null;
			const content = sliced ? sliced.text : String(printRaw(node.content || []) || '').trim();
			return [
				buildNode('block_math', { label: null, numbered: false, environment: null, lineLabels: [] }, [
					textNode(content, null, sliced ? bytesSpan(content.length, sliced.from) : null)
				])
			];
		}

		case 'macro': {
			const macro = node as Macro;
			// a commented call captured verbatim by the heuristics: emit as-is
			const rawMacro = macro as RawStamped<Macro>;
			if (rawMacro._raw != null) {
				const raw = String(rawMacro._raw);
				return [buildNode('raw_latex', null, [textNode(raw, null, prefixSpans(raw, startOf(macro)))])];
			}
			if (ignoredMacros.has(macro.content)) return null;

			const handler = macroHandlers[macro.content];
			if (handler) {
				const result = handler(macro, ctx);
				// handlers returning block nodes are taken at face value; inline macros fall
				// through so they can be re-emitted inside a paragraph below.
				if (
					result &&
					result.length > 0 &&
					['heading', 'horizontal_rule', 'includedoc', 'abstract', 'image'].includes(result[0].type.name)
				) {
					// a block that is a chip of its own (\input, \hrule) stands for the call's bytes
					const span = macroSpan(macro);
					if (span) for (const n of result) if (n.childCount === 0 && !spansOf(n)) noteSpans(n, standsFor(1, span.from, span.to));
					return result;
				}
			}
			const handling = options.unknownHandling ?? 'raw_latex';
			if (handling === 'raw_latex') {
				const raw = nodeRawSpan(node);
				const latexSource = raw?.text ?? nodeToLatexString(node);
				if (String(latexSource || '').trim())
					return [buildNode('raw_latex', null, [textNode(latexSource, null, raw ? bytesSpan(latexSource.length, raw.from) : null)])];
			}
			return null;
		}
		default:
			return null;
	}
}
