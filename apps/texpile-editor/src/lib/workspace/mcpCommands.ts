// Renderer end of the MCP tools: answering requests main cannot serve from its state cache, and
// carrying out the steer commands. Nothing here writes a document - the connected agent has its own
// file tools for that, and keeping writes out is what makes this surface safe. The comment tools
// (mcpComments.ts) write the comment log only, never a document.
import { browser } from '$lib/runtime';
import { workspaceRoot, isDirty, mainFile, texFiles, effectiveCompileFormat } from './workspaceStore';
import { isGitRepo, refreshGitStatus } from './gitStore';
import { compileLog } from '$lib/stores/compileLogStore';
import { settings } from '$lib/settings';
import { compileConfig } from './projectConfigSync.svelte';
import { relativeTo, samePath } from './fileSystem';
import { inOpenTree, resolveInWorkspace } from './mcpWorkspacePath';
import {
	addCommentPayload,
	commentsPayload,
	reanchorCommentPayload,
	replyCommentPayload,
	resolveCommentPayload,
	type McpCommentDeps
} from './mcpComments';
import {
	compileOutDir,
	detectEngine,
	expectedLogPath,
	expectedPdfPath,
	outputPathIssue,
	sanitizeOutputDir,
	usesLatexmk,
	withOutputDir
} from './compileCommand';

export type McpCommandDeps = {
	/** the open file's absolute path */
	getLoadedPath(): string | null;
	/** the live buffer for whichever kind is open */
	getBuffer(): string;
	/** open a file (already resolved to absolute) without changing view mode */
	openFile(abs: string): void;
	/** open at a 1-based line; switches to Source, where a line number is meaningful */
	openFileAtLine(abs: string, line: number): void;
	showDiff(): void;
	setViewMode(mode: 'visual' | 'source' | 'diff'): void;
	/** the mode actually in effect, so a refused switch can be reported instead of assumed */
	getViewMode(): 'visual' | 'source' | 'diff';
	/** forward SyncTeX: move the PDF pane to where a source line renders */
	syncToLine(line: number): void;
	/** run the project's configured compile, exactly as the toolbar button does */
	runCompile(): void;
	/** set (or, with null, clear) the project's main file. Explicit, never a toggle. */
	setMainFile(abs: string | null): Promise<void>;
	/** a run is dispatched and not yet known to have finished, so the published log predates it */
	isCompiling(): boolean;
	/** the compile command in effect for this folder, with {main} still unexpanded */
	getCompileCommand(): string;
	/** persist a command and/or the folder's PDF/log overrides; both optional, see applyCommand */
	applyCompile(command?: string, outputs?: { pdf?: string; log?: string }): void;
	/** the review-comment tools; see mcpComments.ts */
	comments: McpCommentDeps;
};

type NativeMcp = {
	onMcpRequest?: (cb: (req: { id: number; kind: string; args?: Record<string, unknown> }) => void) => () => void;
	mcpRespond?: (id: number, payload: unknown) => void;
	onMcpCommand?: (cb: (cmd: Record<string, unknown>) => void) => () => void;
};
function nativeBridge(): NativeMcp | undefined {
	if (!browser) return undefined;
	return (window as unknown as { texpileNative?: NativeMcp }).texpileNative;
}

/** cap: a whole compile's warnings can run to hundreds, and an agent needs the first ones, not all */
const MAX_DIAGNOSTICS = 50;

function unsavedPayload(deps: McpCommandDeps) {
	const path = deps.getLoadedPath();
	const root = workspaceRoot.current;
	// Only the active file has a buffer, so it is the only one that can be dirty. Clean means disk
	// is authoritative, and saying so explicitly is more useful than an empty string the agent has
	// to guess about.
	if (!path || !isDirty.current) return { dirty: false, content: null, path: path && root ? relativeTo(root, path) : path };
	return { dirty: true, path: root ? relativeTo(root, path) : path, content: deps.getBuffer() };
}

