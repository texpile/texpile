<script lang="ts">
	// A question git or ssh asked on the way to a remote - a username, a password or token, a key's
	// passphrase, or whether to trust a server it has not seen - asked here instead of in a terminal
	// nobody can see (electron/src/git/auth/gitAskpass.ts). Git's own credential helpers are asked first, so
	// this appears only when they have nothing, and a helper that has one keeps it after it works.
	import { onMount } from 'svelte';
	import { KeyRound, ShieldQuestionMark, Globe } from '@lucide/svelte';
	import Modal from '../Modal.svelte';
	import ModalActions from '../ModalActions.svelte';
	import { answerQuestion, answerWithGithubSignIn, type GitQuestion } from '$lib/workspace/scm/gitDialogs.svelte';
	import { m } from '$lib/paraglide/messages';

	let { question }: { question: GitQuestion } = $props();

	let value = $state('');
	// explicit, not autofocus: that one is skipped whenever the control that started the operation
	// still has focus
	let inputEl = $state<HTMLInputElement>();
	// a question with nothing to type (a server's key to trust) takes the keyboard on what it asks
	// about, so Enter answers and Escape declines, as in the dialogs with a field
	let promptEl = $state<HTMLElement>();
	onMount(() => (inputEl ?? promptEl)?.focus());

	// GitHub has not taken account passwords for git since 2021; saying "password" there sends people
	// to type the one thing that cannot work
	const github = $derived(question.host === 'github.com' || !!question.host?.endsWith('.github.com'));

	const title = $derived.by(() => {
		if (question.subject === 'host-key') return m.vcs_hostkey_title();
		if (question.subject === 'passphrase') {
			// ssh names the key it wants unlocked ("Enter passphrase for key '/home/me/.ssh/id_ed25519':")
			const file = /for key '([^']+)'/.exec(question.prompt)?.[1];
			return file ? m.vcs_passphrase_title({ file }) : m.vcs_passphrase();
		}
		return question.host ? m.vcs_signin_title({ host: question.host }) : m.vcs_signin_title_generic();
	});

	const label = $derived.by(() => {
		if (question.subject === 'username') return m.vcs_signin_username();
		if (question.subject === 'passphrase') return m.vcs_passphrase();
		if (question.subject === 'password') return github ? m.vcs_signin_token() : m.vcs_signin_password();
		return question.prompt;
	});

	function submit() {
		if (question.input === 'confirm') answerQuestion(question.id, 'yes');
		// Enter reaches here past the disabled button; an empty answer is not one
		else if (value) answerQuestion(question.id, value);
	}
</script>

<!-- above every other dialog: it arrives while Publish is still up, and that one waits on this answer -->
<Modal
	{title}
	icon={question.input === 'confirm' ? ShieldQuestionMark : KeyRound}
	z="z-1400"
	card="max-h-full max-w-md overflow-y-auto p-5"
	onClose={() => answerQuestion(question.id, null)}
	onEnter={submit}
>
	{#if question.input === 'confirm'}
		<p class="text-muted mb-3 text-sm">{m.vcs_hostkey_desc()}</p>
		<pre
			class="bg-surface-100-900 rounded-base overflow-x-auto p-3 text-xs whitespace-pre-wrap outline-none"
			tabindex="-1"
			bind:this={promptEl}>{question.prompt}</pre>
	{:else}
		{#if question.github}
			<!-- VS Code's GitHub account: the browser signs in, and no token is typed or kept by hand -->
			<!-- tonal: Continue below stays the dialog's one primary -->
			<button class="btn btn-sm preset-tonal-primary w-full gap-1.5" onclick={() => void answerWithGithubSignIn(question)}>
				<Globe class="size-4" />
				<span class="cap-center">{m.github_signin_browser()}</span>
			</button>
			<div class="text-muted my-4 flex items-center gap-3 text-xs">
				<hr class="border-surface-200-800 flex-1" />
				{m.github_signin_or()}
				<hr class="border-surface-200-800 flex-1" />
			</div>
		{/if}
		{#if question.subject === 'password' && github}
			<p class="text-muted mb-3 text-sm">
				{m.vcs_signin_github_hint()}
				<a
					class="anchor"
					href="https://github.com/settings/tokens/new?scopes=repo&description=Texpile"
					target="_blank"
					rel="noopener noreferrer">{m.vcs_create_token()}</a
				>
			</p>
		{:else if question.subject !== 'other' && !(question.subject === 'username' && question.host)}
			<!-- exactly what was asked, so it is plain which account or which key this is for; a username's
			     question names only the host, which the title already does -->
			<p class="text-muted mb-3 text-xs break-all">{question.prompt}</p>
		{/if}
		<label class="block text-sm">
			<span class="font-medium">{label}</span>
			<input
				class="input mt-1 w-full text-sm"
				type={question.input === 'secret' ? 'password' : 'text'}
				autocomplete={question.subject === 'username' ? 'username' : 'off'}
				spellcheck="false"
				bind:value
				bind:this={inputEl}
			/>
		</label>
	{/if}
	<ModalActions
		class="mt-5"
		size="xs"
		buttons={[
			{ label: m.vcs_cancel(), role: 'cancel', onclick: () => answerQuestion(question.id, null) },
			{
				label: question.input === 'confirm' ? m.vcs_hostkey_trust() : m.vcs_signin_continue(),
				role: 'primary',
				disabled: question.input !== 'confirm' && !value,
				onclick: submit
			}
		]}
	/>
</Modal>
