<script lang="ts">
	// VS Code's Git: Clone as one dialog: the address as it was copied (a repository page, the
	// `git clone` line from a README, the SSH form), the folder it becomes, and where that goes. The
	// clone runs while the dialog is up, with its progress, so a wrong address or a taken folder is
	// fixed in place.
	import { onMount } from 'svelte';
	import { FolderGit2 } from '@lucide/svelte';
	import { tip } from '$lib/components/tooltip.svelte';
	import Modal from '../Modal.svelte';
	import ModalActions from '../ModalActions.svelte';
	import { closeClone, type CloneAsk, type CloneStep } from '$lib/workspace/scm/gitDialogs.svelte';
	import { cloneAddress } from '$lib/workspace/scm/remote/cloneAddress';
	import { m } from '$lib/paraglide/messages';

	let { ask }: { ask: CloneAsk } = $props();

	let address = $state('');
	// svelte-ignore state_referenced_locally
	let parent = $state(ask.parent);
	// follows the address until the author types a name of their own
	let typedName = $state<string | null>(null);
	let busy = $state(false);
	let step = $state<CloneStep | null>(null);
	let error = $state<string | null>(null);
	let addressEl = $state<HTMLInputElement>();

	// focused here rather than with autofocus, as GitIdentityModal explains, and a task later: opened
	// from the File menu, the closing menu hands focus back to its trigger after this mounts
	onMount(() => {
		const t = setTimeout(() => addressEl?.focus(), 0);
		return () => clearTimeout(t);
	});

	const parsed = $derived(cloneAddress(address));
	const name = $derived(typedName ?? parsed?.name ?? '');
	const ready = $derived(!!parsed && !!parent && !!name.trim() && !/[/\\:*?"<>|]/.test(name));

	/** git's stages, in git's words */
	const stepText = $derived.by(() => {
		if (!step) return m.vcs_clone_connecting({ url: parsed?.url ?? address.trim() });
		const pct = `${Math.round(step.percent)}%`;
		if (step.stage === 'receiving') return m.vcs_clone_receiving({ pct });
		if (step.stage === 'resolving') return m.vcs_clone_resolving({ pct });
		return m.vcs_clone_preparing();
	});
	const overall = $derived(
		!step ? 0 : step.stage === 'receiving' ? step.percent * 0.8 : step.stage === 'resolving' ? 80 + step.percent * 0.2 : 0
	);

	async function choose() {
		const picked = await ask.pickParent();
		if (picked) parent = picked;
	}

	async function start() {
		if (!ready || busy || !parsed || !parent) return;
		busy = true;
		error = null;
		step = null;
		const choice = { url: parsed.url, parent, name: name.trim() };
		const problem = await ask.submit(choice, (s) => {
			step = s;
		});
		busy = false;
		if (problem === null) closeClone(choice);
		else error = problem || null;
	}

	function cancel() {
		if (busy) ask.stop();
		else closeClone(null);
	}
</script>

<!-- not dismissable mid-clone: Cancel stops it, so nothing half-downloaded is left behind -->
<Modal
	title={m.vcs_clone_title()}
	icon={FolderGit2}
	card="max-h-full max-w-lg overflow-y-auto p-5"
	dismissable={!busy}
	onClose={() => closeClone(null)}
	onEnter={start}
>
	<label class="block text-sm">
		<span class="font-medium">{m.vcs_clone_address()}</span>
		<input
			class="input mt-1 w-full text-sm"
			type="text"
			spellcheck="false"
			autocomplete="off"
			placeholder="https://github.com/ada/thesis"
			bind:this={addressEl}
			bind:value={address}
			disabled={busy}
		/>
	</label>
	{#if address.trim() && !parsed}
		<p class="text-error-ink mt-1 text-xs">{m.vcs_clone_not_an_address()}</p>
	{:else if parsed && parsed.url !== address.trim()}
		<p class="text-muted mt-1 text-xs">{m.vcs_clone_will_clone({ url: parsed.url })}</p>
	{/if}

	<div class="mt-4 grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2 text-sm">
		<span class="font-medium">{m.vcs_clone_folder_name()}</span>
		<input
			class="input text-sm"
			type="text"
			spellcheck="false"
			aria-label={m.vcs_clone_folder_name()}
			value={name}
			oninput={(e) => (typedName = e.currentTarget.value)}
			disabled={busy}
		/>
		<span class="font-medium">{m.vcs_clone_save_in()}</span>
		<div class="flex min-w-0 items-center gap-2">
			<span class="text-muted min-w-0 flex-1 truncate" use:tip={parent ?? ''}>{parent ?? m.vcs_clone_no_folder()}</span>
			<button type="button" class="btn btn-xs preset-outlined-surface-200-800 hover:preset-tonal shrink-0" onclick={choose} disabled={busy}>
				{m.vcs_clone_choose()}
			</button>
		</div>
	</div>

	{#if busy}
		<div class="mt-4" role="status">
			<div class="text-muted mb-1 text-xs">{stepText}</div>
			<div class="bg-surface-200-800 h-1.5 overflow-hidden rounded-full">
				<div class="bg-primary-500 h-full transition-[width]" style="width: {overall}%"></div>
			</div>
		</div>
	{/if}
	{#if error}
		<p class="text-error-ink mt-3 text-sm whitespace-pre-line" role="alert">{error}</p>
	{/if}

	<ModalActions
		class="mt-5"
		size="xs"
		buttons={[
			{ label: m.vcs_cancel(), role: 'cancel', onclick: cancel },
			{ label: m.vcs_clone_confirm(), role: 'primary', busy, disabled: !ready, onclick: start }
		]}
	/>
</Modal>
