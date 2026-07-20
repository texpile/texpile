<script lang="ts">
	// The bottom dock: a Terminal/Problems tab strip over the shell instances. Owns the multi-
	// terminal state (VS Code-style: one shown, the rest kept mounted so their shells persist).
	// The parent owns only the dock's height/visibility (they drive its grid layout).
	import Terminal from './Terminal.svelte';
	import ProblemsPanel from './ProblemsPanel.svelte';
	import { compileLog } from '$lib/stores/compileLogStore';
	import { m } from '$lib/paraglide/messages';
	import { SquareTerminal, ChevronDown, Check, Trash2, Plus, X, FoldHorizontal, UnfoldHorizontal } from '@lucide/svelte';

	type TermRef =
		| { run: (cmd: string, onDone?: (output: string) => void) => void; focus: () => void; refit: () => void; interrupt: () => void }
		| undefined;

	let {
		cwd,
		view = $bindable<'terminal' | 'problems'>('terminal'),
		pdfPaneOpen = false,
		shrink = false,
		onToggleShrink,
		onClose,
		onProblemJump
	}: {
		cwd: string;
		view?: 'terminal' | 'problems';
		pdfPaneOpen?: boolean;
		shrink?: boolean;
		onToggleShrink: () => void;
		onClose: () => void;
		onProblemJump: (file: string, line: number, selectText?: string) => void;
	} = $props();

	let terminals = $state<{ id: number; title: string }[]>([]);
	let activeTermId = $state<number | null>(null);
	let menuOpen = $state(false);
	let seq = 0;
	const refs: Record<number, TermRef> = {};
	const activeRef = (): TermRef => (activeTermId != null ? refs[activeTermId] : undefined);

	function ensure() {
		if (terminals.length === 0) {
			const id = ++seq;
			terminals = [{ id, title: m.wsview_terminal_numbered({ id }) }];
			activeTermId = id;
		}
	}
	function add() {
		const id = ++seq;
		terminals = [...terminals, { id, title: m.wsview_terminal_numbered({ id }) }];
		activeTermId = id;
		menuOpen = false;
		setTimeout(() => activeRef()?.focus(), 50);
	}
	function select(id: number) {
		activeTermId = id;
		menuOpen = false;
		setTimeout(() => {
			activeRef()?.refit();
			activeRef()?.focus();
		}, 0);
	}
	function kill(id: number) {
		terminals = terminals.filter((t) => t.id !== id);
		refs[id] = undefined;
		if (activeTermId === id) activeTermId = terminals.at(-1)?.id ?? null;
		if (terminals.length === 0) onClose();
		else setTimeout(() => activeRef()?.refit(), 0);
	}

	// a fresh terminal appears the moment the dock mounts, so opening it never shows an empty pane
	ensure();

	// ---- parent API (via bind:this) ----
	/** show + run a command on the active shell, retrying until it has spawned. */
	export function runCommand(cmd: string, onDone?: (output: string) => void, tries = 0): void {
		const ref = activeRef();
		if (ref) {
			ref.run(cmd, onDone);
			return;
		}
		if (tries < 40) setTimeout(() => runCommand(cmd, onDone, tries + 1), 25); // ~1s for first mount
	}
	/** replace every shell with one fresh shell (folder changed: new cwd). */
	export function reset(): void {
		if (terminals.length === 0) return;
		const id = ++seq;
		terminals = [{ id, title: m.wsview_terminal_numbered({ id }) }];
		activeTermId = id;
		setTimeout(() => activeRef()?.refit(), 0);
	}
	export function refit(): void {
		activeRef()?.refit();
	}
	export function focusActive(): void {
		activeRef()?.focus();
	}
	export function addTerminal(): void {
		add();
	}
	/** Ctrl-C the running command (compile stop). */
	export function interrupt(): void {
		activeRef()?.interrupt();
	}
</script>

