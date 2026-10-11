// equation snippets: auto ones as MathLive shortcuts, the rest in the math search
import type { InlineShortcutDefinitions, MathfieldElement, TypstShortcut } from 'mathlive';
import type { MathStructure } from '$lib/editor/visual/extensions/mathlivebridge/mathSearch/mathStructures';
import type { MathSyntax } from '$lib/editor/visual/extensions/mathlivebridge/mathFieldFactory';
import { toMathLiveLatex, toPlainText } from '../expand/bodyTemplate';
import type { CompiledSnippet } from '../expand/matchSnippets';
import { onSnippetRegistry, snippetRegistry } from '../file/snippetRegistry';

const MATH_CONTEXTS = new Set(['math', 'inline-math', 'display-math', 'any']);
// a Typst equation reads a trigger as a name, so letters only
const TYPST_NAME = /^[a-zA-Z]+$/;

function inEquations(c: CompiledSnippet): boolean {
	return !c.patterns && !c.snippet.wrap && MATH_CONTEXTS.has(c.snippet.context);
}

// typst source has no #? slot, so stops become their defaults
function insertedIn(syntax: MathSyntax, c: CompiledSnippet): string {
	return syntax === 'typst' ? toPlainText(c.body) : toMathLiveLatex(c.body);
}

export function mathLiveShortcuts(): Record<string, string> {
	const shortcuts: Record<string, string> = {};
	for (const c of snippetRegistry().languages.latex.auto.filter(inEquations))
		for (const prefix of c.snippet.prefixes) shortcuts[prefix] ??= insertedIn('latex', c);
	return shortcuts;
}

export function typstShortcuts(): Record<string, TypstShortcut> {
	const shortcuts: Record<string, TypstShortcut> = {};
	for (const c of snippetRegistry().languages.typst.auto.filter(inEquations))
		for (const prefix of c.snippet.prefixes.filter((p) => TYPST_NAME.test(p)))
			shortcuts[prefix] ??= { value: insertedIn('typst', c), format: 'typst' };
	return shortcuts;
}

/** math search rows for the snippets an equation can take */
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

export function followSnippetShortcuts(target: SnippetShortcutTarget): () => void {
	function apply() {
		if (target.syntax === 'typst') target.set(typstShortcuts());
		else target.set({ ...target.defaults, ...mathLiveShortcuts() });
	}
	apply();
	return onSnippetRegistry(apply);
}

/** MathLive's own Tab leaves the equation when no #? slot follows */
export function placeholderAhead(field: MathfieldElement): boolean {
	const end = Math.max(...field.selection.ranges.flat());
	return field.getValue(end, field.lastOffset, 'latex').includes('\\placeholder');
}
