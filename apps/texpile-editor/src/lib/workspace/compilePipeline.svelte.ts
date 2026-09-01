// compile / terminal / PDF-watch orchestration: resolve the command, run it in the terminal dock,
// poll the log + PDF until the run settles, publish parsed diagnostics and the fresh PDF.
// WorkspaceView wires the deps.
import { compileLog, rebaseLogFile } from '$lib/stores/compileLogStore';
import { parseCompileDiagnosticsInWorker } from '$lib/compileLog/parseInWorker';
import { pdfStore } from '$lib/stores/pdfStore';
import { projectIntelStore } from '$lib/stores/projectIntel';
import { settings } from '$lib/settings';
import { compileConfig } from './projectConfigSync.svelte';
import { workspaceRoot, mainFile, texFiles, effectiveCompileFormat, savedMainFile } from './workspaceStore';
import * as cc from './compileCommand';
import { expandMain, relFromRoot, resolveCompileCommand, withBatchFlags } from './compileResolve';
import type { CompileDeps } from './compileDeps';
import { CompileWatchers } from './compileWatchers';

export { relFromRoot, resolveCompileCommand, resolveFormatCommand } from './compileResolve';
export type { CompileDeps } from './compileDeps';
import { drivesTypst, isTypstCommand } from './typstCommand';
import { basename, joinPath, samePath } from './fileSystem';
import { toaster } from '$lib/modals/toaster-svelte';
import { reportMissingTool } from './toolMissing';
import { m } from '$lib/paraglide/messages';

export class CompilePipeline {
	// true from Compile until the run visibly ends (PDF landed, log settled, or timeout);
	// drives the Compile button's Stop toggle, and Stop sends Ctrl+C to the shell
	compiling = $state(false);
	// A run has been dispatched and is not yet known to have finished. Deliberately separate from
	// `compiling`, which stays false when the completion marker is off so the button does not show a
	// Stop that would linger until the pollers time out. This one is always set, because refusing an
	// overlapping compile has to work whether or not the marker is on.
	busy = $state(false);
	pdfFilename = $state('output.pdf');
	// bumped when a run ends. A finished compile is the only thing that rewrites the .aux, and the
	// project intel rescan has no other way to hear that its label numbers are stale.
	runsFinished = $state(0);
	private watchers = new CompileWatchers({
		isCurrent: (gen) => gen === this.compileGen,
		stat: (p) => this.deps.stat(p),
		showCompiledPdf: (p, mtimeMs) => this.showCompiledPdf(p, mtimeMs),
		publishLog: (logPath, mtimeMs) => this.publishLogDiagnostics(logPath, mtimeMs),
		logMayBeEmpty: () => this.logMayBeEmpty(),
		endRun: () => this.endRun()
	});
	// bumped when a compile starts, ends, or the folder changes; pollers from a superseded run
	// check it and stand down (their timeout may already be in flight when the timers are cleared)
	private compileGen = 0;
	// dvipdfmx/xdvipdfmx write diagnostics to stdout, not the .log; captured per compile by the
	// terminal's sentinel tracking and cleared at the start of each run
	private compileStdout = '';

	constructor(private deps: CompileDeps) {}

	/** a run ended (or was stopped): clear both the button state and the overlap guard */
	private endRun() {
		// only a real transition counts: endRun is reached from the watchers, from Stop, and from
		// the failure paths, and a rescan per call would be several per compile
		if (this.compiling || this.busy) this.runsFinished++;
		this.compiling = false;
		this.busy = false;
	}

	stopCompile = () => {
		this.deps.getDock()?.interrupt();
		this.endRun();
	};

	// the folder changed: any pollers still watching the previous folder's paths stand down
	resetForFolder = () => {
		this.endRun();
		this.compileGen++;
	};

	// component teardown: stop the pollers
	dispose = () => this.watchers.dispose();