/** ISO stamp of the log the published diagnostics were parsed from; null before any compile */
function publishedAt(): string | null {
	const log = compileLog.current;
	return log ? new Date(log.updatedAt).toISOString() : null;
}

function diagnosticsPayload(deps: McpCommandDeps) {
	const log = compileLog.current;
	// THE field this tool turns on. `compile` returns the moment it dispatches, and the log is only
	// republished once it has settled seconds later - so an agent polling in between reads the
	// PREVIOUS run's numbers with nothing marking them as such. Errors seldom differ between two runs
	// and so looked right; the page count did differ, and was where it showed.
	const compiling = deps.isCompiling();
	// how trustworthy compiling:false is. With the completion marker on, the end comes from the
	// shell reporting the command exited; with it off, it is inferred from the log going quiet and
	// can fire during a long between-pass pause (biber, on-the-fly package installs).
	const endSignal = compileConfig.current.completionMarker ? 'shell-exit' : 'log-quiet';
	// Live mode does NOT write this: its incremental engine keeps its own diagnostics and never
	// touches a .log. So what is here is whatever the last SHELL compile left behind - or, if there
	// hasn't been one, the .log found sitting in the folder when it was opened, which can be
	// arbitrarily old. Saying so beats letting a caller read `status.pages` off a stale run.
	const live = compileConfig.current.latex.liveMode;
	if (!log) return { compiled: false, compiling, endSignal, live, errors: [], warnings: [] };
	const parsedLog = log;
	const root = workspaceRoot.current;
	function trim(list: typeof parsedLog.errors) {
		return list.slice(0, MAX_DIAGNOSTICS).map((e) => ({ message: e.message, file: e.file ?? null, line: e.line ?? null }));
	}
	return {
		compiled: true,
		compiling,
		endSignal,
		live,
		status: parsedLog.status,
		// which log this describes and when it was written. everything below - the counts, and
		// status.pages especially - belongs to THAT run, not necessarily the last one the user watched
		logPath: root ? relativeTo(root, parsedLog.logPath) : parsedLog.logPath,
		logWrittenAt: publishedAt(),
		// so a truncated list does not read as "that was all of them"
		errorCount: parsedLog.errors.length,
		warningCount: parsedLog.warnings.length,
		errors: trim(parsedLog.errors),
		warnings: trim(parsedLog.warnings)
	};
}

/**
 * Switching mode can be REFUSED, so this reports what actually happened instead of assuming.
 * Diff is the case that bites: viewModeSwitch.set() returns silently when the folder is not a git
 * repo or nothing is loaded, so a tool that reported success was simply lying - which is exactly how
 * a caller ended up believing diff worked and then that it silently no-oped.
 *
 * isGitRepo is also probed at launch, so a repo created afterwards (git init in a terminal, or a
 * clone landing) leaves it stale and diff refuses for a reason that is no longer true. Re-checking
 * before giving up costs one git call on a path that is already a user-visible action.
 */
async function viewModePayload(deps: McpCommandDeps, mode: unknown) {
	if (mode !== 'visual' && mode !== 'source' && mode !== 'diff') return { ok: false, reason: 'unknown mode', viewMode: deps.getViewMode() };
	if (mode === 'diff') {
		if (!deps.getLoadedPath()) return { ok: false, reason: 'no file is open', viewMode: deps.getViewMode() };
		const root = workspaceRoot.current;
		if (root && !isGitRepo.current) await refreshGitStatus(root);
		if (!isGitRepo.current)
			return {
				ok: false,
				reason: 'this workspace is not a git repository, so there is nothing to diff against',
				viewMode: deps.getViewMode()
			};
	}
	deps.setViewMode(mode);
	const now = deps.getViewMode();
	return now === mode ? { ok: true, viewMode: now } : { ok: false, reason: 'the editor refused the switch', viewMode: now };
}

