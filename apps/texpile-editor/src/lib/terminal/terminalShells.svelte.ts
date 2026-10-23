// The dock's shell roster: numbered user terminals plus the dedicated compile shell. Compile
// never borrows the user's shell - there is no reliable way to ask a pty whether a foreground
// process (vim, a REPL, ssh) is reading input, so the command gets a shell of its own.
import { m } from '$lib/paraglide/messages';

type TermRef =
	| {
			runCommand(cmd: string, onDone?: (output: string) => void, onFail?: (error: string) => void): void;
			interrupt(): void;
			refit(): void;
			focus(): void;
	  }
	| undefined;

export class TerminalShells {
	terminals = $state<{ id: number; title: string }[]>([]);
	activeTermId = $state<number | null>(null);
	compileTermId = $state<number | null>(null);
	readonly refs: Record<number, TermRef> = {};
	private seq = 0;
	// The tab NUMBER is counted separately from the shell id. Ids are unique across every shell,
	// the compile one included, so titling by id meant that once compile had taken id 1 the user's
	// first terminal came out called "Terminal 2". This counter only ever advances for shells the
	// user can see as numbered tabs.
	private termNo = 0;

	constructor(private readonly onEmpty: () => void) {}

	private activeRef(): TermRef {
		return this.activeTermId != null ? this.refs[this.activeTermId] : undefined;
	}

	private userTerm(id: number) {
		return { id, title: m.wsview_terminal_numbered({ id: ++this.termNo }) };
	}

	/** the user opened the terminal on purpose: give them a shell if they have none yet */
	ensure(): void {
		if (this.terminals.length === 0) {
			const t = this.userTerm(++this.seq);
			this.terminals = [t];
			this.activeTermId = t.id;
		}
	}

	add(): void {
		const t = this.userTerm(++this.seq);
		this.terminals = [...this.terminals, t];
		this.activeTermId = t.id;
		setTimeout(() => this.activeRef()?.focus(), 50);
	}

	select(id: number): void {
		this.activeTermId = id;
		setTimeout(() => {
			this.activeRef()?.refit();
			this.activeRef()?.focus();
		}, 0);
	}

	kill(id: number): void {
		this.terminals = this.terminals.filter((t) => t.id !== id);
		this.refs[id] = undefined;
		if (this.compileTermId === id) this.compileTermId = null; // the next compile makes a fresh one
		if (this.activeTermId === id) this.activeTermId = this.terminals.at(-1)?.id ?? null;
		if (this.terminals.length === 0) this.onEmpty();
		else setTimeout(() => this.activeRef()?.refit(), 0);
	}

	/** the compile shell, created on demand and reused; never one the user is working in */
	private ensureCompileTerm(): number | null {
		if (this.compileTermId != null && this.terminals.some((t) => t.id === this.compileTermId)) return this.compileTermId;
		const id = ++this.seq;
		this.terminals = [...this.terminals, { id, title: m.wsview_terminal_compile() }];
		this.compileTermId = id;
		return id;
	}

	/** run a command on the dedicated compile shell, retrying until it has spawned. */
	runCommand(cmd: string, onDone?: (output: string) => void, onFail?: (error: string) => void, tries = 0): void {
		const id = this.ensureCompileTerm();
		if (id == null) return;
		// Runs in the background: whatever tab the user is on stays selected. Compiling should not
		// yank them out of a shell they are working in - errors surface in Problems either way, and
		// the Compile tab is right there if they want the raw output.
		//
		// The exception is having nothing selected at all (first compile before any shell existed),
		// where showing the compile shell steals nothing.
		if (this.activeTermId == null) {
			this.activeTermId = id;
			setTimeout(() => this.refs[id]?.refit(), 0);
		}
		const ref = this.refs[id];
		if (ref) {
			ref.runCommand(cmd, onDone, onFail);
			return;
		}
		if (tries >= 40) onFail?.(m.terminal_error_failed_start());
		else setTimeout(() => this.runCommand(cmd, onDone, onFail, tries + 1), 25); // ~1s for first mount
	}

	/** drop every shell (folder changed: they are all in the old cwd) and respawn one, but only if
	 *  the user actually had one. A dock holding nothing but the compile shell goes back to empty
	 *  rather than gaining a terminal off the back of a folder switch. Numbering restarts with the
	 *  new folder. */
	reset(): void {
		if (this.terminals.length === 0) return;
		const hadUserShell = this.terminals.some((t) => t.id !== this.compileTermId);
		this.compileTermId = null;
		this.termNo = 0;
		if (!hadUserShell) {
			this.terminals = [];
			this.activeTermId = null;
			return;
		}
		const t = this.userTerm(++this.seq);
		this.terminals = [t];
		this.activeTermId = t.id;
		setTimeout(() => this.activeRef()?.refit(), 0);
	}

	refit(): void {
		this.activeRef()?.refit();
	}

	focusActive(): void {
		this.activeRef()?.focus();
	}

	/** Ctrl-C the running command (compile stop). Targets the compile shell, not the selected tab:
	 *  Stop must kill the compile even if the user has since switched to their own terminal, and
	 *  must never Ctrl-C whatever they are running there. */
	interrupt(): void {
		const ref = this.compileTermId != null ? this.refs[this.compileTermId] : undefined;
		(ref ?? this.activeRef())?.interrupt();
	}
}
