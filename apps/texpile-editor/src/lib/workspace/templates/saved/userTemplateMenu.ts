import { Pencil, Trash2 } from '@lucide/svelte';
import type { ContextMenuItem } from '$lib/menus/contextMenu.svelte';
import { confirmAsk } from '$lib/modals/confirm.svelte';
import { toaster } from '$lib/modals/toaster-svelte';
import { m } from '$lib/paraglide/messages';
import { bridgeErrorText } from '../templateBridge';
import { templateDetails } from './templateDetails.svelte';
import { deleteUserTemplate } from './userTemplateList';
import type { UserTemplate } from '../templateBridge.types';

async function confirmDelete(template: UserTemplate): Promise<void> {
	const sure = await confirmAsk(m.starter_template_delete_confirm({ name: template.name }), {
		confirmLabel: m.starter_template_delete(),
		cancelLabel: m.menubar_prompt_cancel(),
		danger: true
	});
	if (!sure) return;
	try {
		await deleteUserTemplate(template.id);
	} catch (e) {
		toaster.error({ title: m.starter_template_change_failed(), description: bridgeErrorText(e) });
	}
}

/** Rename and Delete, for a saved template's card in the starter picker */
export function userTemplateMenu(template: UserTemplate): ContextMenuItem[] {
	return [
		{ label: m.starter_template_rename(), icon: Pencil, onclick: () => templateDetails.showEdit(template) },
		{ label: m.starter_template_delete(), icon: Trash2, danger: true, onclick: () => void confirmDelete(template) }
	];
}
