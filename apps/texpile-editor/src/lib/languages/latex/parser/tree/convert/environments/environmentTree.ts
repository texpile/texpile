// an environment to its blocks: code, formulas, lists, quotes, floats and tables, else a preserved environment node
import { buildNode, type ConversionContext, type PmNode } from '../../../builders';
import { holdsMath, type EnvFacts } from '../../../../knowledge/environments/envFacts';
import { tableEnvFacts } from '../../../signatures/environmentFacts';
import { PieceCursor } from '../../walk/pieceCursor';
import { argumentsText, type TreeEnvironment } from '../../walk/treeEnvironment';
import { sliceOf, type TreeImport } from '../../importCore/treeImport';
import { rawBlockOf } from '../../importCore/importChips';
import { blocksOf } from '../blocksTree';
import { environmentBodyOf, environmentImports, roleImports, verbatimImports } from '$lib/languages/latex/visual/core/plugin/documentMap';

/** an environment with no widget whose body is not prose stays a chip */
function staysRawEnvironment(facts: EnvFacts): boolean {
	return facts.body != null || facts.in === 'math' || facts.cells === true;
}

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
	if (env.node.name === 'VerbatimEnvironment') return verbatimImports.get(env.name)?.(im, env, ctx) ?? [rawBlockOf(im, env)];
	const facts = tableEnvFacts(im.readings.table, env.name);
	if (holdsMath(facts)) return roleImports.math?.(im, env, ctx) ?? [rawBlockOf(im, env)];
	const handler = environmentImports.get(env.name);
	const handled = handler?.(im, env, ctx);
	if (handled) return handled;
	if (staysRawEnvironment(facts)) return [rawBlockOf(im, env)];
	if (facts.item) return roleImports.items?.(im, env, ctx) ?? [rawBlockOf(im, env)];
	if (im.options.unknownHandling === 'ignore') return null;
	// any other environment stays editable, its \begin arguments carried as written (minipage keeps its {width})
	const attached = argumentsText(im.src, env);
	const leading = attached ? { args: '', rest: env.body } : leadingArguments(im, env);
	const body = environmentBodyOf(env.name);
	const inner = body ? body.blocks(im, env.name, leading.rest) : blocksOf(im, leading.rest);
	return [buildNode('environment', { name: env.name, args: attached + leading.args }, inner.length > 0 ? inner : [buildNode('paragraph')])];
}
