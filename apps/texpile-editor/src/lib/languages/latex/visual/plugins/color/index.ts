import { commonFacts } from '$lib/languages/latex/knowledge/commands/commandFacts';
import type { Argument } from '$lib/languages/latex/knowledge/types';
import { argWhere, coloredPart, hasRole, mandatoryArgs, readingsOf, type LatexPlugin } from '$lib/languages/latex/visual/core';
import { colorSettingFace } from './colorSettingFace';
import { colorDocument } from './document';

function required(a: Argument): boolean {
	return /^[mrv]/.test(a.kind.replace(/^!/, ''));
}

/** a command that only names a color for what is around it */
function namesColor(name: string): boolean {
	if (commonFacts(name).declares !== undefined) return false;
	return readingsOf(name).some((reading) => {
		const args = reading.filter(required);
		return args.length > 0 && args.every(hasRole('color'));
	});
}

export const color: LatexPlugin = {
	commands: ['textcolor'],
	role: { commands: namesColor },
	face(part, core) {
		if (part.kind !== 'command') return undefined;
		const args = mandatoryArgs(part.call);
		if (part.name === 'textcolor' && args.length === 2 && core.optional(part.call) === null)
			return coloredPart(core.text(args[0]), core.drawRun(args[1]));
		if (!namesColor(part.name)) return undefined;
		const named = argWhere(part.call, hasRole('color'));
		return named?.present ? colorSettingFace(core.text(named), core.source) : null;
	},
	document: colorDocument
};
