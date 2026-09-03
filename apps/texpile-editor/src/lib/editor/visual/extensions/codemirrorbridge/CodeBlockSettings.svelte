<script lang="ts">
	// Code block settings popover: the language, offered per environment.
	//
	// The gear + hover-reveal + Popover shape is MathSettings', which is the proven way to put
	// chrome on a node view: the button's visibility is plain CSS :hover toggling an untransitioned
	// opacity, so ProseMirror re-rendering under the cursor cannot restart a fade or eat an enter
	// event, and the only thing overlaying the editor is one small icon in the card's padding.
	import { tip } from '$lib/components/tooltip.svelte';
	import { Popover, Portal } from '@skeletonlabs/skeleton-svelte';
	import { Settings } from '@lucide/svelte';
	import type { EditorView } from 'prosemirror-view';
	import type { Node as PMNode } from 'prosemirror-model';
	import { languages as cmlangdata } from '@codemirror/language-data';
	import { LISTINGS_LANGUAGES, canSetListingLanguage, argsWithLanguage } from '$lib/languages/latex/parser/listingLanguage';
	import { isReadOnly } from '$lib/stores/permissionStore';
	import { m } from '$lib/paraglide/messages';

	type Props = {
		node: PMNode;
		view: EditorView;
		getPos: () => number | undefined;
	};

	let { node, view, getPos }: Props = $props();

	let settingsOpen = $state(false);
	let search = $state('');

	const env = $derived(String(node.attrs.env ?? ''));
	const canSet = $derived(canSetListingLanguage(env));
	const currentLang = $derived(String(node.attrs.lang || ''));

	// What is offered is what the SOURCE accepts, not what CodeMirror can highlight. lstlisting
	// aborts the compile on a language stock listings has no definition for, so it gets the curated
	// set; fences take any info string and minted knows a Pygments lexer for essentially all of
	// CodeMirror's catalog, so both get the full list.
	const choices = $derived(/^lst/i.test(env) ? LISTINGS_LANGUAGES : cmlangdata.map((l) => l.name));

	const filtered = $derived.by(() => {
		const q = search.trim().toLowerCase();
		return q ? choices.filter((c) => c.toLowerCase().includes(q)) : choices;
	});

	function pick(name: string) {
		const pos = getPos();
		if (pos === undefined) return;
		// the node prop can be stale, read from the live doc
		const cur = view.state.doc.nodeAt(pos);
		if (!cur) return;
		const attrs = { ...cur.attrs, lang: name, args: argsWithLanguage(env, String(cur.attrs.args ?? ''), name) };
		view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, attrs));
		settingsOpen = false;
		search = '';
	}
</script>

<div class="codeblock-settings-container">
	<Popover
		open={settingsOpen}
		onOpenChange={(details) => (settingsOpen = details.open)}
		positioning={{ placement: 'bottom-end', offset: { mainAxis: 4 } }}
	>
		<!-- the Trigger renders the <button>; we take it over to hang the hint on it -->
		<Popover.Trigger class="codeblock-settings-btn" aria-label={m.codeblock_settings_button_label()} disabled={isReadOnly.current}>
			{#snippet element(attrs)}
				<button {...attrs} use:tip={m.codeblock_settings_button_label()}><Settings class="h-4 w-4" /></button>
			{/snippet}
		</Popover.Trigger>

		<Portal>
			<Popover.Positioner class="z-floating-ui">
				<Popover.Content class="card bg-surface-50-950 border-surface-300-700 w-[240px] border shadow-lg">
					<div class="settings-content">
						<div class="mb-2 flex items-center justify-between gap-2">
							<span class="text-muted text-sm font-medium">{m.codeblock_language_label()}</span>
							{#if currentLang}
								<span class="preset-tonal-primary rounded-base px-2 py-0.5 text-sm font-medium">{currentLang}</span>
							{/if}
						</div>
						{#if canSet}
							<input type="text" class="input text-sm" placeholder={m.codeblock_language_search_placeholder()} bind:value={search} />
							<div class="mt-2 max-h-48 overflow-y-auto">
								{#each filtered as name (name)}
									<button
										type="button"
										class="hover:bg-surface-200-800 block w-full rounded-base px-2 py-1 text-left text-sm {name === currentLang
											? 'preset-tonal-primary'
											: ''}"
										onclick={() => pick(name)}
									>
										{name}
									</button>
								{:else}
									<p class="text-muted px-2 py-1 text-xs">{m.codeblock_language_no_match()}</p>
								{/each}
							</div>
						{:else}
							<p class="text-muted text-xs">{m.codeblock_verbatim_note()}</p>
						{/if}
					</div>
				</Popover.Content>
			</Popover.Positioner>
		</Portal>
	</Popover>
</div>

<style>
	/* Sits in the column the wrapper's pr-9 reserves: never over the code, so it can never take a
	   click or the focus meant for CodeMirror. Always visible, like the table wrapper's settings
	   button: hover-revealed chrome flashes whenever the DOM under the pointer is rebuilt, because
	   :hover has to be re-established on the fresh element. A control that looks the same before
	   and after a rebuild has nothing to flash. */
	.codeblock-settings-container {
		position: absolute;
		right: calc(var(--spacing) * 0.5);
		top: calc(var(--spacing) * 1);
		display: flex;
		align-items: center;
	}

	:global(.codeblock-settings-btn) {
		padding: calc(var(--spacing) * 1);
		border-radius: var(--radius-base);
		cursor: pointer;
		border: none;
		background: transparent;
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--faint-text);
	}

	:global(.codeblock-settings-btn:hover) {
		color: var(--muted-text);
		background: color-mix(in srgb, var(--color-surface-500) 15%, transparent);
	}

	.settings-content {
		padding: calc(var(--spacing) * 3);
	}
</style>
