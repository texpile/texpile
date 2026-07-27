// compile / terminal / PDF-watch orchestration: resolve the command, run it in the terminal dock,
// poll the log + PDF until the run settles, publish parsed diagnostics and the fresh PDF.
// WorkspaceView wires the deps.
import { get } from 'svelte/store';
import { compileLog } from '$lib/stores/compileLogStore';
import { parseCompileDiagnosticsInWorker } from '$lib/latex-log/parseInWorker';
import { pdfStore } from '$lib/stores/pdfStore';
import { projectIntelStore } from '$lib/stores/projectIntel';
import { settings, loadSettings } from '$lib/settings';
import { workspaceRoot, mainFile, texFiles, savedCompileCommand, savedCompileOutputs } from './workspaceStore';
import * as cc from './compileCommand';
import { basename, joinPath } from './fileSystem';
import type { EditSession } from '$lib/collab/editSession';
import { toaster } from '$lib/modals/toaster-svelte';
import { m } from '$lib/paraglide/messages';

// a root-relative, forward-slashed path (the form file references take in LaTeX)
export const relFromRoot = (p: string, root: string) =>
	p
		.slice(root.length)
		.replace(/^[\\/]+/, '')
		.replace(/\\/g, '/');

// per-folder command wins over the global default (the last one saved anywhere)
export const resolveCompileCommand = (root: string | null, global: string) => (root && savedCompileCommand(root)) || global || '';

// a TeX engine at its default errorstop interaction parks at the interactive ? prompt on the
// first error. for known engine commands, inject -interaction=nonstopmode (plus -file-line-error
// for exact error attribution); custom scripts/makefiles are left untouched.
function withBatchFlags(cmd: string): string {
	const hit = cmd.match(/^(\s*(?:latexmk|pdflatex|xelatex|lualatex)(?:\.exe)?)(?=\s|$)/i);
	if (!hit) return cmd;
	const flags: string[] = [];
	if (!/-interaction[= ]/.test(cmd)) flags.push('-interaction=nonstopmode');
	if (!/-file-line-error\b/.test(cmd)) flags.push('-file-line-error');
	return flags.length > 0 ? cmd.replace(hit[1], `${hit[1]} ${flags.join(' ')}`) : cmd;
}

export interface CompileDeps {
	getLoadedPath(): string | null;
	/** the reactive compile command; {main} expands to the main file's path. */
	getCompileCommand(): string;
	terminalAvailable(): boolean;
	/** first-compile main-file confirmation state (null = unresolved for the current folder). */
	mainConfirmed(): boolean | null;
	getSession(): EditSession;
	getDock(): { runCommand(cmd: string, onDone?: (output: string) => void): void; interrupt(): void } | undefined;
	stat(path: string): Promise<{ exists: boolean; mtimeMs: number; size: number }>;
	readText(path: string): Promise<string>;
	create(path: string, type: 'file' | 'dir'): Promise<unknown>;
	fileUrl(path: string): string;
	/** flush the queued autosave and wait for it to land (SyncTeX needs the on-disk copy current). */
	flushSaves(): Promise<void>;
	refreshTree(): Promise<void>;
	showTerminal(): void;
	setDockView(view: 'terminal' | 'problems'): void;
	setPdfPaneOpen(open: boolean): void;
	openCompileModal(): void;
	openMainConfirm(then?: () => void): void;
	runDraftCompile(): Promise<void>;
	/** publish the parsed compile products (aux numbers + diagnostics) to session guests. */
	shareCompileState(): void;
}

export class CompilePipeline {
	// true from Compile until the run visibly ends (PDF landed, log settled, or timeout);
	// drives the Compile button's Stop toggle, and Stop sends Ctrl+C to the shell
	compiling = $state(false);
	pdfFilename = $state('output.pdf');
	private pdfWatchTimer: ReturnType<typeof setTimeout> | null = null;
	private logWatchTimer: ReturnType<typeof setTimeout> | null = null;
	// bumped when a compile starts, ends, or the folder changes; pollers from a superseded run
	// check it and stand down (their timeout may already be in flight when the timers are cleared)
	private compileGen = 0;
	// dvipdfmx/xdvipdfmx write diagnostics to stdout, not the .log; captured per compile by the
	// terminal's sentinel tracking and cleared at the start of each run
	private compileStdout = '';

