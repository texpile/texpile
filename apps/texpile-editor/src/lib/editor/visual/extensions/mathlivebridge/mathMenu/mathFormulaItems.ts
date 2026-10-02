// the menu's items that act on the equation as a node of the document: inline or displayed, how a
// display is set and numbered, and how other text refers to it
import { Link, Settings } from '@lucide/svelte';
import { Fragment, Slice } from 'prosemirror-model';
import type { EditorView } from 'prosemirror-view';
import type { ContextMenuItem } from '$lib/menus/contextMenu.svelte';
import { toaster } from '$lib/modals/toaster-svelte';
import { m } from '$lib/paraglide/messages';
import { templateFeaturesStore } from '$lib/stores/editorStore';
import { equationNumberingChange, equationsNumbered } from '$lib/languages/typst/visual/equationNumbering';
import type { MathSyntax } from '../mathFieldFactory';
import {
	canMakeDisplay,
	displayKind,
	inlineBlocker,
	makeDisplay,
	makeInline,
	setDisplayKind,
	setDisplayNumbered,
	type DisplayKind
} from './mathFormulaType';

/** the equation a menu opened on, and what it can do to it */
export type MathMenuEquation = {
	view: EditorView;
	pos: number;
	syntax: MathSyntax;
	editable: boolean;
	openSettings: () => void;
};

const KINDS: [DisplayKind, () => string][] = [
	['equation', m.mathmenu_type_equation],
	['align', m.mathmenu_type_align],
	['gather', m.mathmenu_type_gather],
	['multline', m.mathmenu_type_multline]
];

function dispatch(view: EditorView, tr: ReturnType<typeof makeDisplay>): void {
	if (tr) view.dispatch(tr);
}

/** a reference to the equation, as the editor pastes it back and other programs read it */
function copyReference(view: EditorView, label: string, syntax: MathSyntax): void {
	const { schema } = view.state;
	const ref =
		syntax === 'typst'
			? schema.nodes.typ_ref.create({ target: label })
			: schema.nodes.ref.create(
					{ refType: 'equation', command: templateFeaturesStore.current.refCommands?.includes('eqref') ? 'eqref' : 'ref' },
					schema.text(label)
				);
	const { dom, text } = view.serializeForClipboard(new Slice(Fragment.from(ref), 0, 0));
	navigator.clipboard
		.write([
			new ClipboardItem({
				'text/html': new Blob([dom.innerHTML], { type: 'text/html' }),
				'text/plain': new Blob([text], { type: 'text/plain' })
			})
		])
		.then(
			() => toaster.info({ title: m.ctxmenu_copied_toast(), duration: 3000 }),
			() => toaster.info({ title: m.ctxmenu_copy_failed_toast(), duration: 3000 })
		);
}

function inlineItems({ view, pos }: MathMenuEquation): ContextMenuItem[] {
	const possible = canMakeDisplay(view.state, pos);
	return [
		{
			label: m.mathmenu_to_display(),
			disabled: !possible,
			tip: possible ? undefined : m.mathmenu_to_display_blocked(),
			onclick: () => dispatch(view, makeDisplay(view.state, pos))
		}
	];
}

function referenceItems(view: EditorView, label: string | null, syntax: MathSyntax): ContextMenuItem[] {
	return label ? [{ label: m.mathmenu_copy_reference(), icon: Link, onclick: () => copyReference(view, label, syntax) }] : [];
}

function displayItems(equation: MathMenuEquation): ContextMenuItem[] {
	const { view, pos, syntax, editable, openSettings } = equation;
	const display = view.state.doc.nodeAt(pos)!;
	const references = referenceItems(view, display.attrs.label as string | null, syntax);
	if (!editable) return references;
	const blocker = inlineBlocker(view.state, pos);
	const items: ContextMenuItem[] = [
		{
			label: m.mathmenu_to_inline(),
			disabled: blocker !== null,
			tip: blocker === 'lines' ? m.mathmenu_to_inline_lines() : blocker === 'referenced' ? m.mathmenu_to_inline_referenced() : undefined,
			onclick: () => dispatch(view, makeInline(view.state, pos))
		}
	];
	// markdown's $$ saves none of what the rest sets
	if (display.type.spec.plainDisplay === true) return items;
	if (syntax === 'latex') {
		const current = displayKind(display);
		items.push(
			{
				label: m.mathmenu_formula_type(),
				submenu: KINDS.map(([kind, label]) => ({
					label: label(),
					checked: kind === current,
					onclick: () => dispatch(view, setDisplayKind(view.state, pos, kind))
				}))
			},
			{
				label: m.mathsettings_numbered_label(),
				checked: display.attrs.numbered === true,
				onclick: () => dispatch(view, setDisplayNumbered(view.state, pos, display.attrs.numbered !== true))
			}
		);
	} else {
		const numbered = equationsNumbered(view.state.doc);
		items.push({
			label: m.mathsettings_typst_numbered_label(),
			checked: numbered,
			onclick: () => dispatch(view, equationNumberingChange(view.state, !numbered))
		});
	}
	items.push(...references, { label: m.mathmenu_settings(), icon: Settings, onclick: openSettings });
	return items;
}

export function formulaItems(equation: MathMenuEquation): ContextMenuItem[] {
	const node = equation.view.state.doc.nodeAt(equation.pos);
	if (node?.type.name === 'inline_math') return equation.editable ? inlineItems(equation) : [];
	if (node?.type.name === 'block_math') return displayItems(equation);
	return [];
}
