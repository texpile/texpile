import { faceOfParts, tippedFace, type ChipFace } from '$lib/editor/visual/extensions/drawnChips/chipFace';
import { appendTo, elementMode } from '$lib/editor/visual/extensions/drawnChips/faces/partElements';
import { coreElement } from '../looks/coreLooks';
import { documentTable } from '../title/documentTable.svelte';

const HINT_LENGTH = 400;

export function holdsRunningText(name: string): boolean {
	const { envs, bodies } = documentTable.current;
	const facts = Object.hasOwn(bodies, name) ? bodies[name] : undefined;
	return !(Object.hasOwn(envs, name) && envs[name].length) && !(facts?.body || facts?.cells || facts?.rows || facts?.item || facts?.in);
}

export function textEnvironmentFace(name: string, parts: ChipFace[], source: string): ChipFace {
	const body = faceOfParts(parts, false);
	const mode = elementMode(coreElement);
	const dom = appendTo(mode.make('div', 'drawn-environment'), mode.make('span', 'drawn-environment-name', name), mode.ofFace(body));
	const hint = source.replace(/\s+/g, ' ').trim();
	const face = tippedFace(dom, hint.length > HINT_LENGTH ? hint.slice(0, HINT_LENGTH) + '…' : hint, { line: true });
	return {
		...face,
		decorate: (decorations) => body.decorate?.(decorations),
		destroy() {
			body.destroy?.();
			face.destroy?.();
		}
	};
}
