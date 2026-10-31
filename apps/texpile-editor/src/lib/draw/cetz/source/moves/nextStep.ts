import type { NodeSide, PlaceDirection } from '$lib/draw/editor/figure/figureLanguage';
import { appendStatement } from '../newStatements';
import { ensureNodeName, freshName, nodeName } from '../nodes/nodeNames';
import { isGeometryArg, outlineCall, readOutline } from '../nodes/nodeOutline';
import { readPicture } from '../picture';
import { typstText } from '../typstText';
import { readPlacement, writePlacement } from './placement';

const TOWARD: Record<NodeSide, PlaceDirection> = { north: 'above', south: 'below', east: 'right', west: 'left' };
// a side another step already takes sends the next one across it, so a decision's branches fan out
const ACROSS: Partial<Record<PlaceDirection, PlaceDirection>> = { above: 'right', below: 'right', right: 'below', left: 'below' };
// what a step does not take from the one it follows: where that one is, and the name only one node has
const OWN = new Set(['name', 'anchor', 'angle', 'initial', 'final', 'label']);

/** the next step of a flowchart: a node like statement `i`, placed on its side, and an arrow to it */
export function addStep(source: string, pictureIndex: number, i: number, side: NodeSide, text: string) {
	const first = readPicture(source, pictureIndex);
	const st = first?.statements.find((s) => s.i === i);
	if (!first || st?.kind !== 'node') return null;
	const named = ensureNodeName(source, st);
	if (!named) return null;
	const picture = readPicture(named.source, pictureIndex)!;
	const own = picture.statements.find((s) => s.i === i)!;
	let [direction, of] = [TOWARD[side], named.name];
	for (let hops = 0; hops < picture.statements.length; hops++) {
		const taken = picture.statements.find((s) => {
			const p = s.kind === 'node' ? readPlacement(named.source, s) : null;
			return p?.direction === direction && p.of === of;
		});
		const takenName = taken && nodeName(named.source, taken);
		if (!takenName) break;
		[direction, of] = [hops ? direction : (ACROSS[direction] ?? direction), takenName];
	}
	const name = freshName(named.source);
	const prefix = picture.prefix;
	const base = named.source;
	function kept(args: typeof own.args, also: (name: string) => boolean = () => false) {
		return args.filter((a) => a.name && !OWN.has(a.name) && !also(a.name)).map((a) => base.slice(a.from, a.to));
	}
	const outline = own.text ? readOutline(named.source, own) : null;
	const body = `[${typstText(text)}]`;
	// written at the origin first, then placed beside the node it follows
	const node =
		own.text && outline?.shape
			? `${outlineCall(prefix, outline.shape, [0, 0], outline.w, outline.h, [...kept(own.args, (a) => isGeometryArg({ name: a })), `name: "${name}"`])}; ${prefix}content(${[`"${name}"`, body, ...kept(own.text.args)].join(', ')})`
			: own.command === 'finite-state'
				? `finite.draw.state(${['(0, 0)', `"${name}"`, `label: ${body}`, ...kept(own.args)].join(', ')})`
				: `${prefix}content(${['(0, 0)', body, ...kept(own.args), `name: "${name}"`].join(', ')})`;
	const added = appendStatement(named.source, picture, node);
	const placed = readPicture(added, pictureIndex)!.statements.at(-1)!;
	const next = writePlacement(added, placed, { direction, distance: '1cm', of });
	if (!next) return null;
	const arrowed = appendStatement(
		next,
		readPicture(next, pictureIndex)!,
		`${prefix}line("${named.name}", "${name}", mark: (end: "straight"))`
	);
	const at = readPicture(arrowed, pictureIndex)!.statements.find((s) => s.i === placed.i)!.from;
	return { source: arrowed, at };
}
