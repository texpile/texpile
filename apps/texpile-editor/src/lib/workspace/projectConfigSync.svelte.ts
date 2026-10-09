// The folder's ADOPTED compile configuration, and the machinery keeping it in step with
// .texpile/config.json.
//
// The file is the only persisted home of the compile surface - main file aside, nothing
// compile-shaped lives in localStorage any more. What this module holds is the in-memory adopted
// state: the file's contents after the trust gate. Inert fields (outputs, the toggles) adopt
// verbatim; the COMMAND adopts only when this machine has approved that exact string
// (isCommandTrusted), else it sits in `pending` behind the "Use this command?" bar. Texpile runs
// the command, so a cloned repository must never bring one that executes unasked - see
// projectConfig.ts for the full threat model.
//
// Every local edit writes straight back to the file, so in steady state file and adopted state
// agree; they diverge exactly when a git pull brings someone else's command. Deleting the file is
// a true project reset: nothing here resurrects it uninvited.
import { box } from '$lib/runes/box.svelte';
import {
	savedMainFile,
	savedMainFileRel,
	setMainFile,
	effectiveCompileFormat,
	mainFile,
	isCommandTrusted,
	trustCommand,
	type CompileOutputs
} from '$lib/workspace/workspaceStore';
import { joinPath } from '$lib/workspace/fileSystem';
import { ensureTexpileIgnore } from '$lib/workspace/texpileDir';
import { folderKey } from '$lib/storage/workspaces';
import { readMigrationStash, writeMigrationStash } from '$lib/migration/migrate';
import { hasProjectConfig, readProjectConfig, writeProjectConfig, type ProjectConfig } from '$lib/workspace/projectConfig';
import type { SpellLanguage } from '$lib/editor/spellcheck/languages/spellLanguages';

export type PendingCommand = {
	root: string;
	format: 'latex' | 'typst';
	command: string;
};

export type CompileConfigState = {
	latex: { command: string | null; outputs: CompileOutputs; liveMode: boolean };
	typst: { command: string | null; outputs: CompileOutputs; preview: boolean };
	/** append a marker echo after the compile command to detect when it finishes */
	completionMarker: boolean;
};

function defaults(): CompileConfigState {
	return {
		latex: { command: null, outputs: {}, liveMode: false },
		typst: { command: null, outputs: {}, preview: true },
		completionMarker: true
	};
}

/** the adopted state, reactive; defaults between folders and for guests (who never compile). */
export const compileConfig = box<CompileConfigState>(defaults());

/** the folder's spelling language from Spelling > Folder Language; null = what each document names */
export const projectSpelling = box<SpellLanguage | null>(null);

/** the folder's live mode where it applies: to a main file that compiles with LaTeX */
export function latexLiveMode(): boolean {
	return compileConfig.current.latex.liveMode && effectiveCompileFormat(mainFile.current) === 'latex';
}

export class ProjectConfigSync {
	/** a command the project asks for that this machine has not accepted; drives the bar */
	pending = $state<PendingCommand | null>(null);

	/** folder closed or switched: back to defaults so nothing leaks across roots. */
	reset(): void {
		this.pending = null;
		compileConfig.current = defaults();
		projectSpelling.current = null;
	}

