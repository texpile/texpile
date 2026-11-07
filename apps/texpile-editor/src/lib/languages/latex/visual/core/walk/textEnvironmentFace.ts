// an environment of a class or of the paper whose body is running text, as that text under the environment's name
import { tip } from '$lib/components/tooltip.svelte';
import { faceElement, faceOfParts, type ChipFace } from '$lib/editor/visual/extensions/drawnChips/chipFace';
import { documentTable } from '../title/documentTable.svelte';
import './textEnvironment.css';

const HINT_LENGTH = 400;

/** an environment the loaded files give no arguments and no structure: its body is text */
export function holdsRunningText(name: string): boolean {
	const { envs, bodies } = documentTable.current;
	const facts = Object.hasOwn(bodies, name) ? bodies[name] : undefined;
	return !(Object.hasOwn(envs, name) && envs[name].length) && !(facts?.body || facts?.cells || facts?.rows || facts?.item || facts?.in);
}

export function textEnvironmentFace(name: string, parts: ChipFace[], source: string): ChipFace {
	const dom = faceElement('div', 'drawn-environment');
	dom.appendChild(faceElement('span', 'drawn-environment-name', name));
	const body = faceOfParts(parts, false);
	dom.appendChild(body.dom);
	const hint = source.replace(/\s+/g, ' ').trim();
	const tipped = tip(dom, hint.length > HINT_LENGTH ? hint.slice(0, HINT_LENGTH) + '…' : hint);
	return {
		dom,
		line: true,
		decorate: (decorations) => body.decorate?.(decorations),
		destroy() {
			body.destroy?.();
			tipped.destroy();
		}
	};
}
