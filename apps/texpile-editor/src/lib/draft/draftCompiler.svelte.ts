// The full-compile lifecycle: cancel-on-supersede compiles.
import { nativeBridge, type DraftResult } from '$lib/workspace/fileSystem';
import { readBackExtensions } from '$lib/languages/latex/knowledge/registries/sidecarExtensions';
import { m } from '$lib/paraglide/messages';

// a first compile still running after this long gets a note: typing waits on it
const SLOW_MS = 10000;

type CompilerHooks = {
	root: () => string;
	mainFile: () => string;
	/** a successful compile's result: swap in pages/paper and refresh the view */
	applyCompiled: (r: Extract<DraftResult, { ok: true }>) => Promise<void>;
	/** compile settled (either way): queued edits, diagnostics */
	afterCompile: () => void;
	/** the preview is paused, its engine stopped */
	paused: () => boolean;
	/** pages are on screen: a compile then only refreshes them */
	hasPages: () => boolean;
	emit: (kind: string, detail?: unknown) => void;
};

export class DraftCompiler {
	compiling = $state(false);
	/** the running pass is the refresh after typing rests, which shows no progress */
	quiet = $state(false);
	/** a compile with no pages on screen yet has run past SLOW_MS */
	slow = $state(false);
	status = $state('');
	error = $state<string | null>(null);
	/** the engine was not found; the banner offers the Toolchain folders */
	missingTool = $state<string | null>(null);

	private compileToken = 0;
	private newest: Promise<boolean | null> | null = null;

	constructor(private hooks: CompilerHooks) {}

	/** true when the pass landed pages, false when it failed or never ran, null when a newer pass superseded it */
	compile(reason = 'trigger'): Promise<boolean | null> {
		const n = nativeBridge();
		if (!n || !this.hooks.root() || !this.hooks.mainFile()) return Promise.resolve(false);
		// cancel-on-supersede: don't queue behind an in-flight compile -- fire a fresh one. The
		// service kills the older run's lualatex, so a hung/slow compile never blocks the latest
		// edit (else the 120s pass timeout would freeze the preview). This run drops its own
		// result if a still-newer compile started before it returned (token guard).
		const pass = this.runPass(reason, ++this.compileToken);
		this.newest = pass;
		return pass;
	}

	/** the newest pass while one runs */
	inFlight(): Promise<boolean | null> | null {
		return this.compiling ? this.newest : null;
	}

	/** a pass whose draft.pdf gets read: a pass that supersedes it owns the file, so that is the one to wait for */
	async compileToLand(reason: string): Promise<boolean> {
		let pass = this.compile(reason);
		let landed = await pass;
		while (landed === null && this.newest && this.newest !== pass) {
			pass = this.newest;
			landed = await pass;
		}
		return landed === true;
	}

	private async runPass(reason: string, myToken: number): Promise<boolean | null> {
		const n = nativeBridge()!;
		let landed = false;
		this.hooks.emit('compile-start', { reason });
		this.compiling = true;
		this.quiet = reason.startsWith('quiet:');
		const slowTimer = this.hooks.hasPages() ? null : setTimeout(() => (this.slow = true), SLOW_MS);
		// a quiet pass (the refresh after teleported edits) announces nothing; a fresh compile announces itself
		if (!reason.startsWith('quiet:')) this.status = reason === 'save-pdf' ? m.draft_status_compiling_export() : m.draft_status_compiling();
		this.error = null;
		this.missingTool = null;
		try {
			const r = await n.draftCompile({ root: this.hooks.root(), mainFile: this.hooks.mainFile(), readBack: readBackExtensions() });
			if (slowTimer) clearTimeout(slowTimer);
			if (myToken !== this.compileToken) {
				this.hooks.emit('compile-superseded', { reason });
				return null;
			} // a newer compile owns the state now
			if (r.ok) {
				await this.hooks.applyCompiled(r);
				landed = true;
			} else if (!(r as { superseded?: boolean }).superseded) {
				// svelte-check doesn't reliably narrow this cross-module discriminated union.
				// A service-side 'superseded' isn't an error -- the newer compile will render.
				const fail = r as { error: string; log?: string; tool?: string };
				if (fail.error === 'engine-missing' && fail.tool) {
					this.missingTool = fail.tool;
					this.error = m.draft_engine_missing({ tool: fail.tool });
					this.status = '';
				} else {
					// The message only, never fail.log. This banner's job is "the preview could not be
					// produced" -- lualatex missing, an unreadable manifest -- which is not a LaTeX
					// diagnostic and has no file or line to hang off, so nothing else can report it.
					// The log tail it used to carry is a dozen lines of exactly the diagnostics the
					// Problems panel now parses out of the same file, and rendering them here made the
					// banner tall enough to squeeze the pages out of the pane.
					this.error = fail.error;
					this.status = '';
				}
			}
		} catch (e) {
			if (slowTimer) clearTimeout(slowTimer);
			if (myToken !== this.compileToken) return null;
			this.error = e instanceof Error ? e.message : String(e);
			this.status = '';
		}
		// a newer compile may have started during the async render above; if so, leave the state
		// (compiling flag, queued patch) to it so we don't clear its in-flight status early
		if (myToken !== this.compileToken) return null;
		this.compiling = false;
		this.slow = false;
		// every pass parks warm engines for the edits after it, and a paused preview stopped the engines on purpose
		if (this.hooks.paused()) void n.draftStop?.();
		this.hooks.afterCompile();
		return landed;
	}
}
