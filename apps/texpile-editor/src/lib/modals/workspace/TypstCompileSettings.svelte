<script lang="ts">
	// The Typst lane of the compile-command modal. Typst's counterpart to live mode is Preview, and
	// there is no engine to choose - so this lane is its own component rather than a set of holes
	// punched in the LaTeX one. Auto renders it whenever the main file is a .typ.
	import { Switch } from '@skeletonlabs/skeleton-svelte';
	import { compileConfig, projectConfigSync } from '$lib/workspace/projectConfigSync.svelte';
	import { workspaceRoot } from '$lib/workspace/workspaceStore';
	import { m } from '$lib/paraglide/messages';

	type Props = {
		/** Preview is on, so the command below is not what Compile runs */
		superseded: boolean;
		/** the modal's row classes, so this lane's rows sit like its own */
		row: string;
	};
	let { superseded, row }: Props = $props();
</script>

<!-- Called "Preview" because that is what Typst's own tooling calls it: tinymist has a `preview`
     subcommand, and its editor plugins ship the command as typst-preview.preview. (The other live
     thing Typst has is `typst watch`, which is a rebuild-on-change - that is the separate Watch
     setting in Preferences, and this is faster than it.) -->
<div class={row}>
	<div class="flex items-center justify-between gap-4">
		<span class="text-sm font-medium">{m.wsview_preview_label()}</span>
		<Switch
			checked={compileConfig.current.typst.preview}
			onCheckedChange={(d) => projectConfigSync.setTypstPreview(workspaceRoot.current, d.checked)}
		>
			<Switch.Control><Switch.Thumb /></Switch.Control>
			<Switch.HiddenInput />
		</Switch>
	</div>
	<p class="text-muted mt-1 text-xs">{m.wsview_typst_preview_note()}</p>

	{#if superseded}
		<!-- the same dashed slot live mode uses: the command is kept for the folder, it just is not
		     what Compile runs while Preview is on -->
		<div class="border-surface-300-700 text-muted mt-3 rounded-base border border-dashed px-3 py-2 text-xs">
			{m.wsview_compile_disabled_preview()}
			<code class="bg-surface-200-800 ml-1 rounded-base px-1 opacity-70">tinymist (built-in)</code>
		</div>
	{/if}
</div>
