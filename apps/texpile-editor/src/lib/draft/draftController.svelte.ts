// Draft mode's stateful controller: root/main derivation, compile triggers, pause state,
// the per-edit dispatcher, and the warm-engine lifecycle. The workspace constructs ONE of
// these and the preview chain passes it down whole -- no per-field prop threading.
import type DraftView from './DraftView.svelte';
import { DraftDispatcher } from './draftDispatcher';
import { workspaceRoot, mainFile } from '$lib/workspace/workspaceStore';
import { latexLiveMode } from '$lib/workspace/projectConfigSync.svelte';
import { compileBaseDir } from '$lib/workspace/compileCommand';
import { relFromRoot } from '$lib/workspace/compilePipeline.svelte';
import { nativeBridge } from '$lib/workspace/fileSystem';

export type DraftControllerDeps = {
	/** the resolved shell compile command; its `-cd` decides where the engine runs */
	compileCommand(): string;
	/** the main-file prompt has been answered (holds the first live compile until then) */
	mainConfirmed(): boolean;
	pdfPaneOpen(): boolean;
	setPdfPaneOpen(open: boolean): void;
	openCompileModal(): void;
	getSource(): string;
	getLoadedPath(): string | null;
	flushSaves(): Promise<void>;
};

export class DraftController {
	// bump to run a full draft compile; the quiet variant announces nothing (boundary edits)
	trigger = $state(0);
	quietTrigger = $state(0);
	// keeps the last preview on screen but stops the warm lualatex and all live dispatch
	paused = $state(false);
	// the mounted DraftView (set by the preview body); the dispatcher patches through it
	view = $state<DraftView | null>(null);

	// assigned first thing in the constructor; the $derived fields only read it lazily
	#deps!: DraftControllerDeps;

	// The draft engine runs where the SHELL compile would run: under `latexmk -cd` the
	// project's relative \input/\includegraphics paths are authored against the main file's
	// folder, so the warm lualatex must resolve them from there too - and everything
	// downstream (the _draft/ build dir, synctex paths, bib seeding, image resolution) keys
	// off this same base. Without -cd this IS the workspace root, unchanged.
	root = $derived(compileBaseDir(this.#deps.compileCommand(), workspaceRoot.current, mainFile.current) ?? '');
	mainRel = $derived.by(() => {
		if (!this.#deps.mainConfirmed()) return '';
		// the MAIN file only - never the focused one: a mainless project shows the pane's
		// pick-a-main message instead of re-targeting the warm engine at the focused file
		const target = mainFile.current;
		return this.root && target ? relFromRoot(target, this.root) : '';
	});

	readonly dispatcher: DraftDispatcher;

	constructor(deps: DraftControllerDeps) {
		this.#deps = deps;
		this.dispatcher = new DraftDispatcher({
			getSource: () => deps.getSource(),
			getLoadedPath: () => deps.getLoadedPath(),
			isActive: () => latexLiveMode() && deps.pdfPaneOpen() && !!deps.getLoadedPath() && !this.paused,
			flushSaves: () => deps.flushSaves(),
			triggerFullCompile: () => this.trigger++,
			triggerQuietCompile: () => this.quietTrigger++,
			getTarget: () => this.view
		});

		// Stop the warm engine when draft mode is off, no preview is open, or the folder
		// changed -- otherwise it keeps a lualatex process (100-300MB with a heavy preamble)
		// alive for the whole session. It re-warms in ~1.5s on the next compile.
		let daemonActive = false;
		let daemonRoot: string | null = null;
		$effect(() => {
			const active = latexLiveMode() && deps.pdfPaneOpen() && !this.paused;
			// the DRAFT root, not the workspace root: under -cd it is the main file's folder,
			// so re-pointing the main at another folder must reap the old warm daemon too
			const root = this.root;
			if (daemonActive && (!active || root !== daemonRoot)) nativeBridge()?.draftStop?.();
			daemonActive = active;
			daemonRoot = root;
		});

		// ONE decision point per edit; signal reads inside run() are tracked through this
		// synchronous call
		$effect(() => {
			this.runDecision();
		});
	}

	runDecision = () => this.dispatcher.run();

	pause() {
		this.paused = true; // the daemon-stop effect sees inactive and kills the engine
	}

	async resume() {
		this.paused = false;
		await this.compile(); // re-sync (content may have drifted while paused) + re-warm
	}

	/** Saves first (so the compile sees the buffer), opens the preview pane, bumps the
	 * trigger; DraftView runs the actual lualatex draft compile + per-page render. */
	async compile() {
		if (!this.root || !this.mainRel) {
			this.#deps.openCompileModal();
			return;
		}
		this.paused = false; // compiling implies live (covers the keyboard-shortcut path)
		await this.#deps.flushSaves();
		this.dispatcher.adoptCurrentAsBaseline(); // the live-edit effect must not recompile this same source
		this.#deps.setPdfPaneOpen(true);
		this.trigger++;
	}

	/** Save PDF runs its own full pass: it must see the buffer, and no debounced pass may supersede it */
	async settleForSave() {
		this.dispatcher.cancel();
		await this.#deps.flushSaves();
		this.dispatcher.adoptCurrentAsBaseline();
	}

	dispose() {
		this.dispatcher.cancel();
	}
}
