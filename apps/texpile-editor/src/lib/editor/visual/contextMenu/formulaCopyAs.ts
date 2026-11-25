// Copy As for a selected formula, the submenu an entered formula's own menu has
import { convertLatexToMathMl, convertLatexToTypst, convertTypstToLatex } from 'mathlive';
import { NodeSelection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import type { ContextMenuItem } from '$lib/menus/contextMenu.svelte';
import { schemaMathSyntax } from '$lib/editor/paste/pastedMath';
import { toaster } from '$lib/modals/toaster-svelte';
import { m } from '$lib/paraglide/messages';

const FORMULAS = new Set(['inline_math', 'block_math']);

function copyText(text: () => string): void {
	navigator.clipboard.writeText(text()).then(
		() => toaster.info({ title: m.ctxmenu_copied_toast(), duration: 3000 }),
		() => toaster.info({ title: m.ctxmenu_copy_failed_toast(), duration: 3000 })
	);
}

function latexOf(source: string, typst: boolean): string {
	return typst ? convertTypstToLatex(source) : source;
}

export function formulaCopyAsItem(view: EditorView): ContextMenuItem | null {
	const { selection } = view.state;
	if (!(selection instanceof NodeSelection) || !FORMULAS.has(selection.node.type.name)) return null;
	const source = selection.node.textContent;
	const typst = schemaMathSyntax(view.state.schema) === 'typst';
	return {
		label: m.mathmenu_copy_as(),
		submenu: [
			{ label: m.mathmenu_copy_as_latex(), onclick: () => copyText(() => latexOf(source, typst)) },
			{ label: m.mathmenu_copy_as_typst(), onclick: () => copyText(() => (typst ? source : convertLatexToTypst(source))) },
			{ label: m.mathmenu_copy_as_mathml(), onclick: () => copyText(() => convertLatexToMathMl(latexOf(source, typst))) }
		]
	};
}
