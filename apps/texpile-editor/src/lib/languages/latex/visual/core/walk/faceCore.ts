import type { ChipFace } from '$lib/editor/visual/extensions/drawnChips/chipFace';
import type { SourceUnit } from '$lib/languages/latex/parser/tree/walk/sourceUnits';
import type { TreeArg } from '$lib/languages/latex/parser/tree/walk/treeArgs';
import type { LatexFaceCore } from '../plugin/latexPlugin';
import { argText, optionalText, partsOf, type Drawing } from '../reading/drawing';
import { argUnits, unitsIn } from '../reading/chipUnits';
import { ownMacroDefined } from '../own/ownMacroFace.svelte';
import { MOST_DEPTH } from '../own/ownMacroPart';

export type DrawingWalk = {
	group(units: SourceUnit[], d: Drawing): ChipFace | ChipFace[] | null;
	units(units: SourceUnit[], d: Drawing): ChipFace[] | null;
	latex(source: string, d: Drawing): ChipFace | null;
	arguments(args: TreeArg[], d: Drawing): ChipFace[] | null;
};

export function faceCoreOf(d: Drawing, source: string, walk: DrawingWalk): LatexFaceCore {
	const inner: Drawing = { ...d, top: false };
	return {
		src: d.src,
		source,
		inTitle: !!d.title,
		text: (arg) => argText(d, arg ?? undefined),
		optional: (call) => optionalText(d, call),
		draw: (arg) => partsOf(walk.group(argUnits(d, arg), d)),
		drawRun: (arg) => walk.units(argUnits(d, arg), d),
		drawArguments: (args) => walk.arguments(args, d),
		unitsOf: (s) => unitsIn(d.src, s, !!d.title),
		drawUnits: (units) => walk.units(units, inner),
		drawSource: (latex) => (d.depth < MOST_DEPTH ? walk.latex(latex, { ...inner, block: false, depth: d.depth + 1 }) : null),
		nextFootnote: d.nextFootnote,
		definedByPaper: ownMacroDefined
	};
}