<div class="bg-surface-100-900 text-surface-600-300 flex h-8 shrink-0 items-center justify-between gap-2 px-2 text-xs">
	<div class="flex min-w-0 items-center gap-1">
		<button
			class="rounded px-2 py-1 {view === 'terminal' ? 'preset-tonal font-medium' : 'hover:preset-tonal'}"
			onclick={() => (view = 'terminal')}
		>
			{m.wsview_terminal_label()}
		</button>
		<button
			class="flex items-center gap-1 rounded px-2 py-1 {view === 'problems' ? 'preset-tonal font-medium' : 'hover:preset-tonal'}"
			onclick={() => (view = 'problems')}
		>
			{m.wsview_problems_label()}
			{#if $compileLog && $compileLog.errors.length > 0}
				<span class="text-error-500 font-semibold">{$compileLog.errors.length}</span>
			{:else if $compileLog && $compileLog.warnings.length > 0}
				<span class="text-warning-600-400 font-semibold">{$compileLog.warnings.length}</span>
			{/if}
		</button>
	</div>
	<div class="flex items-center gap-0.5">
		{#if view === 'terminal'}
			<div class="relative">
				<button class="hover:preset-tonal flex items-center gap-1.5 rounded px-2 py-1" onclick={() => (menuOpen = !menuOpen)}>
					<SquareTerminal class="size-3.5" />
					<span class="font-medium">{terminals.find((t) => t.id === activeTermId)?.title ?? m.wsview_terminal_label()}</span>
					<ChevronDown class="size-3" />
				</button>
				{#if menuOpen}
					<button class="fixed inset-0 z-40 cursor-default" aria-label={m.wsview_close_menu_aria()} onclick={() => (menuOpen = false)}
					></button>
					<div
						class="bg-surface-50-950 border-surface-300-700 absolute right-0 bottom-full z-50 mb-1 min-w-52 overflow-hidden rounded border py-1 shadow-lg"
					>
						{#each terminals as t (t.id)}
							<div class="hover:preset-tonal-surface flex items-center">
								<button class="flex flex-1 items-center gap-2 px-2.5 py-1.5 text-left" onclick={() => select(t.id)}>
									<Check class="size-3.5 {t.id === activeTermId ? '' : 'invisible'}" />
									<span class="truncate">{t.title}</span>
								</button>
								<button
									class="hover:preset-tonal-error mr-1 rounded p-1"
									title={m.wsview_kill_terminal()}
									aria-label={m.wsview_kill_terminal()}
									onclick={() => kill(t.id)}
								>
									<Trash2 class="size-3.5" />
								</button>
							</div>
						{/each}
						<button
							class="hover:preset-tonal-primary border-surface-200-800 mt-1 flex w-full items-center gap-2 border-t px-2.5 py-1.5 text-left"
							onclick={add}
						>
							<Plus class="size-3.5" />
							{m.wsview_new_terminal()}
						</button>
					</div>
				{/if}
			</div>
			<button class="hover:preset-tonal rounded p-1" title={m.wsview_new_terminal()} aria-label={m.wsview_new_terminal()} onclick={add}>
				<Plus class="size-3.5" />
			</button>
			<button
				class="hover:preset-tonal-error rounded p-1"
				title={m.wsview_kill_terminal()}
				aria-label={m.wsview_kill_terminal()}
				onclick={() => activeTermId != null && kill(activeTermId)}
			>
				<Trash2 class="size-3.5" />
			</button>
		{/if}
		{#if pdfPaneOpen}
			<button
				class="hover:preset-tonal rounded p-1"
				title={shrink ? m.wsview_expand_panel_title() : m.wsview_shrink_panel_title()}
				aria-label={shrink ? m.wsview_expand_panel_aria() : m.wsview_shrink_panel_aria()}
				onclick={onToggleShrink}
			>
				{#if shrink}<UnfoldHorizontal class="size-3.5" />{:else}<FoldHorizontal class="size-3.5" />{/if}
			</button>
		{/if}
		<button class="hover:preset-tonal rounded p-1" title={m.wsview_hide_panel()} aria-label={m.wsview_hide_panel()} onclick={onClose}>
			<X class="size-3.5" />
		</button>
	</div>
</div>
<!-- all terminals stay mounted (shells persist); only the active one is shown -->
<div class="relative min-h-0 flex-1">
	{#if view === 'problems'}
		<div class="bg-surface-50-950 absolute inset-0 z-10 overflow-hidden">
			<ProblemsPanel root={cwd} onJump={onProblemJump} />
		</div>
	{/if}
	{#each terminals as t (t.id)}
		<div class="absolute inset-0" style={t.id === activeTermId ? '' : 'display: none'}>
			<Terminal bind:this={refs[t.id]} {cwd} />
		</div>
	{/each}
</div>
