import { templateFeaturesStore } from '$lib/stores/editorStore';
import { faceElement, tippedFace, type ChipFace } from '$lib/editor/visual/extensions/drawnChips/chipFace';
import { ownMacroDefinition } from './ownMacroFace.svelte';
import { environmentMath, mathFace } from '../parts/mathPart';

const RUN = /^\s*\\([a-zA-Z@]+)([\s\S]*)\\([a-zA-Z@]+)\s*$/;

function openedEnvironment(name: string, side: 'begin' | 'end'): string | null {
	const definition = ownMacroDefinition(name);
	if (!definition || definition.args) return null;
	return new RegExp(`^\\s*\\\\${side}\\s*\\{([^{}]+)\\}\\s*$`).exec(definition.def)?.[1] ?? null;
}

export function ownMathRun(source: string): ChipFace | null {
	const m = RUN.exec(source);
	const env = m && openedEnvironment(m[1], 'begin');
	if (!m || !env || openedEnvironment(m[3], 'end') !== env) return null;
	return mathFace(environmentMath(env, m[2]));
}

export function theoremCommandFace(name: string, source: string): ChipFace | null {
	const heads = templateFeaturesStore.current.environmentHeads;
	const head = heads && Object.hasOwn(heads, name) ? heads[name] : null;
	if (!head) return null;
	const dom = faceElement('span', 'env-head');
	dom.dataset.look = 'theorem';
	dom.dataset.style = head.style;
	dom.appendChild(faceElement('span', 'env-head-name', head.text));
	dom.appendChild(document.createTextNode('.'));
	return tippedFace(dom, source);
}

export function isTheoremCommand(name: string): boolean {
	const heads = templateFeaturesStore.current.environmentHeads;
	return !!heads && Object.hasOwn(heads, name);
}
