// an environment to its blocks: code, formulas, lists, quotes, floats and tables, else a preserved environment node
import { buildNode, textNode, type ConversionContext, type PmNode } from '../../../builders';
import { listingLanguage } from '../../../listingLanguage';
import { holdsMath, type EnvFacts } from '../../../../knowledge/environments/envFacts';
import { tableEnvFacts } from '../../../signatures/environmentFacts';
import { bytesSpan } from '$lib/editor/visual/sourceSpans';
import { PieceCursor } from '../../walk/pieceCursor';
import { argumentsText, type TreeEnvironment } from '../../walk/treeEnvironment';
import { rawBlockOf, sliceOf, type TreeImport } from '../treeImport';
import { blocksOf } from '../blocksTree';
import { holdsNonMath } from '../blockUnits';
import { blockMathOf, FORMULA_ENVIRONMENTS } from './mathTree';
import { listBlocks } from './listTree';
import { tableBlocks, tableWrapperBlocks } from '../tables/tableTree';
import { figureBlocks } from './figureTree';

/** an environment with no widget whose body is not prose stays a chip */
function staysRawEnvironment(facts: EnvFacts): boolean {
	return facts.body != null || facts.in === 'math' || facts.cells === true || facts.item != null;
}

type EnvironmentHandler = (im: TreeImport, env: TreeEnvironment, ctx: ConversionContext) => PmNode[];

const CODE_ENVIRONMENTS = new Set(['verbatim', 'lstlisting', 'minted']);

function codeBlockOf(im: TreeImport, env: TreeEnvironment): PmNode {
	const body = env.node.getChild('VerbatimBody');
	const bodyFrom = body?.from ?? env.beginTo;
	const args = sliceOf(im, { from: env.beginTo, to: bodyFrom }).trim();
	const raw = body ? sliceOf(im, body) : '';
	// the newlines at either end belong to the \begin and \end lines; the serializer writes them back
	const lead = raw.length - raw.replace(/^\r?\n/, '').length;
	const text = raw.slice(lead).replace(/\r?\n[ \t]*$/, '');
	return buildNode('code_block', { lang: listingLanguage(env.name, args) ?? 'text', env: env.name, args }, [
		textNode(text, null, bytesSpan(text.length, bodyFrom + lead))
	]);
}

function quote(im: TreeImport, env: TreeEnvironment): PmNode[] {
	return [buildNode('blockquote', null, blocksOf(im, env.body))];
}

const HANDLER_ENTRIES: Record<string, EnvironmentHandler> = {
	document: (im, env) => blocksOf(im, env.body),
	itemize: (im, env) => listBlocks(im, env, 'bullet'),
	enumerate: (im, env) => listBlocks(im, env, 'ordered'),
	description: (im, env) => listBlocks(im, env, 'bullet'),
	quote,
	quotation: (im, env) => [buildNode('blockquote', { env: 'quotation' }, blocksOf(im, env.body))],
	abstract: (im, env) => [buildNode('abstract', { sourceForm: 'env' }, blocksOf(im, env.body))],
	figure: figureBlocks,
	'figure*': figureBlocks,
	wrapfigure: figureBlocks,
	table: tableWrapperBlocks,
	'table*': tableWrapperBlocks,
	tabular: (im, env) => tableBlocks(im, env),
	'tabular*': (im, env) => tableBlocks(im, env),
	tabularx: (im, env) => tableBlocks(im, env),
	longtable: (im, env) => tableBlocks(im, env)
};
const HANDLERS = new Map(Object.entries(HANDLER_ENTRIES));

/** `[1]` after \begin{algorithmic} or `{1.5}` after \begin{spacing}, glued to the \begin: arguments no signature states */
function leadingArguments(im: TreeImport, env: TreeEnvironment): { args: string; rest: TreeEnvironment['body'] } {
	const cursor = new PieceCursor(im.src, env.body);
	let at = env.beginTo;
	for (let p = cursor.peek(); p && p.from === at; p = cursor.peek()) {
		if (p.kind === 'node' && p.node.name === 'Group') at = cursor.next()!.to;
		else if (p.kind === 'node' && p.node.name === 'OpenBracket') {
			const mark = cursor.save();
			let close = -1;
			for (let q = cursor.next(); q; q = cursor.next())
				if (q.kind === 'node' && q.node.name === 'CloseBracket') {
					close = q.to;
					break;
				}
			if (close < 0) {
				cursor.restore(mark);
				break;
			}
			at = close;
		} else break;
	}
	return { args: sliceOf(im, { from: env.beginTo, to: at }), rest: { ...env.body, from: at } };
}

export function environmentBlock(im: TreeImport, env: TreeEnvironment, ctx: ConversionContext): PmNode[] | null {
	if (env.node.name === 'VerbatimEnvironment') return [CODE_ENVIRONMENTS.has(env.name) ? codeBlockOf(im, env) : rawBlockOf(im, env)];
	const facts = tableEnvFacts(im.readings.table, env.name);
	if (holdsMath(facts)) {
		if (holdsNonMath(im, env.node) || !FORMULA_ENVIRONMENTS.has(env.name)) return [rawBlockOf(im, env)];
		return blockMathOf(im, env);
	}
	const handler = HANDLERS.get(env.name);
	if (handler) return handler(im, env, ctx);
	if (staysRawEnvironment(facts)) return [rawBlockOf(im, env)];
	if (im.options.unknownHandling === 'ignore') return null;
	// any other environment stays editable, its \begin arguments carried as written (minipage keeps its {width})
	const attached = argumentsText(im.src, env);
	const leading = attached ? { args: '', rest: env.body } : leadingArguments(im, env);
	const inner = blocksOf(im, leading.rest);
	return [buildNode('environment', { name: env.name, args: attached + leading.args }, inner.length > 0 ? inner : [buildNode('paragraph')])];
}
