// the graphics a raw figure block shows, each one an image can draw
import { codeOnly } from '$lib/languages/latex/texCode';
import { fileCallsIn } from '$lib/languages/latex/knowledge/calls/fileCommands';
import { rolesOf } from '$lib/languages/latex/knowledge/calls/commandCalls';
import { browserGraphicNames } from '$lib/editor/visual/graphicsCandidates';

type GraphicPreview = { path: string; names: string[] };

export function graphicPreviews(text: string): GraphicPreview[] {
	return fileCallsIn(codeOnly(text), ['graphic']).flatMap((call) =>
		call.args
			.filter((a) => rolesOf(a.arg).includes('graphic'))
			.flatMap((a) => a.values.slice(0, 1).map((v) => ({ path: v.value, names: browserGraphicNames(v.value, a.arg.accepts) })))
			.filter((preview) => preview.names.length)
	);
}

/** a raw block with at least one graphic an image can show */
export function isRawFigure(text: string): boolean {
	return graphicPreviews(text).length > 0;
}
