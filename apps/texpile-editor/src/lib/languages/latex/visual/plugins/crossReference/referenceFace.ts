import { referencesRange } from '$lib/languages/latex/knowledge/calls/citeCommands';
import { hasStar, mandatoryArgs, type ChipFace, type TreeArg, type TreeCall } from '$lib/languages/latex/visual/core';
import { crossRefFace } from './crossRefFace.svelte';

export function referenceFace(call: TreeCall, src: string, source: string): ChipFace | null {
	const name = call.name;
	const args = mandatoryArgs(call);
	function textOf(arg: TreeArg | undefined): string {
		return arg?.body ? src.slice(arg.body.from, arg.body.to) : '';
	}
	const range = referencesRange(name);
	const optional = call.args.find((a) => a.present && a.open === '[');
	const target = name === 'hyperref' ? (optional ? textOf(optional).trim() : null) : args[0] ? textOf(args[0]) : null;
	// an empty {} or [] is still a reference (LaTeX prints ??), so the panel can give it its label
	if (target === null || (range && !args[1])) return null;
	const labels = (range ? [target, textOf(args[1])] : target.split(',')).map((label) => label.trim()).filter(Boolean);
	const shown = name === 'hyperref' ? textOf(args[0]).replace(/~/g, '\u00a0') : null;
	return crossRefFace(hasStar(call) ? name + '*' : name, labels, shown, source, range);
}
