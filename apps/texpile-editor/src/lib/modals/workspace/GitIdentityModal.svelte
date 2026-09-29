<script lang="ts">
	// Asked once, before the first version saved on a machine where git does not know who is saving
	// it. git refuses to commit without a name and an email, and its refusal ("Please tell me who
	// you are") sends someone to a terminal to type two config commands; this is those two commands.
	import { onMount } from 'svelte';
	import { UserRound } from '@lucide/svelte';
	import Modal from '../Modal.svelte';
	import ModalActions from '../ModalActions.svelte';
	import { answerIdentity, type Identity } from '$lib/workspace/scm/gitDialogs.svelte';
	import { m } from '$lib/paraglide/messages';

	let { initial }: { initial: Identity } = $props();

	// seeded once from what git already has: one of the two is often set and the other not
	// svelte-ignore state_referenced_locally
	let name = $state(initial.name);
	// svelte-ignore state_referenced_locally
	let email = $state(initial.email);

	// Focused here rather than with autofocus: Svelte's autofocus only acts when nothing else has
	// focus, and the Save version button that opened this dialog still does
	let nameEl = $state<HTMLInputElement>();
	let emailEl = $state<HTMLInputElement>();
	onMount(() => (initial.name ? emailEl : nameEl)?.focus());

	const ready = $derived(!!name.trim() && /^[^\s@]+@[^\s@]+$/.test(email.trim()));

	function save() {
		if (ready) answerIdentity({ name: name.trim(), email: email.trim() });
	}
</script>

<Modal title={m.vcs_identity_title()} icon={UserRound} onClose={() => answerIdentity(null)} onEnter={save}>
	<p class="text-muted mb-4 text-sm">{m.vcs_identity_desc()}</p>
	<div class="space-y-3">
		<label class="block text-sm">
			<span class="font-medium">{m.prefs_collab_git_name()}</span>
			<input class="input mt-1 w-full text-sm" type="text" autocomplete="name" bind:value={name} bind:this={nameEl} />
		</label>
		<label class="block text-sm">
			<span class="font-medium">{m.prefs_collab_git_email()}</span>
			<input class="input mt-1 w-full text-sm" type="email" autocomplete="email" bind:value={email} bind:this={emailEl} />
		</label>
	</div>
	<ModalActions
		class="mt-5"
		size="xs"
		buttons={[
			{ label: m.vcs_cancel(), role: 'cancel', onclick: () => answerIdentity(null) },
			{ label: m.vcs_identity_save(), role: 'primary', disabled: !ready, onclick: save }
		]}
	/>
</Modal>