	// expand {main} to the project's main file (relative to the folder root), else the open file
	private resolvedCompileCommand(cmd: string): string {
		return expandMain(cmd, workspaceRoot.current, mainFile.current ?? this.deps.getLoadedPath());
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
		// One run at a time. The Compile button becomes Stop so a local user rarely gets here twice,
		// but the shortcut and shared-session guests both reach this directly - and a guest can fire
		// requests as fast as they like. Overlapping runs fight over the same aux/output files and
		// queue up in the shell, so the second one is refused rather than deferred. Draft mode is
		// exempt by construction: it never sets `busy`, because its service supersedes an in-flight
		// run of the same root instead, which is what makes it usable as a live preview.
		if (this.busy) {
			toaster.info({ title: m.wsview_toast_compile_busy(), duration: 2500 });
			return;
		}
		// The project asks for a command this machine has not accepted. Held here rather than at the
		// button, because the button is one of seven ways in: the keybinding, the compile window
		// event, the palette, MCP, Save & run, the first-compile confirm, and a GUEST asking the host
		// to compile. Gating the entry point is what makes "nothing runs until you decide" true
		// rather than merely apparent.
		//
		// Draft mode and the Typst preview are deliberately NOT gated: they drive built-in engines
		// and never execute the project's command, so stopping them would cost a live preview to
		// answer a question about a shell string they do not run.
		if (this.deps.commandPending()) {
			toaster.warning({ title: m.project_command_blocked_title(), description: m.project_command_blocked_desc(), duration: 5000 });
			return;
		}
		// first compile in a folder with no explicitly chosen main file: confirm it first
		if (this.deps.mainConfirmed() !== true && texFiles.current.length > 1) {
			this.deps.openMainConfirm(() => void this.runCompile());
			return;
		}
		// No main file at all, in a folder that has candidates: pick one, then compile. EVERY lane
		// below needs the main now - the shell command expands {main}, draft mode and the Typst
		// preview are pinned to it - so one gate here beats each branch failing its own way (the
		// draft path used to land in the compile-command modal instead of compiling). Guarded on a
		// main actually existing afterwards: a dismissed prompt in a folder where detection came up
		// empty must close, not reopen itself forever.
		if (!mainFile.current && texFiles.current.length > 0) {
			this.deps.openMainConfirm(() => {
				if (mainFile.current) void this.runCompile();
			});
			return;
		}
		// Resolved fresh, not read from the cached deps command: the main-confirm dialog above
		// re-enters this synchronously after setMainFile, before the $effect refreshing the cache
		// runs - the stale cache once ran latexmk on a freshly chosen .typ main.
		const cmd = resolveCompileCommand(mainFile.current).trim();
		// Live mode IS the incremental lualatex pipeline, so it cannot serve a Typst project. The
		// setting is global and the user may arrive here with it left on from a LaTeX folder, so
		// ignore it rather than trapping them - the terminal command below is the correct build.
		if (compileConfig.current.latex.liveMode && !isTypstCommand(cmd)) {
			await this.deps.runDraftCompile();
			return;
		}
		// Preview is Typst's live path, exactly as draft mode is LaTeX's: it renders through the
		// language server, so a shell run would only produce a PDF nobody is looking at. Compile
		// therefore opens (or refreshes) the preview pane instead, and the modal says so.
		//
		// In a shared session too: the preview's data plane is relayed to guests (previewRelay), so
		// opening it here is answering a guest's compile request, not ignoring it.
		if (compileConfig.current.typst.preview && isTypstCommand(cmd)) {
			this.deps.openTypstPreview();
			return;
		}
		if (!this.deps.terminalAvailable()) return;
		// no command yet: ask in the modal first
		if (!cmd) {
			this.deps.openCompileModal();
			return;
		}
		// {main} with no main file: only reachable in a folder with nothing to pick (the mainless
		// gate above prompts otherwise), and a truly empty folder has nothing to compile
		if (cmd.includes('{main}') && !mainFile.current) {
			toaster.error({ title: m.wsview_toast_nothing_to_compile_title(), description: m.wsview_toast_nothing_to_compile_desc() });
			return;
		}
		// shared session: guests can inject LaTeX the host compiles, so shell escape stays off
		if (this.deps.getSession().active && /(^|[^-\w])(-{1,2}shell-escape|-{1,2}enable-write18)\b/.test(cmd)) {
			toaster.error({ title: m.wsview_toast_shell_escape_blocked(), duration: 5000 });
			return;
		}
		// Claim the slot BEFORE the first await, not down with `compiling`.
		//
		// The overlap guard above (and the collab handler's isBusy()) used to read this flag four
		// awaits before anything set it - flushSaves, two stats and the mkdir all ran while it was
		// still false. Two compiles starting inside that window both passed, and two latexmk runs
		// then shared one directory's .aux / .pdf / .synctex. A double-click did it; no malice or
		// shared session required.
		//
		// Every early return above is synchronous, and the draft path returns before here and never
		// sets busy by design, so claiming it at this point needs no unwinding.
		this.busy = true;
		// write the buffer to disk BEFORE compiling so SyncTeX indexes exactly what the editor
		// holds; otherwise reverse search maps PDF clicks into a stale, differently formatted .tex
		await this.deps.flushSaves();
		const pdfPath = this.expectedPdfPath(cmd);
		const before = pdfPath ? (await this.deps.stat(pdfPath)).mtimeMs : 0; // baseline BEFORE compiling
		const logPath = this.expectedLogPath(cmd);
		const logBefore = logPath ? (await this.deps.stat(logPath)).mtimeMs : 0;
		await this.ensureOutputDir(cmd);
		this.deps.refreshTree(); // the output/ folder may have just been created
		// opt-out ergonomics: with the dock closed by choice, a compile should not reopen it. The
		// button's own running state is the progress indicator then (see openDockOnCompile).
		if (settings.current.openDockOnCompile) this.deps.showTerminal();
		// marker off = no end signal from the shell; leave the button as Compile instead of a
		// Stop that would linger until the log/PDF pollers time out
		const track = compileConfig.current.completionMarker;
		this.compiling = track;
		this.busy = true; // set even without the marker: the overlap guard must not depend on it
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
		if (!track && pdfPath) this.watchers.watchPdf(gen, pdfPath, before);
		if (logPath) this.watchers.watchLog(gen, logPath, logBefore, track);
		// reload the explorer as the build writes its output (also covers builds that produce no PDF)
		[2000, 6000].forEach((d) => setTimeout(this.deps.refreshTree, d));
	};

