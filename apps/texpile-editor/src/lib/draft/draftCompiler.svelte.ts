// The full-compile lifecycle: cancel-on-supersede compiles and the one-live-preview engine ownership (engine-busy
// pause + takeover).
import { nativeBridge, type DraftResult } from '$lib/workspace/fileSystem';
import { readBackExtensions } from '$lib/languages/latex/knowledge/registries/sidecarExtensions';
import { m } from '$lib/paraglide/messages';

type CompilerHooks = {
	root: () => string;
	mainFile: () => string;
	/** a successful compile's result: swap in pages/paper and refresh the view */
	applyCompiled: (r: Extract<DraftResult, { ok: true }>) => Promise<void>;
	/** compile settled (either way): queued edits, diagnostics */
	afterCompile: () => void;
	/** the preview is paused, its engine stopped */
	paused: () => boolean;
	emit: (kind: string, detail?: unknown) => void;
};

export class DraftCompiler {
	compiling = $state(false);
	status = $state('');
	error = $state<string | null>(null);
	/** the engine was not found; the banner offers the Toolchain folders */
	missingTool = $state<string | null>(null);
	// one live preview at a time: another window owns the warm engine (main's draftOwner);
	// this preview is paused until the user explicitly takes the engine over
	busyElsewhere = $state(false);

	private compileToken = 0;
	private newest: Promise<boolean | null> | null = null;

	constructor(private hooks: CompilerHooks) {}

	// explicit user action from the paused banner: steal the engine and start fresh here
	async takeoverEngine(): Promise<void> {
		const n = nativeBridge();
		if (!n?.draftTakeover) return;
		try {
			await n.draftTakeover({ root: this.hooks.root() });
		} catch {
			/* the engine may already be free */
		}
		this.busyElsewhere = false;
		void this.compile('takeover');
	}

	// the losing side of a takeover: main pushes this so we pause immediately instead of
	// showing a stale "ready" state until the next keystroke discovers engine-busy
	attachPreempt(): (() => void) | undefined {
		const n = nativeBridge();
		if (!n?.onDraftPreempted) return undefined;
		return n.onDraftPreempted(() => {
			this.busyElsewhere = true;
			this.compiling = false;
			this.status = '';
		});
	}

	/** true when the pass landed pages, false when it failed or never ran, null when a newer pass superseded it */
	compile(reason = 'trigger'): Promise<boolean | null> {
		const n = nativeBridge();
		if (!n || !this.hooks.root() || !this.hooks.mainFile()) return Promise.resolve(false);
		if (this.busyElsewhere) return Promise.resolve(false); // paused: don't fight the owning window on every trigger
		// cancel-on-supersede: don't queue behind an in-flight compile -- fire a fresh one. The
		// service kills the older run's lualatex, so a hung/slow compile never blocks the latest
		// edit (else the 120s pass timeout would freeze the preview). This run drops its own
		// result if a still-newer compile started before it returned (token guard).
		const pass = this.runPass(reason, ++this.compileToken);
		this.newest = pass;
		return pass;
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
		// a quiet pass (the refresh after teleported edits) announces nothing; a fresh compile announces itself
		if (!reason.startsWith('quiet:')) this.status = reason === 'save-pdf' ? m.draft_status_compiling_export() : m.draft_status_compiling();
		this.error = null;
		this.missingTool = null;
		try {
			const r = await n.draftCompile({ root: this.hooks.root(), mainFile: this.hooks.mainFile(), readBack: readBackExtensions() });
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
				if (fail.error === 'engine-busy') {
					// another window owns the live-preview engine: pause with the banner
					this.busyElsewhere = true;
					this.status = '';
				} else if (fail.error === 'engine-missing' && fail.tool) {
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
			if (myToken !== this.compileToken) return null;
			this.error = e instanceof Error ? e.message : String(e);
			this.status = '';
		}
		// a newer compile may have started during the async render above; if so, leave the state
		// (compiling flag, queued patch) to it so we don't clear its in-flight status early
		if (myToken !== this.compileToken) return null;
		this.compiling = false;
		// every pass parks warm engines for the edits after it, and a paused preview stopped the engines on purpose
		if (this.hooks.paused()) void n.draftStop?.();
		this.hooks.afterCompile();
		return landed;
	}
}
