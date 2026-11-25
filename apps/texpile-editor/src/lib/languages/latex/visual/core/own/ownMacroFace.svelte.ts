// a macro the paper defines itself, drawn as what its definition prints (\bert as BERT, \ie as i.e.). The document's own
// definitions win over the rest of the project's, and a definition that changes redraws it in place
import { onDrawnInputs } from '../drawnInputs.svelte';
import { tippedFace, type ChipFace } from '$lib/editor/visual/extensions/drawnChips/chipFace';
import { elementMode, replaceIn } from '$lib/editor/visual/extensions/drawnChips/faces/partElements';
import type { MacroDef } from '$lib/editor/source/extensions/math-preview/userMacros';
import type { Argument } from '$lib/languages/latex/knowledge/types';
import { templateFeaturesStore } from '$lib/stores/editorStore';
import { projectIntelStore } from '$lib/stores/projectIntel';
import { commandExpansions } from '$lib/languages/latex/knowledge/commands/commandExpansions';
import { coreElement } from '../looks/coreLooks';
import { aliasTarget, expandCutShort, expandMacroAlias, expandOwnMacro, readOwnMacroCall } from './ownMacroCall';

let kernel: Record<string, MacroDef> | null = null;

/** whether the document or the rest of the project defines `name` at all, with arguments or without */
export function ownMacroDefined(name: string): boolean {
	return name in (templateFeaturesStore.current.macros ?? {}) || projectIntelStore.current.macros.some((m) => m.name === name);
}

export function ownRegisterDefined(name: string): boolean {
	return !!templateFeaturesStore.current.registers?.includes(name);
}

/** a definition the editor can expand, from the document or the rest of the project */
export function ownMacroDefinition(name: string): MacroDef | null {
	const { macros } = templateFeaturesStore.current;
	if (macros && Object.hasOwn(macros, name)) return macros[name];
	const project = projectIntelStore.current.macros.find((m) => m.name === name && m.definition !== undefined);
	if (project) return { def: project.definition!, args: project.argCount ?? 0, optional: project.optional };
	kernel ??= Object.fromEntries(commandExpansions().map((e) => [e.name, { def: e.body, args: e.params }]));
	return Object.hasOwn(kernel, name) ? kernel[name] : null;
}

const MOST_ALIASES = 8;

function expandingDefinition(own: MacroDef): MacroDef {
	let definition = own;
	for (let i = 0; i < MOST_ALIASES; i++) {
		const target = aliasTarget(definition);
		const next = target === null ? null : ownMacroDefinition(target);
		if (!next) break;
		definition = next;
	}
	return definition;
}

export function ownMacroArguments(name: string): Argument[] | null {
	const own = ownMacroDefinition(name);
	const definition = own && expandingDefinition(own);
	if (!definition?.args) return null;
	return Array.from({ length: definition.args }, (_, i) => ({ kind: i === 0 && definition.optional !== undefined ? 'o' : 'm' }));
}

export function ownMacroBody(name: string, source: string): string | null {
	const own = ownMacroDefinition(name);
	if (!own) return null;
	const definition = expandingDefinition(own);
	const call = readOwnMacroCall(source, definition);
	if (call?.name === name) return expandOwnMacro(definition, call);
	return definition === own ? (expandMacroAlias(own, source) ?? expandCutShort(own, source)) : expandCutShort(definition, source);
}

/** `draw` draws what the call prints; one that cannot be drawn inline shows the call as source */
export function ownMacroFace(name: string, source: string, draw: (latex: string) => ChipFace | null): ChipFace {
	let drawn = null as ChipFace | null;
	// false until the first drawing; null is "no definition"
	let shown: string | null | false = false;
	/** false when the definition is the one already drawn */
	function redraw(): boolean {
		const body = ownMacroBody(name, source);
		if (body === shown) return false;
		shown = body;
		drawn?.destroy?.();
		const next = body === null ? null : draw(body);
		const inline = next && !next.line && !next.mixed;
		if (next && !inline) next.destroy?.();
		drawn = inline ? next : null;
		return true;
	}
	redraw();
	const mode = elementMode(coreElement);
	const dom = mode.make('span', 'drawn-macro');
	function fill(): void {
		replaceIn(dom, drawn ? mode.ofFace(drawn) : mode.make('span', 'drawn-macro-code', source));
	}
	fill();
	const stop = onDrawnInputs(() => redraw() && fill());
	const face = tippedFace(dom, source);
	return {
		...face,
		decorate: (decorations) => drawn?.decorate?.(decorations),
		destroy() {
			stop();
			drawn?.destroy?.();
			face.destroy?.();
		}
	};
}
