// snippets in the visual editor's equations: auto ones as MathLive shortcuts, the rest in the math
// search. a LaTeX equation takes each stop as a #? slot Tab moves to; a Typst one takes the Typst
// body with its defaults, Typst source having no slot of its own
import type { InlineShortcutDefinitions, MathfieldElement, TypstShortcut } from 'mathlive';
import { settings } from '$lib/settings';
import { observe } from '$lib/runes/observe.svelte';
import type { MathStructure } from '$lib/editor/visual/extensions/mathlivebridge/mathSearch/mathStructures';
import type { MathSyntax } from '$lib/editor/visual/extensions/mathlivebridge/mathFieldFactory';
import { toMathLiveLatex, toPlainText } from '../expand/bodyTemplate';
import type { CompiledSnippet } from '../expand/matchSnippets';
import { onSnippetRegistry, snippetRegistry } from '../file/snippetRegistry';

const MATH_CONTEXTS = new Set(['math', 'inline-math', 'display-math', 'any']);
// a Typst equation reads a trigger as it reads any name: letters
const TYPST_NAME = /^[a-zA-Z]+$/;

function inEquations(c: CompiledSnippet): boolean {
	return !c.patterns && !c.snippet.wrap && MATH_CONTEXTS.has(c.snippet.context);
}

function insertedIn(syntax: MathSyntax, c: CompiledSnippet): string {
	return syntax === 'typst' ? toPlainText(c.body) : toMathLiveLatex(c.body);
}

/** trigger -> what it inserts in a LaTeX equation, for the snippets that expand on their own */
export function mathLiveShortcuts(): Record<string, string> {
	const shortcuts: Record<string, string> = {};
	for (const c of snippetRegistry().languages.latex.auto.filter(inEquations))
		for (const prefix of c.snippet.prefixes) shortcuts[prefix] ??= insertedIn('latex', c);
	return shortcuts;
}

/** the same for a Typst equation */
export function typstShortcuts(): Record<string, TypstShortcut> {
	const shortcuts: Record<string, TypstShortcut> = {};
	for (const c of snippetRegistry().languages.typst.auto.filter(inEquations))
		for (const prefix of c.snippet.prefixes.filter((p) => TYPST_NAME.test(p)))
			shortcuts[prefix] ??= { value: insertedIn('typst', c), format: 'typst' };
	return shortcuts;
}

/** every snippet an equation can take, as math search rows found by trigger or name */
export function snippetStructures(syntax: MathSyntax): MathStructure[] {
	const { auto, popup } = snippetRegistry().languages[syntax];
	return [...auto, ...popup].filter(inEquations).map((c) => {
		const latex = insertedIn(syntax, c);
		const words = `${c.snippet.prefixes.join(' ')} ${c.snippet.name} ${c.snippet.description}`.toLowerCase().split(/[^\p{L}\p{N}]+/u);
		return {
			latex,
			format: syntax,
			label: `${c.snippet.prefixes[0] ?? c.snippet.name}  ${c.snippet.description || c.snippet.name}`,
			display: latex,
			words: words.filter(Boolean)
		};
	});
}

export type SnippetShortcutTarget =
	| { syntax: 'latex'; defaults: InlineShortcutDefinitions; set: (shortcuts: InlineShortcutDefinitions) => void }
	| { syntax: 'typst'; set: (shortcuts: Record<string, TypstShortcut>) => void };

/** a field's snippet shortcuts, kept in step with the snippets and the switch; returns the unsubscribe */
export function followSnippetShortcuts(target: SnippetShortcutTarget): () => void {
	function apply() {
		const on = settings.current.autoSnippets !== false;
		if (target.syntax === 'typst') target.set(on ? typstShortcuts() : {});
		else target.set(on ? { ...target.defaults, ...mathLiveShortcuts() } : target.defaults);
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