	/**
	 * Read the project's config and adopt it.
	 *
	 * Everything inert lands immediately - main file, outputs, the toggles - because none of it can
	 * do anything but point the compiler at the right files. The command is held back unless it has
	 * already been accepted here.
	 */
	async adopt(root: string | null): Promise<void> {
		if (!root) {
			this.pending = null;
			return;
		}
		// No file yet: seed one when there is anything worth writing - a chosen main, or the compile
		// state a pre-restructure install left in the migration stash. Keyed on the file being
		// ABSENT rather than unreadable: a config from a newer Texpile must not be overwritten.
		if (!(await hasProjectConfig(root))) {
			this.pending = null;
			await this.seed(root);
			return;
		}
		const cfg = await readProjectConfig(root);
		if (!cfg) {
			this.pending = null;
			return;
		}
		if ((cfg.spelling?.language ?? null) !== projectSpelling.current) projectSpelling.current = cfg.spelling?.language ?? null;
		// a project WITH a config must have an ignore that lets it reach git; this also upgrades
		// the stale seeded allowlist 0.17 shipped (it kept config.json out of git status) without
		// waiting for the next settings change to write one
		void ensureTexpileIgnore(root);
		// back to absolute: setMainFile takes a real path and re-relativises it against the root.
		// This is also what settles the typesetter - the extension decides it.
		if (cfg.main !== undefined) setMainFile(root, cfg.main ? joinPath(root, cfg.main) : null);

		// pending is computed into a local and assigned ONCE at the end: this runs on every save
		// (the fs watcher reports our own writes), and clearing the field up front made the
		// "Use this command?" bar blink on each one
		let pending: PendingCommand | null = null;
		const state = defaults();
		if (cfg.completionMarker !== undefined) state.completionMarker = cfg.completionMarker;
		if (cfg.latex?.liveMode !== undefined) state.latex.liveMode = cfg.latex.liveMode;
		if (cfg.typst?.preview !== undefined) state.typst.preview = cfg.typst.preview;
		for (const format of ['latex', 'typst'] as const) {
			const fc = cfg[format];
			// outputs adopt even when ABSENT, which clears them: the file is a full snapshot of the
			// project's build settings, so "no override here" has to mean something.
			state[format].outputs = fc?.outputs ?? {};
			if (!fc?.command) continue;
			if (isCommandTrusted(root, format, fc.command)) state[format].command = fc.command;
			// only ask about the format this project actually builds with. Prompting for the other
			// lane's command would be a question about something the user is not doing.
			else if (format === effectiveCompileFormat(savedMainFile(root))) pending = { root, format, command: fc.command };
		}
		this.pending = pending;
		// unchanged settings keep their object: a new one on every save re-ran everything that reads them, and the Typst
		// preview retried a missing tinymist, one toast per keystroke's save
		if (JSON.stringify(state) !== JSON.stringify(compileConfig.current)) compileConfig.current = state;
	}

	/**
	 * Re-read the file after someone else wrote it - a `git pull`, a second window, an agent.
	 *
	 * Safe at any moment precisely because there is nothing local to lose: every change made here
	 * writes straight back to the file, so the file is never behind us. What it does NOT do is
	 * seed - deleting .texpile/config.json should leave it deleted.
	 */
	async refresh(root: string | null): Promise<void> {
		if (!root || !(await hasProjectConfig(root))) return;
		await this.adopt(root);
	}

	/**
	 * First open of a folder with no config file: write one from what is already known - the chosen
	 * main file, and the compile command/outputs/toggles a pre-restructure install left in the
	 * migration stash (its command was typed by this user in the old modal, so it arrives trusted).
	 * A plain folder opened to read a paper writes nothing.
	 */
	private async seed(root: string): Promise<void> {
		const stash = readMigrationStash();
		const stashed = stash?.folders?.[folderKey(root)];
		const state = defaults();
		if (stash?.toggles?.draftMode !== undefined) state.latex.liveMode = stash.toggles.draftMode;
		if (stash?.toggles?.typstLiveMode !== undefined) state.typst.preview = stash.toggles.typstLiveMode;
		if (stash?.toggles?.compileSentinel !== undefined) state.completionMarker = stash.toggles.compileSentinel;
		if (stashed?.command) {
			// 0.16.1 was latex-only, so a stashed command is the latex lane's
			state.latex.command = stashed.command;
			trustCommand(root, 'latex', stashed.command);
		}
		if (stashed?.outputs) state.latex.outputs = stashed.outputs;
		compileConfig.current = state;
		if (stashed) {
			const next = { ...stash!, folders: { ...stash!.folders } };
			delete next.folders![folderKey(root)];
			writeMigrationStash(next);
		}
		const hasAny = !!savedMainFileRel(root) || !!stashed || !!stash?.toggles;
		if (hasAny) await this.save(root);
	}

