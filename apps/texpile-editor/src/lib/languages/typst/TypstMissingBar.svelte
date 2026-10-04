<script lang="ts" module>
	// closed for the rest of the window's life: it comes back with the next window, not the next file
	let dismissed = $state(false);
	// only the newest look counts: an older one answering late would say missing after an install
	let looks = 0;
</script>

<script lang="ts">
	// The line over a .typ file when tinymist is not here. Typst still edits without it, highlighting, the visual editor
	// and math included, but nothing previews, completes, checks or exports, and the editor alone gives no sign of why
	import { CircleAlert, X } from '@lucide/svelte';
	import { tip } from '$lib/components/tooltip.svelte';
	import EditorNotice from '$lib/components/EditorNotice.svelte';
	import { settings } from '$lib/settings';
	import { tinymistResolved, typstBridgeAvailable, typstServerGen } from './intellisense/lspClient';
	import { askForProgram, tinymistMissing } from '$lib/modals/window/missingProgram/missingProgram.svelte';
	import { tinymistInstaller } from '$lib/modals/window/tinymistInstall.svelte';
	import { m } from '$lib/paraglide/messages';

	// asked when a .typ file opens, and again when anything that finds it changes: an install, the Toolchain folders
	$effect(() => {
		void typstServerGen.current;
		void settings.current.toolDirs;
		if (!typstBridgeAvailable()) return;
		const look = ++looks;
		void tinymistResolved().then((found) => {
			if (look !== looks) return;
			tinymistMissing.current = !found;
			if (!found) void tinymistInstaller.refresh();
		});
	});
</script>

{#if tinymistMissing.current && !dismissed}
	<EditorNotice icon={CircleAlert} tone="warning" title={m.typst_missing_title()} note={m.typst_missing_body()}>
		<!-- the choice, Texpile's install or one already on the computer, is the dialog's -->
		<button type="button" class="btn btn-xs preset-filled-primary-500 shrink-0" onclick={() => askForProgram('tinymist')}>
			{m.typst_set_up()}
		</button>
		<button
			type="button"
			class="btn-icon btn-icon-xs hover:preset-tonal shrink-0"
			aria-label={m.modal_close_aria()}
			use:tip={m.modal_close_aria()}
			onclick={() => (dismissed = true)}
		>
			<X class="size-3.5" />
		</button>
	</EditorNotice>
{/if}
