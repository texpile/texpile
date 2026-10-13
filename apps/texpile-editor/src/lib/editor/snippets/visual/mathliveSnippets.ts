// equation snippets: auto ones as MathLive shortcuts, the rest in the math search
import type { InlineShortcutDefinitions, MathfieldElement, TypstShortcut } from 'mathlive';
import type { MathStructure } from '$lib/editor/visual/extensions/mathlivebridge/mathSearch/mathStructures';
import type { MathSyntax } from '$lib/editor/visual/extensions/mathlivebridge/mathFieldFactory';
import { toMathLiveLatex, toTypstSlots } from '../expand/body/mathliveBody';
import type { CompiledSnippet } from '../expand/matchSnippets';
import { contextAllows } from '../expand/snippetZone';
import { onSnippetRegistry, snippetRegistry } from '../file/snippetRegistry';

// a Typst equation reads a trigger as a name, so letters only
const TYPST_NAME = /^[a-zA-Z]+$/;

function inEquation(c: CompiledSnippet, display: boolean): boolean {
	return !c.patterns && contextAllows(c.snippet.context, { zone: 'math', display });
}

function insertedIn(syntax: MathSyntax, c: CompiledSnippet): string {
	return syntax === 'typst' ? toTypstSlots(c.body) : toMathLiveLatex(c.body);
}

export function mathLiveShortcuts(display: boolean): Record<string, string> {
	const shortcuts: Record<string, string> = {};
	for (const c of snippetRegistry().languages.latex.auto.filter((c) => inEquation(c, display)))
		for (const prefix of c.snippet.prefixes) shortcuts[prefix] ??= insertedIn('latex', c);
	return shortcuts;
}

export function typstShortcuts(display: boolean): Record<string, TypstShortcut> {
	const shortcuts: Record<string, TypstShortcut> = {};
	for (const c of snippetRegistry().languages.typst.auto.filter((c) => inEquation(c, display)))
		for (const prefix of c.snippet.prefixes.filter((p) => TYPST_NAME.test(p)))
			shortcuts[prefix] ??= { value: insertedIn('typst', c), format: 'typst' };
	return shortcuts;
}

/** math search rows for the snippets an equation can take */
export function snippetStructures(syntax: MathSyntax, display: boolean): MathStructure[] {
	const { auto, popup } = snippetRegistry().languages[syntax];
	// the built-in @ shorthands are the search's own symbols and structures again
	return [...auto, ...popup]
		.filter((c) => c.snippet.layer !== 'builtin' && inEquation(c, display))
		.map((c) => {
			const latex = insertedIn(syntax, c);
			const { name, prefixes, description } = c.snippet;
			const trigger = prefixes[0] ?? name;
			const words = `${prefixes.join(' ')} ${name} ${description}`.toLowerCase().split(/[^\p{L}\p{N}]+/u);
			return {
				latex,
				format: syntax,
				source: c.body,
				// the name beside the trigger, as the source editor's popup has it
				label: `${trigger}  ${name === trigger ? description || name : name}`,
				// a typst slot is drawn as the empty string it is saved as
				display: syntax === 'typst' ? latex.split('#?').join('""') : latex,
				words: words.filter(Boolean)
			};
		});
}

export type SnippetShortcutTarget = { display: boolean } & (
	| { syntax: 'latex'; defaults: InlineShortcutDefinitions; set: (shortcuts: InlineShortcutDefinitions) => void }
	| { syntax: 'typst'; set: (shortcuts: Record<string, TypstShortcut>) => void }
);

export function followSnippetShortcuts(target: SnippetShortcutTarget): () => void {
	function apply() {
		if (target.syntax === 'typst') target.set(typstShortcuts(target.display));
		else target.set({ ...target.defaults, ...mathLiveShortcuts(target.display) });
	}
	apply();
	return onSnippetRegistry(apply);
}

/** MathLive's own Tab leaves the equation when no #? slot follows */
export function placeholderAhead(field: MathfieldElement): boolean {
	const end = Math.max(...field.selection.ranges.flat());
	return field.getValue(end, field.lastOffset, 'latex').includes('\\placeholder');
}
