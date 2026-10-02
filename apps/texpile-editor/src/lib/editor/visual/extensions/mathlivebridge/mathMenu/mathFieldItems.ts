// the menu's items that act on what a field holds: the clipboard, a matrix's rows and columns,
// the selection's font, and an operator's limits
import { Clipboard, Copy, Plus, Scissors, Trash2 } from '@lucide/svelte';
import { mathfieldContext, type MathfieldElement, type MathfieldLimits } from 'mathlive';
import type { ContextMenuItem } from '$lib/menus/contextMenu.svelte';
import { toaster } from '$lib/modals/toaster-svelte';
import { m } from '$lib/paraglide/messages';

type FieldCommand = Parameters<MathfieldElement['executeCommand']>[0];

function run(field: MathfieldElement, command: string | [string, ...unknown[]]): void {
	field.focus();
	field.executeCommand(command as FieldCommand);
}

function copyAs(field: MathfieldElement, format: 'latex' | 'typst' | 'math-ml'): void {
	const selection = field.selectionIsCollapsed ? undefined : field.selection;
	const text = selection ? field.getValue(selection, format) : field.getValue(format);
	navigator.clipboard.writeText(text).then(
		() => toaster.info({ title: m.ctxmenu_copied_toast(), duration: 3000 }),
		() => toaster.info({ title: m.ctxmenu_copy_failed_toast(), duration: 3000 })
	);
}

export function clipboardItems(field: MathfieldElement, editable: boolean): ContextMenuItem[] {
	const items: ContextMenuItem[] = [];
	if (editable) items.push({ label: m.tbar_ctx_cut(), icon: Scissors, keys: 'Mod+X', onclick: () => run(field, 'cutToClipboard') });
	items.push(
		{ label: m.tbar_ctx_copy(), icon: Copy, keys: 'Mod+C', onclick: () => run(field, 'copyToClipboard') },
		{
			label: m.mathmenu_copy_as(),
			submenu: [
				{ label: m.mathmenu_copy_as_latex(), onclick: () => copyAs(field, 'latex') },
				{ label: m.mathmenu_copy_as_typst(), onclick: () => copyAs(field, 'typst') },
				{ label: m.mathmenu_copy_as_mathml(), onclick: () => copyAs(field, 'math-ml') }
			]
		}
	);
	if (editable) items.push({ label: m.tbar_ctx_paste(), icon: Clipboard, keys: 'Mod+V', onclick: () => run(field, 'pasteFromClipboard') });
	items.push({ label: m.tbar_ctx_select_all(), keys: 'Mod+A', onclick: () => run(field, 'selectAll') });
	return items;
}

// the matrices MathLive sets with delimiters of their own, by what they look like
const MATRICES: [string, () => string][] = [
	['matrix', m.mathpal_matrix_no_delimiters],
	['pmatrix', m.mathpal_matrix_parentheses],
	['bmatrix', m.mathpal_matrix_brackets],
	['Bmatrix', m.mathpal_matrix_braces],
	['vmatrix', m.mathpal_matrix_single_bars],
	['Vmatrix', m.mathpal_matrix_double_bars]
];

export function arrayItems(field: MathfieldElement): ContextMenuItem[] {
	const array = mathfieldContext(field).array;
	if (!array) return [];
	const items: ContextMenuItem[] = [
		{ label: m.ctxmenu_add_row_before(), icon: Plus, onclick: () => run(field, 'addRowBefore') },
		{ label: m.ctxmenu_add_row_after(), icon: Plus, onclick: () => run(field, 'addRowAfter') },
		{ label: m.ctxmenu_add_column_before(), icon: Plus, disabled: !array.canAddColumn, onclick: () => run(field, 'addColumnBefore') },
		{ label: m.ctxmenu_add_column_after(), icon: Plus, disabled: !array.canAddColumn, onclick: () => run(field, 'addColumnAfter') },
		{ label: m.ctxmenu_delete_row(), icon: Trash2, disabled: !array.canRemoveRow, onclick: () => run(field, 'removeRow') },
		{ label: m.ctxmenu_delete_column(), icon: Trash2, disabled: !array.canRemoveColumn, onclick: () => run(field, 'removeColumn') }
	];
	const environment = array.environment.replace(/\*$/, '');
	if (MATRICES.some(([name]) => name === environment))
		items.push({
			label: m.mathtoolbar_matrix_style_label(),
			submenu: MATRICES.map(([name, label]) => ({
				label: label(),
				checked: name === environment,
				onclick: () => run(field, ['setEnvironment', name])
			}))
		});
	return items;
}

// the styles both LaTeX and Typst write: \mathbf is bold(), \mathbb is bb()
const FONTS: [Record<string, string>, () => string][] = [
	[{ variantStyle: 'up' }, m.mathmenu_font_upright],
	[{ variantStyle: 'bold' }, m.mathmenu_font_bold],
	[{ variantStyle: 'italic' }, m.mathmenu_font_italic],
	[{ variant: 'sans-serif' }, m.mathmenu_font_sans_serif],
	[{ variant: 'monospace' }, m.mathmenu_font_monospace],
	[{ variant: 'calligraphic' }, m.mathmenu_font_calligraphic],
	[{ variant: 'fraktur' }, m.mathmenu_font_fraktur],
	[{ variant: 'double-struck' }, m.mathmenu_font_blackboard]
];

const LIMITS: [MathfieldLimits, () => string][] = [
	['default', m.mathmenu_limits_default],
	['over-under', m.mathmenu_limits_over_under],
	['adjacent', m.mathmenu_limits_adjacent]
];

export function styleItems(field: MathfieldElement): ContextMenuItem[] {
	const items: ContextMenuItem[] = [];
	if (!field.selectionIsCollapsed)
		items.push({
			label: m.mathmenu_font_style(),
			submenu: FONTS.map(([style, label]) => ({
				label: label(),
				checked: field.queryStyle(style) === 'all',
				onclick: () => {
					field.applyStyle(style, { operation: 'toggle' });
					field.focus();
				}
			}))
		});
	const limits = mathfieldContext(field).limits;
	if (limits)
		items.push({
			label: m.mathmenu_limits(),
			submenu: LIMITS.map(([placement, label]) => ({
				label: label(),
				checked: placement === limits,
				onclick: () => run(field, ['setLimits', placement])
			}))
		});
	return items;
}
