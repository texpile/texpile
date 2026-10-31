import type { PlaceDirection, NodeSide } from '$lib/draw/editor/figure/figureLanguage';
import { appendStatement } from '../inserts/newStatements';
import { ensureNodeName, nodeName } from '../nodes';
import { withLibrary } from '../options/libraries';
import { nodeOptionLists } from '../options/optionList';
import { readPicture } from '../picture';
import { readPlacement } from './placement';

const TOWARD: Record<NodeSide, PlaceDirection> = { north: 'above', south: 'below', east: 'right', west: 'left' };
// a side another step already takes sends the next one across it, so a decision's branches fan out
const ACROSS: Partial<Record<PlaceDirection, PlaceDirection>> = { above: 'right', below: 'right', right: 'below', left: 'below' };
// what a step does not take from the one it follows: where that one is, and the name and marks only one node has
const OWN = /^(name|at|anchor|label|pin|[xy]?shift|initial|accepting)\b|^(above|below|left|right)( left| right)?\s*=.*\bof\b/;

function freshName(source: string) {
	let k = 1;
	while (new RegExp(`\\(\\s*n${k}\\s*\\)|name\\s*=\\s*n${k}\\b`).test(source)) k++;
	return `n${k}`;
}

/** the next step of a flowchart: a node like statement `i`, placed on its side, and an arrow to it */
export function addStep(source: string, pictureIndex: number, i: number, side: NodeSide, text: string) {
	const first = readPicture(source, pictureIndex);
	const st = first?.statements.find((s) => s.i === i);
	if (!first || first.layout || st?.kind !== 'node') return null;
	const named = ensureNodeName(source, st);
	let next = named.source;
	const picture = readPicture(next, pictureIndex)!;
	const own = picture.statements.find((s) => s.i === i)!;
	const items = nodeOptionLists(next, own)
		.flatMap((o) => o.items)
		.filter((x) => !OWN.test(x));
	let [direction, of] = [TOWARD[side], named.name];
	for (let hops = 0; hops < picture.statements.length; hops++) {
		const taken = picture.statements.find((s) => {
			const p = s.kind === 'node' ? readPlacement(next, s) : null;
			return p?.direction === direction && p.of === of;
		});
		const takenName = taken && nodeName(next, taken);
		if (!takenName) break;
		[direction, of] = [hops ? direction : (ACROSS[direction] ?? direction), takenName];
	}
	const name = freshName(next);
	const node = `\\node[${[...items, `${direction}=of ${of}`].join(', ')}] (${name}) {${text}};`;
	const added = appendStatement(next, picture, `${node}\n\\draw[->] (${named.name}) -- (${name});`);
	const library = withLibrary(added.source, 'positioning');
	next = library.source;
	return { source: next, at: added.at + library.shift };
}
