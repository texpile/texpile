import {
	TABLE_ENVS,
	bodyOf,
	environmentNameOf,
	isBlankUnit,
	type Stretch,
	type TreeImport,
	type Unit
} from '$lib/languages/latex/visual/core/document';

export type BoxedTabular = { tabular: Unit; before: string; after: string };

function isEnvironment(u: Unit): boolean {
	return !u.call && u.piece.kind === 'node' && u.piece.node.name === 'Environment';
}

function isTabular(im: TreeImport, u: Unit): boolean {
	return isEnvironment(u) && TABLE_ENVS.includes(environmentNameOf(im, u.piece.node));
}

function boxContent(im: TreeImport, u: Unit) {
	const call = u.call;
	if (!call) {
		if (!isEnvironment(u) || environmentNameOf(im, u.piece.node) === 'center') return null;
		return bodyOf(u.piece.node);
	}
	const signature = im.readings.argumentsOf(call.name) ?? [];
	if (signature.some((a) => a.part === 'caption')) return null;
	const last = call.args.filter((a) => a.present).pop();
	return last?.braced && last.body && last === call.args[call.args.length - 1] ? last.body : null;
}

export function boxedTabularOf(im: TreeImport, u: Unit): BoxedTabular | null {
	const content = boxContent(im, u);
	if (!content) return null;
	const inner = im.core.unitsIn(content).filter((x) => !isBlankUnit(x));
	if (inner.length !== 1) return null;
	const only = inner[0];
	const tabular = isTabular(im, only) ? only : boxedTabularOf(im, only)?.tabular;
	if (!tabular) return null;
	return { tabular, before: im.src.slice(u.from, tabular.from), after: im.src.slice(tabular.to, u.to) };
}

export function holdsTabularIn(im: TreeImport, s: Stretch): boolean {
	return im.core.containsTabular(s) || im.core.unitsIn(s).some((u) => boxedTabularOf(im, u) !== null);
}