	// the output dir named in the command (-output-directory= / -outdir=), else the folder root.
	// takes an explicit command so callers that run before compileCommand hydrates can pass the settings value.
	// compile-command parsing/generation lives in compileCommand.ts; these thin wrappers supply the
	// reactive root / main-file / per-folder overrides the pure functions take as arguments
	expectedPdfPath = (cmd = this.deps.getCompileCommand()): string | null => {
		const root = workspaceRoot.current;
		const main = mainFile.current ?? this.deps.getLoadedPath();
		return cc.expectedPdfPath(cmd, root, main, compileConfig.current[effectiveCompileFormat(main)].outputs.pdf);
	};

	// A zero-byte log means "the engine never really ran" for TeX, so it is ignored — but for Typst
	// it means the opposite: stderr was empty, i.e. the document compiled clean. Without this the
	// Problems panel would keep showing the previous failing run's errors after a good compile.
	// drivesTypst, not isTypstCommand: a `cd .. && tinymist ...` line compiles Typst all the same.
	private logMayBeEmpty = (cmd = this.deps.getCompileCommand()): boolean => drivesTypst(cmd);

	expectedLogPath = (cmd = this.deps.getCompileCommand()): string | null => {
		const root = workspaceRoot.current;
		const main = mainFile.current ?? this.deps.getLoadedPath();
		return cc.expectedLogPath(cmd, root, main, compileConfig.current[effectiveCompileFormat(main)].outputs);
	};

	// the directory the command runs in; differs from the root only under latexmk -cd
	private compileBaseDir = (cmd = this.deps.getCompileCommand()): string | null =>
		cc.compileBaseDir(cmd, workspaceRoot.current, mainFile.current ?? this.deps.getLoadedPath());

