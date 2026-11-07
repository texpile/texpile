import { mandatoryArgs, type LatexPlugin } from '$lib/languages/latex/visual/core';
import { boxFace, TEXT_BOXES } from './boxFace';

export const box: LatexPlugin = {
	commands: [...TEXT_BOXES],
	face(part, core) {
		if (part.kind !== 'command') return undefined;
		const args = mandatoryArgs(part.call);
		const body = args[args.length - 1]?.body;
		// LyX ends the line after a box's brace with a %
		const parts = body
			? core.drawUnits(core.unitsOf(body).filter((u) => !(u.piece.kind === 'node' && u.piece.node.name === 'Comment')))
			: null;
		return parts && boxFace(parts, part.name === 'rotatebox' && args.length > 1 ? core.text(args[0]) : null);
	}
};
