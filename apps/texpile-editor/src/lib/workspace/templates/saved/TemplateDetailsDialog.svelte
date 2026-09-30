<script lang="ts">
	// Save as template, and Rename on a saved one: a name, an optional description, and for a save
	// what it will copy, or the Git remote it will clone. Single-line fields both, so Enter saves from either.
	import { LayoutTemplate, Loader2 } from '@lucide/svelte';
	import Modal from '$lib/modals/Modal.svelte';
	import ModalActions from '$lib/modals/ModalActions.svelte';
	import { templateDetails } from './templateDetails.svelte';
	import { templateSizeText } from './templateSelection';
	import { remoteLabel } from './remoteTemplate';
	import TemplateSourceChoice from './TemplateSourceChoice.svelte';
	import { m } from '$lib/paraglide/messages';

	const saving = $derived(templateDetails.mode?.kind === 'save');
	const selection = $derived(templateDetails.selection);

	let field = $state<HTMLInputElement>();
	$effect(() => {
		if (templateDetails.open) queueMicrotask(() => field?.select());
	});
</script>

{#if templateDetails.open}
	<Modal
		title={saving ? m.template_save_title() : m.template_edit_title()}
		icon={LayoutTemplate}
		onClose={() => templateDetails.hide()}
		onEnter={() => void templateDetails.submit()}
	>
		<label class="block text-sm">
			<span class="mb-1 block font-medium">{m.template_name_label()}</span>
			<input
				bind:this={field}
				bind:value={templateDetails.name}
				class="input w-full"
				maxlength="120"
				oninput={() => (templateDetails.problem = '')}
			/>
		</label>
		<label class="mt-3 block text-sm">
			<span class="mb-1 block font-medium">{m.template_description_label()}</span>
			<input bind:value={templateDetails.description} class="input w-full" maxlength="500" />
		</label>

		{#if saving}
			{#if templateDetails.remote}
				<TemplateSourceChoice />
			{/if}
			<div class="text-muted mt-3 text-xs" aria-live="polite">
				{#if templateDetails.source === 'remote' && templateDetails.remote}
					<p>{m.template_save_remote_summary({ address: remoteLabel(templateDetails.remote) })}</p>
				{:else if templateDetails.tooMany}
					<p class="text-error-ink">{m.template_too_many({ count: templateDetails.tooMany })}</p>
				{:else if selection}
					<p>
						{selection.files.length === 1
							? m.template_save_summary_one({ size: templateSizeText(selection.bytes) })
							: m.template_save_summary_other({ count: selection.files.length, size: templateSizeText(selection.bytes) })}
						{m.template_save_leaves_out()}
					</p>
				{:else if templateDetails.surveyFailed}
					<p class="text-error-ink">{templateDetails.surveyFailed}</p>
				{:else}
					<p class="flex items-center gap-1.5">
						<Loader2 class="size-3.5 animate-spin" /><span class="cap-center">{m.template_save_reading()}</span>
					</p>
				{/if}
			</div>
		{/if}
		{#if templateDetails.problem}
			<p class="text-error-ink mt-2 text-xs">{templateDetails.problem}</p>
		{/if}

		<ModalActions
			class="mt-4"
			buttons={[
				{ label: m.menubar_prompt_cancel(), role: 'cancel', onclick: () => templateDetails.hide() },
				{
					label: saving ? m.template_save_button() : m.template_edit_button(),
					role: 'primary',
					disabled: !templateDetails.canSubmit,
					busy: templateDetails.busy,
					onclick: () => void templateDetails.submit()
				}
			]}
		/>
	</Modal>
{/if}
