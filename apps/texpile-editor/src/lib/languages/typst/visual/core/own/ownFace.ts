// a call of the paper's own function or a read of its own value, drawn as what its definition prints
import type { ChipFace } from '$lib/editor/visual/extensions/drawnChips/chipFace';
import { awaitTypstLets, drawExpansion, typstScopeOfDrawing } from '../scope/fileScopeNow.svelte';
import { faceFollowingScope } from '../scope/scopeFollowingFace';
import { textOf } from '../../../knowledge/scan/syntax';
import { faceOf } from '../parts/wordsFace';
import { faceOfDrawing } from '../parts/drawingFace';
import type { TypstDrawer } from '../plugin/typstPlugin';
import { ownEnvironment } from './ownEnvironment';
import { ownMarkup } from './ownExpansion';
import { readOwnUse, type OwnUse } from './ownUse';

const MOST_DEPTH = 6;
let depth = 0;

function argumentsOf(use: OwnUse): string[] {
	const args = use.call ? [...use.call.args, ...use.call.bodies] : [];
	return args.flatMap((arg) => (arg.kind === 'ContentBlock' ? [arg.value, `#${arg.value}`] : [arg.value]));
}

let reading: Set<string> | null = null;

function drawOwn(written: string, drawer: TypstDrawer): ChipFace | null {
	const scope = typstScopeOfDrawing(written);
	const use = scope && depth < MOST_DEPTH ? readOwnUse(written, scope) : null;
	if (!scope || !use) return null;
	reading?.add(use.name.split('.')[0]);
	depth++;
	try {
		const expansion = { scope: use.own.scope, caller: scope, args: argumentsOf(use), body: textOf(use.body, use.own.source) };
		const expanded = drawExpansion(expansion, () => {
			const markup = ownMarkup(use);
			return markup === null ? null : drawer.drawMarkup(markup);
		});
		const drawing = expanded ?? ownEnvironment(use, drawer);
		if (!drawing) return null;
		if (!drawing.empty) return faceOfDrawing(drawing, written);
		drawing.faces.forEach((face) => face.destroy?.());
		return faceOf(use.name, 'drawn-typst-quiet', written);
	} finally {
		depth--;
	}
}

export function ownFace(source: string, drawer: TypstDrawer): ChipFace | null {
	const written = source.trim();
	if (reading) return drawOwn(written, drawer);
	const names = new Set<string>();
	function draw(): ChipFace | null {
		reading = names;
		try {
			return drawOwn(written, drawer);
		} finally {
			reading = null;
		}
	}
	const first = draw();
	if (!first) awaitTypstLets(names);
	return first && faceFollowingScope(first, draw, (changed) => [...names].some((name) => changed.has(name)));
}
