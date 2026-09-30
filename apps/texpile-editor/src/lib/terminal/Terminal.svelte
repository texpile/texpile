<script lang="ts">
	import { onMount } from 'svelte';
	import { Terminal } from '@xterm/xterm';
	import { FitAddon } from '@xterm/addon-fit';
	import '@xterm/xterm/css/xterm.css';
	import { compileConfig } from '$lib/workspace/projectConfigSync.svelte';
	import { settings } from '$lib/settings';
	import { m } from '$lib/paraglide/messages';
	import { terminalTheme } from './terminalTheme';
	import { attachTerminalClipboard } from './terminalClipboard';
	import { TerminalResizeDebouncer } from './terminalResizeDebouncer';
	import { observe } from '$lib/runes/observe.svelte';
	import { resolvedMode, themeEpoch } from '$lib/theme';

	// a real shell (node-pty in the Electron main) rendered with xterm.js via the window.texpileTerminal bridge
	let { cwd = '' }: { cwd?: string } = $props();

	let host = $state<HTMLDivElement>();
	let term: Terminal | null = null;
	let fit: FitAddon | null = null;
	let resizer: TerminalResizeDebouncer | null = null;
	let answersDeviceAttributes = false;
	let unsubs: Array<() => void> = [];
	let id = newId();
	// a shell keeps the PATH it was spawned with, so a change to the folders in Preferences makes it stale
	let stale = false;

	function newId(): string {
		return `term-${Math.random().toString(36).slice(2)}`;
	}

	let status = $state<'loading' | 'ready' | 'unavailable' | 'exited'>('loading');
	let errorMsg = $state('');
	let pending: { command: string; onDone?: (output: string) => void } | null = null; // asked for before the shell finished spawning

	function bridge() {
		return typeof window !== 'undefined' ? window.texpileTerminal : undefined;
	}

	// completion detection for tracked runs (the compile): the shell never exits, so the tracked
	// command gets a unique token echoed after it. the token in the typed line is split by a shell
	// escape, so the input echo can never match; only real output does.
	let shellName = ''; // basename of the spawned shell, picks the sentinel syntax below
	let trackSeq = 0;
	// chunks accumulate in an array: rebuilding a ~1MB string per pty chunk near the cap was slow
	let tracked: { token: string; done: (output: string) => void; chunks: string[]; len: number } | null = null;
	let scanTail = ''; // short rolling window over output so a chunk boundary can't split the token
	const MAX_CAPTURE = 1_000_000; // captured stdout cap; a longer compile keeps its tail

	// unknown shells (nushell, xonsh, ...) get NO sentinel: a suffix they can't parse would fail
	// the whole line, compile included; the log/PDF pollers still detect completion
	const POSIX_SHELLS = /^(bash|zsh|fish|sh|dash|ash|ksh|mksh|tcsh|csh)$/;

	const CHAIN_OPERATORS = ['&', '|', ';', '\\', '^'];

	// true if the command ends in a shell chain/continuation char (ignoring trailing spaces):
	// appending our suffix right after one of these breaks the line (`cmd & ; echo` is invalid)
	function endsWithChainOperator(command: string): boolean {
		const trimmed = command.trimEnd();
		const lastChar = trimmed.charAt(trimmed.length - 1);
		return CHAIN_OPERATORS.includes(lastChar);
	}

	// true if PowerShell's "--%" stop-parsing token appears as its own word: everything after it
	// becomes literal text, so our appended suffix would just be swallowed as an argument.
	// split on \s+ (not just ' '), so a tab or doubled space between args doesn't hide the token
	function hasStopParsingToken(command: string): boolean {
		return command.split(/\s+/).includes('--%');
	}

	function withSentinel(command: string, onDone: (output: string) => void): string {
		if (!compileConfig.current.completionMarker) return command;
		if (endsWithChainOperator(command) || hasStopParsingToken(command)) return command;
		// no shell name: don't guess, syntax the actual shell can't parse could fail the whole line
		const shell = shellName.toLowerCase().replace(/\.exe$/, '');
		const token = `__texpile_done_${++trackSeq}__`;
		const head = token.slice(0, 9); // "__texpile"
		const tail = token.slice(9);
		let suffix: string | null = null;
		if (shell === 'cmd') suffix = ` & echo ${head}^${tail}`;
		else if (shell === 'powershell' || shell === 'pwsh') suffix = ` ; echo ('${head}' + '${tail}')`;
		else if (POSIX_SHELLS.test(shell)) suffix = ` ; echo '${head}''${tail}'`;
		if (suffix === null) return command;
		tracked = { token, done: onDone, chunks: [], len: 0 };
		scanTail = '';
		return command + suffix;
	}

	// ConPTY interleaves escape sequences into output; strip CSI/OSC runs so the token matches as plain text
	function stripEscapes(s: string) {
		// eslint-disable-next-line no-control-regex
		return s.replace(/\x1b(?:\[[0-9;?]*[ -/]*[@-~]|\][^\x07\x1b]*(?:\x07|\x1b\\)?)/g, '');
	}

	/** runs a command in the shell, queued if not ready; onDone fires once the command line
	 * finishes, receiving the command's captured output (escape-stripped, capped) so callers can
	 * parse tool diagnostics that only go to stdout (dvipdfmx etc.). */
	export function runCommand(command: string, onDone?: (output: string) => void): void {
		const b = bridge();
		if (b && status === 'ready') b.write(id, (onDone ? withSentinel(command, onDone) : command) + '\r');
		else pending = { command, onDone };
	}
	async function spawnShell(b: NonNullable<ReturnType<typeof bridge>>, t: Terminal): Promise<boolean> {
		const res = await b.spawn({ id, cwd, cols: t.cols, rows: t.rows });
		if (!res.ok) {
			status = 'unavailable';
			errorMsg = res.error ?? m.terminal_error_failed_start();
			return false;
		}
		shellName = res.shell ?? '';
		// conpty repaints its screen after a resize; told so, xterm grows as conpty does and no line shows twice
		if (res.windowsPty && term) term.options.windowsPty = res.windowsPty;
		// conpty 1.22+ holds the shell until its device attributes query is answered; VS Code's answer
		if (res.windowsPty?.backend === 'conpty' && term && !answersDeviceAttributes) {
			answersDeviceAttributes = true;
			term.parser.registerCsiHandler({ final: 'c' }, (params) => {
				if (params.length !== 0 && !(params.length === 1 && params[0] === 0)) return false;
				b.write(id, '\x1b[?61;4c');
				return true;
			});
		}
		status = 'ready';
		return true;
	}
	function flushPending(b: NonNullable<ReturnType<typeof bridge>>): void {
		if (!pending) return;
		const { command, onDone } = pending;
		pending = null;
		b.write(id, (onDone ? withSentinel(command, onDone) : command) + '\r');
	}
	// a fresh shell for the folders as they are now; a tracked run finishes first
	async function respawnIfStale(): Promise<void> {
		const b = bridge();
		if (!stale || tracked || status !== 'ready' || !term || !b) return;
		stale = false;
		b.kill(id);
		id = newId();
		status = 'loading';
		term.reset();
		if (await spawnShell(b, term)) flushPending(b);
	}
	/** ends the shell's foreground job; Ctrl+C on a bridge that predates terminal:interrupt */
	export function interrupt(): void {
		const b = bridge();
		if (!b || status !== 'ready') return;
		if (b.interrupt) void b.interrupt(id);
		else b.write(id, '\x03');
	}
	export function focus(): void {
		term?.focus();
	}
	/** re-measure to the container (call after the panel is shown / resized). */
	export function refit(): void {
		// offsetParent is null while display:none; fitting a zero box would resize the PTY
		// to 1 row and reflow the shell. we refit again when shown.
		if (!host || host.offsetParent === null || !term) return;
		let dims: { cols: number; rows: number } | undefined;
		try {
			dims = fit?.proposeDimensions();
		} catch {
			/* fit before layout can throw; ignore */
		}
		// no same-size check: a width still waiting in the debouncer may be the one to undo
		if (!dims || isNaN(dims.cols) || isNaN(dims.rows)) return;
		resizer?.resize(dims.cols, dims.rows, false);
	}

	onMount(() => {
		const b = bridge();
		const el = host;
		if (!b || !el) {
			status = 'unavailable';
			return;
		}
		let disposed = false;
		let ro: ResizeObserver | null = null;

		(async () => {
			// available() can reject if the main process predates the terminal IPC (stale dev process);
			// treat any failure as unavailable instead of hanging on the spinner
			let ok: boolean;
			try {
				ok = await b.available();
			} catch {
				ok = false;
			}
			if (!ok) {
				status = 'unavailable';
				errorMsg = m.terminal_error_needs_rebuild();
				return;
			}
			term = new Terminal({
				fontSize: 13,
				fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
				cursorBlink: true,
				scrollback: 5000,
				// xterm keeps its own colours (terminalTheme.ts); the ratio is what keeps them readable on
				// whichever ground the theme gives it, the way VS Code's terminal does
				minimumContrastRatio: 4.5,
				// VS Code's: a clear screen goes into the scrollback, and a glyph wider than its cell is squeezed in
				scrollOnEraseInDisplay: true,
				rescaleOverlappingGlyphs: true,
				theme: terminalTheme(resolvedMode.current)
			});
			fit = new FitAddon();
			term.loadAddon(fit);
			const t = term;
			resizer = new TerminalResizeDebouncer(
				() => el.offsetParent !== null,
				() => term,
				(cols, rows) => t.resize(cols, rows),
				(cols) => t.resize(cols, t.rows),
				(rows) => t.resize(t.cols, rows)
			);
			term.open(el);
			unsubs.push(attachTerminalClipboard(term, el));
			// xterm holds concrete colours, so a theme or mode switch while a shell is up re-reads them
			unsubs.push(
				observe(
					() => [resolvedMode.current, themeEpoch.current],
					() => {
						if (term) term.options.theme = terminalTheme(resolvedMode.current);
					}
				)
			);
			// Same guard as refit(): a zero box fits to 1 row, and here that row count goes straight
			// into spawn(), so every line of output would wrap at 1 row for the shell's whole life.
			// This is reachable now that the compile shell runs in the background and can mount while
			// its tab is display:none. Left unfitted, xterm keeps its 80x24 default - fine for a shell
			// nobody is looking at - and the ResizeObserver refits it if the tab is ever shown.
			if (el.offsetParent !== null) fit.fit();

			const spawned = await spawnShell(b, term);
			if (disposed || !spawned) return;

			term.onData((d) => b.write(id, d));
			term.onResize(({ cols, rows }) => b.resize(id, cols, rows));
			unsubs.push(
				b.onData(({ id: tid, data: chunk }) => {
					if (tid !== id) return;
					term?.write(chunk);
					if (tracked) {
						const clean = stripEscapes(chunk);
						tracked.chunks.push(clean);
						tracked.len += clean.length;
						// join+trim only past 2x the cap, so the kept tail never dips below MAX_CAPTURE
						if (tracked.len > MAX_CAPTURE * 2) {
							const joined = tracked.chunks.join('').slice(-MAX_CAPTURE);
							tracked.chunks = [joined];
							tracked.len = joined.length;
						}
						scanTail = (scanTail + clean).slice(-512);
						if (scanTail.includes(tracked.token)) {
							const { done, chunks } = tracked;
							tracked = null;
							const out = chunks.join('').slice(-MAX_CAPTURE);
							// trim from the sentinel's own echo (the last "__texpile" is the token line)
							const end = out.lastIndexOf('__texpile');
							done(end > 0 ? out.slice(0, end) : out);
							void respawnIfStale();
						}
					}
				})
			);
			unsubs.push(
				b.onExit(({ id: tid, code }) => {
					if (tid !== id) return;
					status = 'exited';
					term?.write(`\r\n\x1b[90m[shell exited with code ${code}]\x1b[0m\r\n`);
					// a dead shell ends whatever command it was running: the sentinel will never echo,
					// and without resolving it here the compile pipeline waits out its full poll
					// timeout before conceding the run is over
					if (tracked) {
						const { done, chunks } = tracked;
						tracked = null;
						done(chunks.join('').slice(-MAX_CAPTURE));
					}
				})
			);
			let seenDirs = settings.current.toolDirs;
			unsubs.push(
				observe(
					() => settings.current.toolDirs,
					(dirs) => {
						if (dirs === seenDirs) return;
						seenDirs = dirs;
						stale = true;
						void respawnIfStale();
					}
				)
			);
			ro = new ResizeObserver(() => refit());
			ro.observe(el);
			term.focus();
			flushPending(b);
		})();

		return () => {
			disposed = true;
			ro?.disconnect();
			resizer?.dispose();
			resizer = null;
			for (const u of unsubs) u();
			unsubs = [];
			b.kill(id);
			term?.dispose();
			term = null;
		};
	});