	constructor(private deps: CompileDeps) {}

	stopCompile = () => {
		this.deps.getDock()?.interrupt();
		this.compiling = false;
	};

	// the folder changed: any pollers still watching the previous folder's paths stand down
	resetForFolder = () => {
		this.compiling = false;
		this.compileGen++;
	};

	// component teardown: stop the pollers
	dispose = () => {
		if (this.pdfWatchTimer) clearTimeout(this.pdfWatchTimer);
		if (this.logWatchTimer) clearTimeout(this.logWatchTimer);
	};

	// expand {main} to the project's main file (relative to the folder root), else the open file
	private resolvedCompileCommand(cmd: string): string {
		const root = get(workspaceRoot);
		const target = get(mainFile) ?? this.deps.getLoadedPath();
		const rel = root && target ? relFromRoot(target, root) : '';
		// quote a path containing spaces so the shell keeps it one argument;
		// a {main} the user already wrapped in quotes stays untouched
		const quoted = /\s/.test(rel) ? `"${rel}"` : rel;
		// function replacements so a path containing $&, $1, $` etc. is inserted literally, not as a
		// replacement-pattern reference
		return cmd.replace(/(["']){main}\1/g, (_m, q: string) => `${q}${rel}${q}`).replaceAll('{main}', () => quoted);
	}

	// show the terminal, wait for mount, then run (the shell queues the command until it has
	// spawned). onDone fires when the shell reports the line finished (Terminal.run's sentinel echo).
	private runInTerminal(cmd: string, onDone?: (output: string) => void, tries = 0) {
		const dock = this.deps.getDock();
		if (dock) {
			dock.runCommand(cmd, onDone);
			return;
		}
		if (tries < 40) setTimeout(() => this.runInTerminal(cmd, onDone, tries + 1), 25); // ~1s for the dock to mount
	}

	runCompile = async () => {
		// first compile in a folder with no explicitly chosen main file: confirm it first
		if (this.deps.mainConfirmed() !== true && get(texFiles).length > 1) {
			this.deps.openMainConfirm(() => void this.runCompile());
			return;
		}
		if (get(settings).draftMode) {
			await this.deps.runDraftCompile();
			return;
		}
		if (!this.deps.terminalAvailable()) return;
		const cmd = this.deps.getCompileCommand().trim();
		// no command yet: ask in the modal first
		if (!cmd) {
			this.deps.openCompileModal();
			return;
		}
		// {main} with no main file: a truly empty folder has nothing to compile; otherwise the user
		// cleared the main file, so let them pick one (then compile). Dismissing leaves it unset.
		if (cmd.includes('{main}') && !get(mainFile)) {
			if (get(texFiles).length === 0) {
				toaster.error({ title: m.wsview_toast_nothing_to_compile_title(), description: m.wsview_toast_nothing_to_compile_desc() });
			} else {
				this.deps.openMainConfirm(() => {
					if (get(mainFile)) void this.runCompile();
				});
			}
			return;
		}
		// shared session: guests can inject LaTeX the host compiles, so shell escape stays off
		if (this.deps.getSession().active && /(^|[^-\w])(-{1,2}shell-escape|-{1,2}enable-write18)\b/.test(cmd)) {
			toaster.error({ title: m.wsview_toast_shell_escape_blocked(), duration: 5000 });
			return;
		}
		// write the buffer to disk BEFORE compiling so SyncTeX indexes exactly what the editor
		// holds; otherwise reverse search maps PDF clicks into a stale, differently formatted .tex
		await this.deps.flushSaves();
		const pdfPath = this.expectedPdfPath();
		const before = pdfPath ? (await this.deps.stat(pdfPath)).mtimeMs : 0; // baseline BEFORE compiling
		const logPath = this.expectedLogPath();
		const logBefore = logPath ? (await this.deps.stat(logPath)).mtimeMs : 0;
		await this.ensureOutputDir();
		this.deps.refreshTree(); // the output/ folder may have just been created
		this.deps.showTerminal();
		// marker off = no end signal from the shell; leave the button as Compile instead of a
		// Stop that would linger until the log/PDF pollers time out
		const track = get(settings).compileSentinel;
		this.compiling = track;
		const gen = ++this.compileGen;
		this.compileStdout = '';
		this.runInTerminal(
			withBatchFlags(this.resolvedCompileCommand(cmd)),
			track
				? (output) => {
						this.compileStdout = output ?? ''; // dvipdfmx/xdvipdfmx diagnostics only exist here
						this.finalizeCompile(gen, pdfPath, before, logPath, logBefore);
					}
				: undefined
		);
		// with the completion marker on, finalizeCompile loads the finished PDF once the command
		// exits. Don't ALSO poll-load here: LaTeX rewrites the PDF across passes (and truncates it
		// mid-write), so an early poll would load a partial/pass-1 PDF, then finalize reloads the
		// final one -- a double reload that flashes. Without the marker there's no exit signal, so
		// watchPdf is the fallback, and it now waits for the file to stop changing before loading.
		if (!track && pdfPath) this.watchPdf(gen, pdfPath, before);
		if (logPath) this.watchLog(gen, logPath, logBefore);
		// reload the explorer as the build writes its output (also covers builds that produce no PDF)
		[2000, 6000].forEach((d) => setTimeout(this.deps.refreshTree, d));
	};

	// the output dir named in the command (-output-directory= / -outdir=), else the folder root.
	// takes an explicit command so callers that run before compileCommand hydrates can pass the settings value.
	// compile-command parsing/generation lives in compileCommand.ts; these thin wrappers supply the
	// reactive root / main-file / per-folder overrides the pure functions take as arguments
	expectedPdfPath = (cmd = this.deps.getCompileCommand()): string | null => {
		const root = get(workspaceRoot);
		return cc.expectedPdfPath(cmd, root, get(mainFile) ?? this.deps.getLoadedPath(), root ? savedCompileOutputs(root).pdf : undefined);
	};
	expectedLogPath = (cmd = this.deps.getCompileCommand()): string | null => {
		const root = get(workspaceRoot);
		return cc.expectedLogPath(cmd, root, get(mainFile) ?? this.deps.getLoadedPath(), root ? savedCompileOutputs(root) : undefined);
	};

	// read the .log plus the sibling .blg (it reflects the LAST bib run, which stays valid
	// even on compiles where latexmk skips bibtex) and publish the parsed problems
	publishLogDiagnostics = async (logPath: string, mtimeMs: number, quiet = false) => {
		const blgPath = logPath.replace(/\.log$/i, '.blg');
		const blgText = (await this.deps.stat(blgPath)).exists ? await this.deps.readText(blgPath) : null;
		const parsed = await parseCompileDiagnosticsInWorker(await this.deps.readText(logPath), blgText, this.compileStdout || null);
		// bib warnings name a key ("empty journal in Smith2020"); projectIntel knows every
		// entry's exact line, so point the row at it (LW resolves these via its citation cache)
		const bibEntries = get(projectIntelStore).bibEntries;
		for (const e of parsed.entries) {
			if (e.source !== 'bib' || e.line !== undefined) continue;
			const key = e.message.match(/\bin ['"]?([\w:.-]+)['"]?$/) ?? e.message.match(/\bentry '([^']+)'/);
			const hit = key ? bibEntries.find((b) => b.key === key[1]) : undefined;
			if (hit) {
				e.file = hit.file;
				e.line = hit.line;
			}
		}
		compileLog.set({ ...parsed, logPath, updatedAt: mtimeMs });
		this.deps.shareCompileState(); // guests get the fresh diagnostics without waiting for the intel rescan
		// a failed build produces no fresh PDF, so nothing else tells the user: surface the
		// Problems list. clean/warning-only results never steal the dock. (quiet = a baseline share
		// on session start, which shouldn't yank the host's dock open.)
		if (!quiet && parsed.errors.length > 0) {
			this.deps.setDockView('problems');
			this.deps.showTerminal();
		}
	};

	// poll the .log and parse once it settles: the engine rewrites the log during each pass, so
	// "newer than baseline AND unchanged across two polls" is the engine-agnostic completion signal
	// (a multi-pass latexmk run just re-parses after each later pass). also catches failed builds,
	// where no PDF ever appears but the log does.
	private watchLog(
		gen: number,
		logPath: string,
		before: number,
		elapsed = 0,
		prev: { mtimeMs: number; size: number } | null = null,
		lastParsed = 0
	) {
		if (this.logWatchTimer) clearTimeout(this.logWatchTimer);
		this.logWatchTimer = setTimeout(async () => {
			if (gen !== this.compileGen) return; // superseded: a newer compile, finalize, or folder switch
			const s = await this.deps.stat(logPath);
			const changedSinceCompile = s.exists && s.size > 0 && s.mtimeMs > before;
			const stable = prev !== null && s.mtimeMs === prev.mtimeMs && s.size === prev.size;
			if (changedSinceCompile && stable && s.mtimeMs !== lastParsed) {
				try {
					await this.publishLogDiagnostics(logPath, s.mtimeMs);
					this.compiling = false; // a settled log means the run (or its final pass) ended
					lastParsed = s.mtimeMs;
				} catch {
					/* transient read race with the engine; next poll retries */
				}
			}
			if (elapsed < 180000) {
				this.watchLog(gen, logPath, before, elapsed + 1200, { mtimeMs: s.mtimeMs, size: s.size }, lastParsed);
			} else {
				this.logWatchTimer = null;
				this.compiling = false;
			}
		}, 1200);
	}

	// the shell reported the command finished (sentinel echo). the pollers only notice runs that
	// WRITE something; a run that dies without touching the log or PDF would leave Stop showing
	// until their timeout. give trailing writes a beat, check both artifacts once, stand pollers down.
	private finalizeCompile(gen: number, pdfPath: string | null, pdfBefore: number, logPath: string | null, logBefore: number) {
		setTimeout(async () => {
			if (gen !== this.compileGen) return; // a newer compile or a folder switch took over
			this.compileGen++; // this run is over; its pollers stand down
			if (this.pdfWatchTimer) {
				clearTimeout(this.pdfWatchTimer);
				this.pdfWatchTimer = null;
			}
			if (this.logWatchTimer) {
				clearTimeout(this.logWatchTimer);
				this.logWatchTimer = null;
			}
			try {
				if (logPath) {
					const s = await this.deps.stat(logPath);
					if (s.exists && s.size > 0 && s.mtimeMs > logBefore) await this.publishLogDiagnostics(logPath, s.mtimeMs);
				}
				if (pdfPath) {
					const s = await this.deps.stat(pdfPath);
					if (s.exists && s.size > 0 && s.mtimeMs > pdfBefore) this.showCompiledPdf(pdfPath, s.mtimeMs);
				}
			} catch {
				/* fs hiccup: the run still ended, the button must still reset */
			}
			this.compiling = false;
			this.deps.refreshTree();
		}, 400);
	}

	private async ensureOutputDir() {
		const root = get(workspaceRoot);
		const dir = cc.compileOutDir(this.deps.getCompileCommand());
		if (root && dir !== '.') {
			try {
				await this.deps.create(joinPath(root, dir), 'dir'); // mkdir -p, idempotent
			} catch {
				/* already exists */
			}
		}
	}

	// load a freshly compiled PDF into the pane; no-op if this exact build is already
	// shown so the poller and finalizeCompile can't reload it twice
	private showCompiledPdf(pdfPath: string, mtimeMs: number) {
		void this.deps.getSession().pushPdf(pdfPath); // shared session: guests get the fresh bytes
		const url = this.deps.fileUrl(pdfPath) + '&t=' + Math.round(mtimeMs); // cache-bust so it reloads
		if (get(pdfStore) === url) return;
		this.pdfFilename = basename(pdfPath);
		pdfStore.set(url);
		this.deps.setPdfPaneOpen(true);
		this.deps.refreshTree(); // the compiled output landed; reload the file explorer
	}

	// A joiner needs the CURRENT pdf + log even when no fresh compile happens: latexmk skips
	// rebuilding an up-to-date project, so finalizeCompile's mtime gate never fires and nothing is
	// pushed. Read what's on disk (located via our own compile command) and share it once when we
	// start hosting; guests request the pdf off the published rev and read the log from doc meta.
	shareExistingOutputs = async () => {
		const session = this.deps.getSession();
		if (!session.active || session.isGuest) return;
		const pdfPath = this.expectedPdfPath();
		if (pdfPath) {
			const s = await this.deps.stat(pdfPath);
			if (s.exists && s.size > 0) await session.pushPdf(pdfPath);
		}
		const logPath = this.expectedLogPath();
		if (logPath) {
			const s = await this.deps.stat(logPath);
			if (s.exists && s.size > 0) await this.publishLogDiagnostics(logPath, s.mtimeMs, true);
		}
	};

	// poll the expected PDF after a compile (no-completion-marker fallback); load it once it has
	// stopped changing, so a mid-write partial or an intermediate latexmk pass isn't shown. `stableAt`
	// is the mtime seen on the previous poll; a match means the file settled.
	private watchPdf(gen: number, pdfPath: string, before: number, elapsed = 0, stableAt = 0) {
		if (this.pdfWatchTimer) clearTimeout(this.pdfWatchTimer);
		this.pdfWatchTimer = setTimeout(
			async () => {
				if (gen !== this.compileGen) return; // superseded: a newer compile, finalize, or folder switch
				const s = await this.deps.stat(pdfPath);
				if (s.exists && s.size > 0 && s.mtimeMs > before) {
					if (s.mtimeMs === stableAt) {
						this.showCompiledPdf(pdfPath, s.mtimeMs); // unchanged since the last poll: it's done
						this.pdfWatchTimer = null;
						this.compiling = false;
					} else {
						this.watchPdf(gen, pdfPath, before, elapsed + 600, s.mtimeMs); // still changing: re-check soon
					}
				} else if (elapsed < 180000) {
					this.watchPdf(gen, pdfPath, before, elapsed + 1200); // keep polling up to 3 min
				} else {
					this.pdfWatchTimer = null;
					this.compiling = false;
				}
			},
			stableAt ? 600 : 1200 // poll faster once the file has started changing, to catch it settling
		);
	}

	// on load and main-file change, show the already-compiled PDF sitting on disk; clears the
	// preview when the expected PDF is absent so a stale one doesn't linger. runs only at
	// init/folder-open/main-change, never mid-compile, so it can't race watchPdf.
	loadExistingPdf = async () => {
		// read the persisted command directly: on first mount this can run before the
		// reactive compileCommand is hydrated, and a stale '' would point at the wrong folder
		const s0 = await loadSettings();
		const pdfPath = this.expectedPdfPath(resolveCompileCommand(get(workspaceRoot), s0.compileCommand));
		if (!pdfPath) {
			pdfStore.set(null);
			return;
		}
		const s = await this.deps.stat(pdfPath);
		if (s.exists && s.size > 0) {
			this.pdfFilename = basename(pdfPath);
			pdfStore.set(this.deps.fileUrl(pdfPath) + '&t=' + Math.round(s.mtimeMs)); // mtime cache-busts a stale load
			this.deps.setPdfPaneOpen(true); // a compiled PDF is ready; open the preview so a reload shows it
		} else {
			pdfStore.set(null);
		}
	};
}
