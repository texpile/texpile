<script lang="ts">
	// The compile-command modal: the typesetter's own settings, the shell command, and the per-folder
	// output-path overrides, one row each. Persisting is the caller's job.
	//
	// There is no typesetter to choose here. The main file's extension names it - typst cannot build
	// a .tex and latex cannot build a .typ - so a switch beside it could only ever disagree with the
	// pipeline. Change the main file to change the lane; this dialog just shows which one it is.
	import { Switch } from '@skeletonlabs/skeleton-svelte';
	import { Play } from '@lucide/svelte';
	import Modal from '../Modal.svelte';
	import ModalActions from '../ModalActions.svelte';
	import LatexCompileSettings from './LatexCompileSettings.svelte';
	import TypstCompileSettings from './TypstCompileSettings.svelte';
	import CompileOutputPaths from './CompileOutputPaths.svelte';
	import { tip } from '$lib/components/tooltip.svelte';
	import { mainFile, workspaceRoot, effectiveCompileFormat } from '$lib/workspace/workspaceStore';
	import { compileConfig, projectConfigSync } from '$lib/workspace/projectConfigSync.svelte';
	import { buildTypstCommand } from '$lib/workspace/typstCommand';
	import { DEFAULT_COMPILE_COMMAND } from '$lib/settings';
	import { collabHost } from '$lib/collab/hostStore.svelte';
	import { m } from '$lib/paraglide/messages';

	// live mode isn't supported while hosting a shared session (guests can't run the incremental
	// engine). Typst's Preview is exempt: its stream is relayed to guests (previewRelay).
	const sessionActive = $derived(collabHost.active);

	type Props = {
		open: boolean;
		command: string;
		outputs: { pdf: string; log: string };
		advancedOpen: boolean;
		onSave: (thenRun: boolean) => void;
		onRun: () => void;
	};
	let { open = $bindable(), command = $bindable(), outputs = $bindable(), advancedOpen = $bindable(), onSave, onRun }: Props = $props();

	// the same call the pipeline makes, so what this dialog shows and what Compile runs cannot drift
	const isTypst = $derived(effectiveCompileFormat(mainFile.current) === 'typst');

	// The lane's built-in mode is running instead of the shell command: LaTeX's live mode (the
	// pipeline ignores the setting for Typst) or Typst's preview. The command is still the folder's
	// and is kept - it just is not what Compile runs, so showing it as editable would lie.
	const superseded = $derived(isTypst ? compileConfig.current.typst.preview : compileConfig.current.latex.liveMode);

	const defaultCommand = $derived(isTypst ? buildTypstCommand(mainFile.current) : DEFAULT_COMPILE_COMMAND);
	const needsMain = $derived(command.includes('{main}') && !mainFile.current);

	// one row per setting, the way Preferences lays them out
	const ROW = 'border-surface-200-800 border-b py-3 first:pt-0';
	// the segmented-control classes the LaTeX engine chips use. `compact` keeps the engine row
	// inside max-w-lg: three engine names at full size push the latexmk checkbox off the row
	const SEGMENT = 'bg-surface-200-800 rounded-base flex shrink-0 gap-1 p-0.5';
	function seg(active: boolean, compact = false) {
		return `rounded-base ${compact ? 'px-2.5 py-1 text-xs' : 'px-3 py-1 text-sm'} ${
			active ? 'bg-surface-50-950 font-medium shadow-sm' : 'text-muted hover:text-surface-950-50'
		}`;
	}
</script>

<Modal bind:open title={m.wsview_compile_modal_title()} card="max-h-full max-w-lg overflow-y-auto p-5">
	<!-- (main-file selection lives in the first-compile confirm modal and the file
	     tree's "Set as main file" - not here; this modal is only about the command) -->

	<!-- Which typesetter is in effect: a readout, not a choice. It decides what every control
	     under it means, and the main file decides IT. -->
	<div class={ROW}>
		<div class="flex items-center justify-between gap-4">
			<span class="text-sm font-medium">{m.wsview_format_label()}</span>
			<!-- LaTeX and Typst are product names, so they are not translated -->
			<span class="text-muted text-sm">{isTypst ? 'Typst' : 'LaTeX'}</span>
		</div>
		<p class="text-muted mt-1 text-xs">{m.wsview_format_from_main()}</p>
	</div>

	<!-- the lane's own settings, so this block always describes the compiler that will run -->
	{#if isTypst}
		<TypstCompileSettings {superseded} row={ROW} />
	{:else}
		<LatexCompileSettings bind:command {superseded} {sessionActive} segment={SEGMENT} {seg} row={ROW} />
	{/if}

	{#if !superseded}
		<div class={ROW}>
			<div class="flex items-center justify-between gap-4">
				<span class="text-sm font-medium">{m.wsview_command_label()}</span>
				{#if command !== defaultCommand}
					<button
						type="button"
						class="text-muted hover:text-surface-950-50 text-xs"
						use:tip={m.wsview_use_default_title()}
						onclick={() => (command = defaultCommand)}
					>
						{m.wsview_use_default()}
					</button>
				{/if}
			</div>
			<!-- svelte-ignore a11y_autofocus -->
			<textarea
				class="textarea mt-2 w-full resize-none font-mono text-sm [field-sizing:content] rounded-container"
				rows="1"
				bind:value={command}
				placeholder={defaultCommand}
				spellcheck="false"
				autofocus
				onkeydown={(e) => {
					if (e.key !== 'Enter') return;
					e.preventDefault();
					if (!needsMain) onSave(true);
				}}></textarea>
			<p class="text-muted mt-1 text-xs">
				{m.wsview_compile_desc_pre()} <code class="bg-surface-200-800 rounded-base px-1">{'{main}'}</code>
				{m.wsview_compile_desc_post()}
			</p>
		</div>

		<div class={ROW}>
			<div class="flex items-center justify-between gap-4">
				<span class="text-sm font-medium">{m.wsview_completion_marker_label()}</span>
				<Switch
					checked={compileConfig.current.completionMarker}
					onCheckedChange={(d) => projectConfigSync.setCompletionMarker(workspaceRoot.current, d.checked)}
				>
					<Switch.Control><Switch.Thumb /></Switch.Control>
					<Switch.HiddenInput />
				</Switch>
			</div>
			<p class="text-muted mt-1 text-xs">{m.wsview_completion_marker_desc()}</p>
		</div>

		<CompileOutputPaths bind:outputs bind:open={advancedOpen} />
	{/if}

	<div class="mt-4 flex items-center justify-between gap-3">
		<span class="text-muted text-xs">
			{#if !mainFile.current}{m.wsview_pick_main_file_to_run()}{/if}
		</span>
		<!-- superseded: one button either way, since onRun goes through runCompile, which routes to the
		     draft engine or the Typst preview by the same conditions that hid the command above -->
		<ModalActions
			size="xs"
			buttons={superseded
				? [
						{ label: m.wsview_cancel_label(), role: 'cancel', onclick: () => (open = false) },
						{
							label: m.wsview_run_preview(),
							role: 'primary',
							icon: Play,
							disabled: !mainFile.current,
							onclick: () => {
								open = false;
								onRun();
							}
						}
					]
				: [
						{ label: m.wsview_cancel_label(), role: 'cancel', onclick: () => (open = false) },
						{ label: m.wsview_save_label(), onclick: () => onSave(false) },
						{ label: m.wsview_save_and_run(), role: 'primary', icon: Play, disabled: needsMain, onclick: () => onSave(true) }
					]}
		/>
	</div>
</Modal>