/**
 * Set the main file, or clear it when `path` is omitted. Refusable, so it reports what happened:
 * naming a file outside the workspace, or one that is not a .tex/.typ, changes nothing and says why.
 *
 * The extension check is the point of this rather than a bare setMainFile(). The main file drives
 * the compile and the project-wide macro scan, and pointing it at a .bib or an image gives every
 * later compile a failure whose cause is nowhere near where it surfaces.
 */
async function mainFilePayload(deps: McpCommandDeps, path: unknown) {
	const root = workspaceRoot.current;
	if (!root) return { ok: false, reason: 'no folder is open' };
	const rel = typeof path === 'string' && path ? path : null;
	if (!rel) {
		await deps.setMainFile(null);
		return { ok: true, mainFile: null, cleared: true };
	}
	const abs = resolveInWorkspace(rel);
	if (!abs) return { ok: false, reason: 'path is outside this workspace', mainFile: relOrNull(root) };
	// Must name a .tex or .typ file that is actually THERE. resolveInWorkspace only contains the
	// path, and deliberately does not check existence - a bad main file is written to localStorage
	// and then surfaces as a compile failure with no visible connection to the tool call that
	// caused it. .tex is matched against the scanned list (extension check for free); .typ against
	// the open tree, since the scan is .tex-only. Setting a .typ main flips the Auto compile
	// format to Typst, same as the file tree's "Set as main file".
	const known = texFiles.current.find((f) => samePath(f.path, abs));
	const typOk = !known && /\.typ$/i.test(abs) && inOpenTree(abs);
	if (!known && !typOk)
		return {
			ok: false,
			reason: 'no such .tex or .typ file in this workspace - get_editor_state lists what is open',
			mainFile: relOrNull(root)
		};
	await deps.setMainFile(known ? known.path : abs);
	return { ok: true, mainFile: relOrNull(root), cleared: false };
}

/** the main file as the caller sees paths: workspace-relative, or null when none is set */
function relOrNull(root: string): string | null {
	const m = mainFile.current;
	return m ? relativeTo(root, m) : null;
}

/**
 * Everything about where this project's build goes and comes from, in one reply.
 *
 * pdfPath/logPath are the RESOLVED paths - the ones the preview pane and the log parser actually
 * watch, after a manual override has had its say - rather than what the command implies. In a
 * monorepo those are routinely not the same thing, and reporting the derivation instead of the
 * result is how a caller ends up confidently reading a PDF nobody is looking at.
 */
function compileConfigPayload(deps: McpCommandDeps) {
	const root = workspaceRoot.current;
	const cmd = deps.getCompileCommand();
	const main = mainFile.current;
	const format = effectiveCompileFormat(main);
	const ov = compileConfig.current[format].outputs;
	function rel(p: string | null) {
		return p && root ? relativeTo(root, p) : p;
	}
	const s = settings.current;
	return {
		command: cmd,
		// the typesetter in effect, from the main file's extension and nothing else. Change it by
		// setting a .typ or .tex main file; there is no override, because typst cannot build a .tex
		// and latex cannot build a .typ.
		format,
		engine: detectEngine(cmd),
		latexmk: usesLatexmk(cmd),
		outputDir: compileOutDir(cmd),
		mainFile: main ? rel(main) : null,
		pdfPath: rel(expectedPdfPath(cmd, root, main, ov.pdf)),
		logPath: rel(expectedLogPath(cmd, root, main, ov)),
		// null rather than absent, so "no override, this was detected" is distinguishable from
		// "an override happens to match what would have been detected"
		overrides: { pdf: ov.pdf ?? null, log: ov.log ?? null },
		live: compileConfig.current.latex.liveMode,
		// so a caller can tell "you may not do that" apart from "that failed", without trying it
		canSetCommand: s.mcpAllowCompileCommand === true
	};
}

