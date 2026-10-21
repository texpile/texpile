// a macro the paper defines itself, drawn as what its definition prints (\bert as BERT, \ie as i.e.). The document's own
// definitions win over the rest of the project's, and a definition that changes redraws it in place
import { tip } from '$lib/components/tooltip.svelte';
import { onDrawnInputs } from '../drawnInputs.svelte';
import type { ChipFace } from '$lib/editor/visual/extensions/drawnChips/chipFace';
import { renderStaticInlineCode } from '$lib/editor/visual/extensions/codemirrorbridge/cmStatic';
import type { MacroDef } from '$lib/editor/source/extensions/math-preview/userMacros';
import { templateFeaturesStore } from '$lib/stores/editorStore';
import { projectIntelStore } from '$lib/stores/projectIntel';
import { expandOwnMacro, readOwnMacroCall } from './ownMacroCall';

/** whether the document or the rest of the project defines `name` at all, with arguments or without */
export function ownMacroDefined(name: string): boolean {
	return name in (templateFeaturesStore.current.macros ?? {}) || projectIntelStore.current.macros.some((m) => m.name === name);
}

/** a definition the editor can expand, from the document or the rest of the project */
export function ownMacroDefinition(name: string): MacroDef | null {
	const own = templateFeaturesStore.current.macros?.[name];
	if (own) return own;
	const project = projectIntelStore.current.macros.find((m) => m.name === name && m.definition !== undefined);
	return project ? { def: project.definition!, args: project.argCount ?? 0, optional: project.optional } : null;
}

export function ownMacroBody(name: string, source: string): string | null {
	const definition = ownMacroDefinition(name);
	const call = definition && readOwnMacroCall(source, definition);
	return definition && call?.name === name ? expandOwnMacro(definition, call) : null;
}

/** `draw` draws what the call prints; one that cannot be drawn inline shows the call as source */
export function ownMacroFace(name: string, source: string, draw: (latex: string) => ChipFace | null): ChipFace {
	const dom = document.createElement('span');
	dom.className = 'drawn-macro';
	const tipped = tip(dom, source);
	let drawn: ChipFace | null = null;
	// false until the first drawing; null is "no definition"
	let shown: string | null | false = false;
	// drawn now, so the line breaker measures it, and again whenever the definition changes
	function show(): void {
		const body = ownMacroBody(name, source);
		if (body === shown) return;
		shown = body;
		drawn?.destroy?.();
		drawn = body === null ? null : draw(body);
		if (drawn?.line) {
			drawn.destroy?.();
			drawn = null;
		}
		dom.replaceChildren(drawn ? drawn.dom : renderStaticInlineCode(source));
	}
	show();
	const stop = onDrawnInputs(show);
	return {
		dom,
		decorate: (decorations) => drawn?.decorate?.(decorations),
		destroy() {
			stop();
			drawn?.destroy?.();
			tipped.destroy();
		}
	};
}