	// read the .log plus the sibling .blg (it reflects the LAST bib run, which stays valid
	// even on compiles where latexmk skips bibtex) and publish the parsed problems
	// stdout defaults to the last run's, which is right for the compile that produced it. The live
	// preview's own compile has none, and inheriting a stale one would attribute a previous run's
	// stdout-only errors to this log -- so that caller passes null explicitly.
	publishLogDiagnostics = async (logPath: string, mtimeMs: number, quiet = false, stdout: string | null = this.compileStdout || null) => {
		const blgPath = logPath.replace(/\.log$/i, '.blg');
		const blgText = (await this.deps.stat(blgPath)).exists ? await this.deps.readText(blgPath) : null;
		const parsed = await parseCompileDiagnosticsInWorker(await this.deps.readText(logPath), blgText, stdout);
		// under -cd the engine printed its paths relative to the main file's folder; make them
		// root-relative, the shape every consumer below resolves against. Skipped when the base IS
		// the root, so the ordinary case is byte-identical to before.
		const root = workspaceRoot.current;
		const base = this.compileBaseDir();
		if (root && base && !samePath(base, root)) {
			for (const e of parsed.entries) if (e.file) e.file = rebaseLogFile(e.file, base, root);
		}
		// bib warnings name a key ("empty journal in Smith2020"); projectIntel knows every
		// entry's exact line, so point the row at it (LW resolves these via its citation cache)
		const bibEntries = projectIntelStore.current.bibEntries;
		for (const e of parsed.entries) {
			if (e.source !== 'bib' || e.line !== undefined) continue;
			const key = e.message.match(/\bin ['"]?([\w:.-]+)['"]?$/) ?? e.message.match(/\bentry '([^']+)'/);
			const hit = key ? bibEntries.find((b) => b.key === key[1]) : undefined;
			if (hit) {
				e.file = hit.file;
				e.line = hit.line;
			}
		}
		compileLog.current = { ...parsed, logPath, updatedAt: mtimeMs };
		this.deps.shareCompileState(); // guests get the fresh diagnostics without waiting for the intel rescan
		// a failed build produces no fresh PDF, so nothing else tells the user: surface the
		// Problems list. clean/warning-only results never steal the dock. (quiet = a baseline share
		// on session start, which shouldn't yank the host's dock open.) openDockOnCompile off
		// silences this too - a chronically-erroring LaTeX doc that still builds would otherwise
		// have the dock stolen every run; the topbar badge carries the signal instead.
		if (!quiet && parsed.errors.length > 0 && settings.current.openDockOnCompile) {
			this.deps.setDockView('problems');
			this.deps.showTerminal();
		}
	};

	// the shell reported the command finished (sentinel echo). the pollers only notice runs that
	// WRITE something; a run that dies without touching the log or PDF would leave Stop showing
	// until their timeout. give trailing writes a beat, check both artifacts once, stand pollers down.
	private finalizeCompile(gen: number, pdfPath: string | null, pdfBefore: number, logPath: string | null, logBefore: number) {
		setTimeout(async () => {
			if (gen !== this.compileGen) return; // a newer compile or a folder switch took over
			this.compileGen++; // this run is over; its pollers stand down
			this.watchers.dispose();
			let logAdvanced = false;
			let pdfExists = true; // benefit of the doubt on an fs hiccup: no warning then
			try {
				if (logPath) {
					const s = await this.deps.stat(logPath);
					logAdvanced = s.exists && (s.size > 0 || this.logMayBeEmpty()) && s.mtimeMs > logBefore;
					if (logAdvanced) await this.publishLogDiagnostics(logPath, s.mtimeMs);
				}
				if (pdfPath) {
					const s = await this.deps.stat(pdfPath);
					pdfExists = s.exists;
					if (s.exists && s.size > 0 && s.mtimeMs > pdfBefore) this.showCompiledPdf(pdfPath, s.mtimeMs);
				}
			} catch {
				/* fs hiccup: the run still ended, the button must still reset */
			}
			const toolMissing = await reportMissingTool({
				cmd: this.deps.getCompileCommand(),
				stdout: this.compileStdout,
				baseDir: this.compileBaseDir(),
				logPath,
				readText: (p) => this.deps.readText(p)
			});
			// The command exited, no log advanced and the watched PDF path holds nothing: the build
			// wrote somewhere the app is not watching (a cd-prefixed command, say), and every panel
			// would stay silent while the user reads that as "compiled ok". An up-to-date rebuild is
			// exempt: its PDF exists. Say where we looked and point at the output overrides.
			if (!toolMissing && pdfPath && !pdfExists && !logAdvanced) {
				const root = workspaceRoot.current;
				toaster.warning({
					title: m.compile_no_output_title(),
					description: m.compile_no_output({ path: root ? relFromRoot(pdfPath, root) : pdfPath }),
					duration: 10000,
					action: { label: m.compile_no_output_action(), onClick: () => this.deps.openCompileModal() }
				});
			}
			this.endRun();
			this.deps.refreshTree();
		}, 400);
	}

	private async ensureOutputDir(cmd = this.deps.getCompileCommand()) {
		// the output dir is relative to where the command RUNS, which -cd moves into the main file's
		// folder; joining the root there would create a stray empty output/ beside the workspace
		const base = this.compileBaseDir(cmd);
		const dir = cc.compileOutDir(cmd);
		if (base && dir !== '.') {
			try {
				await this.deps.create(joinPath(base, dir), 'dir'); // mkdir -p, idempotent
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
		if (pdfStore.current === url) return;
		this.pdfFilename = basename(pdfPath);
		pdfStore.current = url;
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

	// on load and main-file change, show the already-compiled PDF sitting on disk; clears the
	// preview when the expected PDF is absent so a stale one doesn't linger. runs only at
	// init/folder-open/main-change, never mid-compile, so it can't race watchPdf.
	loadExistingPdf = async () => {
		// the persisted main file, so a folder resolves its real format even before the
		// reactive mainFile store hydrates. The command comes from the adopted config, which
		// projectConfigSync.adopt() fills before this runs (initProject sequences them).
		const bootRoot = workspaceRoot.current;
		const pdfPath = this.expectedPdfPath(resolveCompileCommand(bootRoot ? savedMainFile(bootRoot) : null));
		if (!pdfPath) {
			pdfStore.current = null;
			return;
		}
		const s = await this.deps.stat(pdfPath);
		if (s.exists && s.size > 0) {
			this.pdfFilename = basename(pdfPath);
			pdfStore.current = this.deps.fileUrl(pdfPath) + '&t=' + Math.round(s.mtimeMs); // mtime cache-busts a stale load
			this.deps.setPdfPaneOpen(true); // a compiled PDF is ready; open the preview so a reload shows it
		} else {
			pdfStore.current = null;
		}
	};
}