/**
 * Retarget the build: the output directory, and/or where the viewer reads the PDF and log.
 *
 * Ungated, unlike set_compile_command, and the validation here is what earns that. The output
 * directory is spliced into a shell command line, so it goes through sanitizeOutputDir and can
 * only ever name a place; the PDF/log overrides are never executed at all, only read, so they only
 * have to be single real files of the right kind.
 */
function setOutputPathsPayload(deps: McpCommandDeps, a: Record<string, unknown>) {
	const root = workspaceRoot.current;
	if (!root) return { ok: false, reason: 'no folder is open' };
	function str(v: unknown) {
		return typeof v === 'string' ? v : undefined;
	}
	const outputDir = str(a.outputDir);
	const pdf = str(a.pdf);
	const log = str(a.log);
	if (outputDir === undefined && pdf === undefined && log === undefined)
		return { ok: false, reason: 'nothing to change: pass outputDir, pdf, or log' };

	let command: string | undefined;
	if (outputDir !== undefined) {
		const safe = sanitizeOutputDir(outputDir);
		if (!safe)
			return {
				ok: false,
				reason:
					'outputDir must be a plain directory path (letters, digits, . _ - / and spaces). It is spliced into a shell command, so quotes and shell metacharacters are refused.'
			};
		command = withOutputDir(deps.getCompileCommand(), safe);
	}
	// blank clears an override; anything else must be one real file of the right kind
	for (const [v, ext, name] of [
		[pdf, '.pdf', 'pdf'],
		[log, '.log', 'log']
	] as const) {
		if (v === undefined || !v.trim()) continue;
		const issue = outputPathIssue(v, ext);
		if (issue === 'has-token') return { ok: false, reason: `${name} is a literal file path, so {main} and other tokens are not expanded` };
		if (issue === 'wrong-ext') return { ok: false, reason: `${name} must name a single ${ext} file` };
	}

	deps.applyCompile(command, pdf === undefined && log === undefined ? undefined : { pdf, log });
	return { ok: true, ...compileConfigPayload(deps) };
}

/**
 * Replace the compile command outright.
 *
 * Gated behind a setting that is off by default, and that gate is the whole point: this string is
 * handed to a shell, so anything able to set it can run anything the user can. Every other tool on
 * this server reads state or moves the window. Refusing loudly - naming the setting - beats
 * failing in a way a caller would work around by editing the settings file itself.
 */
function setCompileCommandPayload(deps: McpCommandDeps, command: unknown) {
	if (!settings.current.mcpAllowCompileCommand)
		return {
			ok: false,
			reason:
				'setting the compile command is turned off. The user can enable it in Preferences > AI assistant ("Allow changing the compile command"); it is separate from MCP access because a compile command is a shell command line. set_output_paths can retarget the output directory without it.'
		};
	const cmd = typeof command === 'string' ? command.trim() : '';
	if (!cmd) return { ok: false, reason: 'command must be a non-empty string' };
	if (!cmd.includes('{main}'))
		return { ok: false, reason: 'command must contain the {main} token, which expands to the project main file' };
	deps.applyCompile(cmd);
	return { ok: true, ...compileConfigPayload(deps) };
}

function syncTexPayload(deps: McpCommandDeps, line: unknown) {
	const n = Number(line);
	if (!Number.isInteger(n) || n < 1) return { ok: false, reason: 'line must be a positive integer' };
	if (!deps.getLoadedPath()) return { ok: false, reason: 'no file is open' };
	// Needs a compiled PDF with a .synctex to resolve against, and the pane opens itself. Failure is
	// reported by SyncTexNav through its own toast rather than surfacing here, so this only confirms
	// the request was dispatched.
	deps.syncToLine(n);
	return { ok: true, line: n };
}