	/** the user pressed Use it: remember the command for this project and apply it */
	accept(): void {
		const p = this.pending;
		if (!p) return;
		this.pending = null;
		trustCommand(p.root, p.format, p.command);
		compileConfig.current = { ...compileConfig.current, [p.format]: { ...compileConfig.current[p.format], command: p.command } };
	}

	// setters: every mutation lands in the store AND the file

	/** save (or clear, with null) one lane's command; a command the user typed here is trusted by
	 *  definition, or reopening the folder would ask them to approve their own command. */
	setCommand(root: string | null, format: 'latex' | 'typst', command: string | null): void {
		compileConfig.current = { ...compileConfig.current, [format]: { ...compileConfig.current[format], command } };
		if (root && command) trustCommand(root, format, command);
		this.pending = null; // saving settles the question the bar was asking, whatever was typed
		void this.save(root);
	}

	setOutputs(root: string | null, format: 'latex' | 'typst', outputs: CompileOutputs): void {
		const clean: CompileOutputs = {};
		if (outputs.pdf) clean.pdf = outputs.pdf;
		if (outputs.log) clean.log = outputs.log;
		compileConfig.current = { ...compileConfig.current, [format]: { ...compileConfig.current[format], outputs: clean } };
		void this.save(root);
	}

	setLiveMode(root: string | null, on: boolean): void {
		compileConfig.current = { ...compileConfig.current, latex: { ...compileConfig.current.latex, liveMode: on } };
		void this.save(root);
	}

	setTypstPreview(root: string | null, on: boolean): void {
		compileConfig.current = { ...compileConfig.current, typst: { ...compileConfig.current.typst, preview: on } };
		void this.save(root);
	}

	setCompletionMarker(root: string | null, on: boolean): void {
		compileConfig.current = { ...compileConfig.current, completionMarker: on };
		void this.save(root);
	}

	setSpelling(root: string | null, language: SpellLanguage | null): void {
		projectSpelling.current = language;
		void this.save(root);
	}

	/**
	 * Write the adopted state back out.
	 *
	 * Carries forward what this machine never took in: a command still pending (or for the lane the
	 * project does not build with) was never adopted, so rebuilding the file from adopted state
	 * alone would DELETE it - one Save in a .tex project and the Typst command a collaborator
	 * committed would be gone. We are only authoritative about what we accepted; trust is the test
	 * of whether an absent adopted command means "cleared" (trusted before, removable) or "never
	 * ours" (kept).
	 */
	async save(root: string | null): Promise<void> {
		if (!root) return;
		const prev = await readProjectConfig(root);
		const state = compileConfig.current;
		const cfg: ProjectConfig = { v: 1 };
		const main = savedMainFileRel(root);
		if (main) cfg.main = main.replace(/\\/g, '/');
		if (!state.completionMarker) cfg.completionMarker = false;
		for (const lane of ['latex', 'typst'] as const) {
			const local = state[lane].command ?? undefined;
			const kept = prev?.[lane]?.command;
			const command = local || (kept && !isCommandTrusted(root, lane, kept) ? kept : undefined);
			const outputs = state[lane].outputs;
			const hasOutputs = !!(outputs.pdf || outputs.log);
			const liveMode = lane === 'latex' && state.latex.liveMode ? { liveMode: true } : {};
			const preview = lane === 'typst' && !state.typst.preview ? { preview: false } : {};
			const section = { ...(command ? { command } : {}), ...(hasOutputs ? { outputs } : {}), ...liveMode, ...preview };
			if (Object.keys(section).length) cfg[lane] = section;
		}
		if (projectSpelling.current) cfg.spelling = { language: projectSpelling.current };
		await writeProjectConfig(root, cfg);
	}
}

/** one instance per app: the pending bar and the adopted state are window-level, like the stores */
export const projectConfigSync = new ProjectConfigSync();