</script>

<div class="relative h-full w-full overflow-hidden bg-(--terminal-bg)">
	{#if status === 'unavailable'}
		<div class="text-(--terminal-fg) flex h-full items-center justify-center p-4 text-center text-sm">
			{errorMsg || m.terminal_error_desktop_only()}
		</div>
	{:else}
		<!-- NO padding here: it must go on .xterm instead, see the note in the style block below -->
		<div bind:this={host} class="terminal-host relative h-full w-full"></div>
	{/if}
</div>

<style>
	/* VS Code's terminal layout (its terminal.css and its copy of xterm.css), with an 8px gutter for
	   its 20px. FitAddon subtracts .xterm's own padding, so the gutter goes there and never on the host;
	   the scrollbar gets the right edge, and the grid sits on the bottom, any spare pixels above it */
	.terminal-host :global(.xterm) {
		position: absolute;
		bottom: 0;
		left: 0;
		right: 0;
		padding-left: calc(var(--spacing) * 2);
	}
	.terminal-host :global(.xterm .xterm-scrollable-element) {
		margin-left: calc(var(--spacing) * -2);
		padding-left: calc(var(--spacing) * 2);
	}
	/* xterm.css paints this black for a native scrollbar the viewport no longer has; stopped short of
	   the scrollbar so the area that takes the mouse ends where it starts */
	.terminal-host :global(.xterm .xterm-viewport) {
		background-color: transparent;
		overflow-y: visible;
		cursor: auto;
		right: 14px;
	}
</style>