/** wire the MCP request/command channels; returns the detach function */
export function attachMcpCommands(deps: McpCommandDeps): () => void {
	const api = nativeBridge();
	const offRequest = api?.onMcpRequest?.((req) => {
		const a = req.args ?? {};
		function reply(payload: unknown) {
			return api?.mcpRespond?.(req.id, payload);
		}
		if (req.kind === 'unsaved') return reply(unsavedPayload(deps));
		if (req.kind === 'diagnostics') return reply(diagnosticsPayload(deps));
		if (req.kind === 'synctex') return reply(syncTexPayload(deps, a.line));
		if (req.kind === 'compile_config') return reply(compileConfigPayload(deps));
		if (req.kind === 'set_output_paths') return reply(setOutputPathsPayload(deps, a));
		if (req.kind === 'set_compile_command') return reply(setCompileCommandPayload(deps, a.command));
		if (req.kind === 'main_file') return void mainFilePayload(deps, a.path).then(reply);
		if (req.kind === 'comments') return void commentsPayload(deps.comments, a).then(reply);
		if (req.kind === 'comment_add') return void addCommentPayload(deps.comments, a).then(reply);
		if (req.kind === 'comment_reply') return void replyCommentPayload(deps.comments, a).then(reply);
		if (req.kind === 'comment_resolve') return void resolveCommentPayload(deps.comments, a).then(reply);
		if (req.kind === 'comment_reanchor') return void reanchorCommentPayload(deps.comments, a).then(reply);
		if (req.kind === 'compile') {
			// Live mode and terminal mode are different enough that the caller has to be told which one
			// it got. In live mode runCompile() drives the incremental draft engine, the preview is
			// already refreshing on its own, and diagnostics come from that engine rather than a .log a
			// shell wrote - so "I compiled, now poll get_diagnostics" is the wrong mental model there.
			const live = compileConfig.current.latex.liveMode;
			deps.runCompile();
			// Dispatch only either way. A terminal compile is seconds to minutes, so waiting here would
			// just time out.
			//
			// The completion contract rides on ordering, not timestamps: every terminal-mode completion
			// path publishes the parsed log BEFORE dropping busy (finalizeCompile and watchLog both
			// await publishLogDiagnostics first), so the first diagnostics reply with compiling:false
			// already carries this run's results. A latexmk that skips an up-to-date build still ends
			// the run, and the previously published diagnostics are then correct because nothing
			// changed - which is what lets the caller's rule stay one sentence.
			return reply({
				ok: true,
				started: true,
				mode: live ? 'live' : 'terminal',
				note: live
					? 'Live mode: the preview recompiles incrementally on its own, so this only nudges it. Diagnostics come from the draft engine.'
					: 'Terminal mode: runs the configured compile command in the Compile shell. Poll get_diagnostics until compiling is false; that same reply already contains the results of this run (even when latexmk found the build up to date and re-ran nothing).'
			});
		}
		if (req.kind === 'view_mode') return void viewModePayload(deps, a.mode).then(reply);
		if (req.kind === 'show_diff') {
			const rel = typeof a.path === 'string' ? a.path : null;
			if (rel) {
				const abs = resolveInWorkspace(rel);
				if (!abs) return reply({ ok: false, reason: 'path is outside this workspace' });
				deps.openFile(abs);
			}
			return void viewModePayload(deps, 'diff').then(reply);
		}
		reply({ error: 'unknown request' });
	});

	const offCommand = api?.onMcpCommand?.((cmd) => {
		const kind = String(cmd.kind ?? '');
		// set_view_mode / show_diff / synctex / compile arrive as REQUESTS, not commands: each can be
		// refused, and the caller needs to hear that rather than assume it worked.
		if (kind === 'open_file') {
			const rel = typeof cmd.path === 'string' ? cmd.path : '';
			const abs = resolveInWorkspace(rel);
			if (!abs) return; // outside the workspace: ignore rather than reach for it
			const line = typeof cmd.line === 'number' && cmd.line > 0 ? Math.floor(cmd.line) : null;
			if (line) deps.openFileAtLine(abs, line);
			else deps.openFile(abs);
		}
	});

	return () => {
		offRequest?.();
		offCommand?.();
	};
}
