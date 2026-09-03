<script lang="ts">
	// The LaTeX lane of the compile-command modal: live mode, and the engine/latexmk quick setup.
	//
	// Everything here is a TeX concept with no Typst counterpart, which is why it is a component
	// rather than a branch - the modal picks a lane and renders it, and Auto picks the same lane the
	// compiler will (the main file's extension), so an auto folder gets exactly these controls.
	import { Switch } from '@skeletonlabs/skeleton-svelte';
	import * as cc from '$lib/workspace/compileCommand';
	import { compileConfig, projectConfigSync } from '$lib/workspace/projectConfigSync.svelte';
	import { workspaceRoot, mainFile } from '$lib/workspace/workspaceStore';
	import { dirname, relativeTo, samePath } from '$lib/workspace/fileSystem';
	import { m } from '$lib/paraglide/messages';

	type Props = {
		/** the draft command; the engine chips rewrite it in place */
		command: string;
		/** live mode is on, so the command below is not what Compile runs */
		superseded: boolean;
		/** hosting a shared session: guests cannot run the incremental engine */
		sessionActive: boolean;
		/** the segmented-control classes, shared with the modal's format switch */
		segment: string;
		seg: (active: boolean, compact?: boolean) => string;
	};
	let { command = $bindable(), superseded, sessionActive, segment, seg }: Props = $props();

	// chip highlight state, reflected live from the draft (null engine = unrecognized)
	const engine = $derived(cc.detectEngine(command));
	const latexmk = $derived(cc.usesLatexmk(command));
	const ENGINES = ['pdflatex', 'lualatex', 'xelatex'] as const;

	// -cd builds in the main file's own folder rather than the workspace root, which moves both the
	// output and what relative paths mean. Said only when it actually differs - at the root there is
	// nothing to explain - and as a readout, not a control: the flag lives in the command box, and a
	// second switch for the same bit is a second thing to drift.
	const runsIn = $derived.by(() => {
		const root = workspaceRoot.current;
		const main = mainFile.current;
		if (!root || !main || !cc.usesLatexmk(command) || !cc.usesCd(command)) return null;
		const dir = dirname(main);
		if (samePath(dir, root)) return null;
		const rel = relativeTo(root, dir).replace(/\\/g, '/');
		const out = cc.compileOutDir(command);
		return { dir: `${rel}/`, out: out === '.' ? `${rel}/` : `${rel}/${out}/` };
	});

	function applyEngine(e: cc.Engine) {
		command = cc.buildCompileCommand(e, cc.usesLatexmk(command), command);
	}
	function applyLatexmk(on: boolean) {
		command = cc.buildCompileCommand(cc.detectEngine(command) ?? 'pdflatex', on, command);
	}
</script>

<!-- Live mode IS the incremental lualatex pipeline. The setting is global and stays whatever it
     was, ready for the next LaTeX folder. -->
<div class="mb-1 flex items-center justify-between gap-4">
	<span class="text-sm">{m.wsview_live_mode_label()} <span class="text-muted">{m.wsview_experimental_label()}</span></span>
	<Switch
		checked={compileConfig.current.latex.liveMode}
		disabled={sessionActive}
		onCheckedChange={(d) => projectConfigSync.setLiveMode(workspaceRoot.current, d.checked)}
	>
		<Switch.Control><Switch.Thumb /></Switch.Control>
		<Switch.HiddenInput />
	</Switch>
</div>

{#if sessionActive}
	<p class="text-warning-700-300 mt-1 mb-1 text-xs">{m.wsview_live_mode_collab_note()}</p>
{/if}

{#if superseded}
	<p class="text-muted mt-1 mb-1 text-xs">
		{m.wsview_livemode_desc_pre()} <strong>lualatex</strong>
		{m.wsview_livemode_desc_post()}
	</p>
	<div class="border-surface-300-700 text-muted mt-3 rounded-base border border-dashed px-3 py-2 text-xs">
		{m.wsview_compile_disabled_live()}
		<code class="bg-surface-200-800 ml-1 rounded-base px-1 opacity-70">lualatex (built-in)</code>
	</div>
{:else}
	<p class="text-muted mt-2 mb-3 text-xs">
		{m.wsview_compile_desc_pre()} <code class="bg-surface-200-800 rounded-base px-1">{'{main}'}</code>
		{m.wsview_compile_desc_post()}
	</p>

	<!-- quick setup: chips reflect the command when recognizable, and regenerate it on click -->
	<div class="mb-3 flex items-center justify-between gap-3">
		<span class="flex min-w-0 items-baseline gap-2 text-sm font-medium">
			{m.wsview_engine_label()}
			<!-- no segment is raised when the engine is unrecognized, so say why -->
			{#if engine === null && command.trim()}
				<span class="text-faint truncate text-xs italic">{m.wsview_custom_label()}</span>
			{/if}
		</span>
		<div class="flex shrink-0 items-center gap-3">
			<div class={segment}>
				{#each ENGINES as eng (eng)}
					<button type="button" class={seg(engine === eng, true)} onclick={() => applyEngine(eng)}>
						{eng}
					</button>
				{/each}
			</div>
			<label class="text-muted inline-flex items-center gap-1.5 text-xs">
				<input type="checkbox" class="checkbox" checked={latexmk} onchange={(e) => applyLatexmk(e.currentTarget.checked)} />
				{m.wsview_use_latexmk_label()}
			</label>
		</div>
	</div>

	{#if runsIn}
		<p class="text-muted -mt-1 mb-3 text-xs">
			{m.wsview_compile_runs_in({ dir: runsIn.dir, out: runsIn.out })}
		</p>
	{/if}
{/if}
