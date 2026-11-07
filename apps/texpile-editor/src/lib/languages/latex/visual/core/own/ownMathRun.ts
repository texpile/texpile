// what a paper writes as shorthand for an environment, drawn as the environment prints, with no macro expanded: \EQ ...
// \EN for a \newcommand{\EQ}{\begin{equation}}, and \lemma for the theorem \newtheorem{lemma}{Lemma} defines
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

/** \EQ ... \EN, both the paper's own, opening and closing one display math environment */
export function ownMathRun(source: string): ChipFace | null {
	const m = RUN.exec(source);
	const env = m && openedEnvironment(m[1], 'begin');
	if (!m || !env || openedEnvironment(m[3], 'end') !== env) return null;
	return mathFace(environmentMath(env, m[2]));
}

/** the head a theorem's own command prints where the paper writes {\lemma ...} for its environment */
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
