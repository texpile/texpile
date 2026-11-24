// what a formula holds and the keys Texpile takes ahead of MathLive in every formula session
import type { HeadlessMathfield } from 'mathlive';
import type { Node } from 'prosemirror-model';

/** what a math node holds: LaTeX in a .tex or .md file, Typst in a .typ one */
export type MathSyntax = 'latex' | 'typst';

/** a math node's syntax, which its schema states on the node type */
export function mathSyntaxOf(node: Node): MathSyntax {
	return node.type.spec.mathSyntax === 'typst' ? 'typst' : 'latex';
}

/** the format a field reads and writes its node's content in */
export function mathFormat(syntax: MathSyntax): 'latex-expanded' | 'typst' {
	return syntax === 'typst' ? 'typst' : 'latex-expanded';
}

/** the members the key hotfixes use */
export type HotfixField = Pick<HeadlessMathfield, 'mode' | 'syntax' | 'executeCommand' | 'position' | 'getValue' | 'insert'> & {
	selection: HeadlessMathfield['selection'];
};

function plainKey(event: KeyboardEvent): boolean {
	return !event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey;
}

// hotfix for https://github.com/arnog/mathlive/issues/3084: the command completed, the caret in its first argument
export function completeWithPlaceholder(field: HotfixField, event: KeyboardEvent): boolean {
	if (field.mode !== 'latex' || field.syntax === 'typst' || (event.key !== ' ' && event.key !== 'Enter') || !plainKey(event)) return false;
	field.executeCommand(['complete', 'accept-all'] as never);
	const at = field.position;
	const latex = field.getValue(at - 1, at);
	if (!/^\\(?!placeholder\b|operatorname\b)[a-zA-Z]+(\{\})+$/.test(latex)) return true;
	// one offset per empty argument; walking back while getValue matches strays into a box before it (y^2\hat)
	const emptyArgs = latex.split('{}').length - 1;
	// eslint-disable-next-line no-param-reassign -- the field is the one being edited
	field.selection = { ranges: [[at - 1 - emptyArgs, at]] };
	field.insert(latex.replace(/\{\}/g, '{#?}'), { selectionMode: 'placeholder' });
	return true;
}

// `"` goes in and out of text, \text{...}, on any keyboard: mathlive binds it only on English layouts
export function quoteSwitchesText(field: HotfixField, event: KeyboardEvent): boolean {
	if (field.syntax === 'typst' || event.key !== '"' || event.altKey || event.ctrlKey || event.metaKey) return false;
	if (field.mode !== 'math' && field.mode !== 'text') return false;
	field.executeCommand(['switchMode', field.mode === 'math' ? 'text' : 'math']);
	return true;
}
