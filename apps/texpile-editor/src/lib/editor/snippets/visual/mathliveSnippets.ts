// snippets in the visual editor's LaTeX equations: auto ones as MathLive inline shortcuts, the
// rest in the math search, each stop a #? slot that Tab moves to
import type { InlineShortcutDefinitions, MathfieldElement } from 'mathlive';
import { settings } from '$lib/settings';
import { observe } from '$lib/runes/observe.svelte';
import type { MathStructure } from '$lib/editor/visual/extensions/mathlivebridge/mathSearch/mathStructures';
import { toMathLiveLatex } from '../expand/bodyTemplate';
import type { CompiledSnippet } from '../expand/matchSnippets';
import { onSnippetRegistry, snippetRegistry } from '../file/snippetRegistry';

const MATH_CONTEXTS = new Set(['math', 'inline-math', 'display-math', 'any']);

function inEquations(c: CompiledSnippet): boolean {
	return !c.patterns && !c.snippet.wrap && MATH_CONTEXTS.has(c.snippet.context);
}

/** trigger -> what it inserts, for the snippets that expand on their own */
export function mathLiveShortcuts(): Record<string, string> {
	const shortcuts: Record<string, string> = {};
	for (const c of snippetRegistry().languages.latex.auto.filter(inEquations))
		for (const prefix of c.snippet.prefixes) shortcuts[prefix] ??= toMathLiveLatex(c.body);
	return shortcuts;
}

/** every snippet an equation can take, as math search rows found by trigger or name */
export function snippetStructures(): MathStructure[] {
	const { auto, popup } = snippetRegistry().languages.latex;
	return [...auto, ...popup].filter(inEquations).map((c) => {
		const latex = toMathLiveLatex(c.body);
		const words = `${c.snippet.prefixes.join(' ')} ${c.snippet.name} ${c.snippet.description}`.toLowerCase().split(/[^\p{L}\p{N}]+/u);
		return {
			latex,
			label: `${c.snippet.prefixes[0] ?? c.snippet.name}  ${c.snippet.description || c.snippet.name}`,
			display: latex,
			words: words.filter(Boolean)
		};
	});
}

/** a LaTeX field's inline shortcuts, its own plus the snippets', kept in step with both and the switch; returns the unsubscribe */
export function followSnippetShortcuts(
	defaults: InlineShortcutDefinitions,
	set: (shortcuts: InlineShortcutDefinitions) => void
): () => void {
	function apply() {
		set(settings.current.autoSnippets === false ? defaults : { ...defaults, ...mathLiveShortcuts() });
	}
	const offRegistry = onSnippetRegistry(apply);
	// fires now too, which is the first apply
	const offSetting = observe(() => settings.current.autoSnippets, apply);
	return () => {
		offRegistry();
		offSetting();
	};
}

/** whether a #? slot lies after the caret: MathLive's own move leaves the equation when none does */
export function placeholderAhead(field: MathfieldElement): boolean {
	const end = Math.max(...field.selection.ranges.flat());
	return field.getValue(end, field.lastOffset, 'latex').includes('\\placeholder');
}
