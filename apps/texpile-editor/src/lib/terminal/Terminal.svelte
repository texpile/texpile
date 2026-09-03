<script lang="ts">
	import { onMount } from 'svelte';
	import { Terminal } from '@xterm/xterm';
	import { FitAddon } from '@xterm/addon-fit';
	import '@xterm/xterm/css/xterm.css';
	import { compileConfig } from '$lib/workspace/projectConfigSync.svelte';
	import { m } from '$lib/paraglide/messages';
	import { themeColour } from '$lib/languages/typst/preview/themeColour';
	import { observe } from '$lib/runes/observe.svelte';
	import { resolvedMode, themeName } from '$lib/theme';

	// a real shell (node-pty in the Electron main) rendered with xterm.js via the window.texpileTerminal bridge
	let { cwd = '' }: { cwd?: string } = $props();

	let host = $state<HTMLDivElement>();
	let term: Terminal | null = null;
	let fit: FitAddon | null = null;
	let unsubs: Array<() => void> = [];
	const id = `term-${Math.random().toString(36).slice(2)}`;

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
	/** sends Ctrl+C to the shell's foreground process. */
	export function interrupt(): void {
		const b = bridge();
		if (b && status === 'ready') b.write(id, '\x03');
	}
	export function focus(): void {
		term?.focus();
	}
	/** re-measure to the container (call after the panel is shown / resized). */
	export function refit(): void {
		// offsetParent is null while display:none; fitting a zero box would resize the PTY
		// to 1 row and reflow the shell. we refit again when shown.
		if (!host || host.offsetParent === null) return;
		try {
			fit?.fit();
		} catch {
			/* fit before layout can throw; ignore */
		}
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
				// resolved to rgb(): xterm parses colours itself and does not read CSS variables
				theme: { background: themeColour('--terminal-bg', '#1e1e1e'), foreground: themeColour('--terminal-fg', '#e4e4e7') }
			});
			fit = new FitAddon();
			term.loadAddon(fit);
			term.open(el);
			// xterm holds concrete colours, so a theme or mode switch while a shell is up re-reads them
			unsubs.push(
				observe(
					() => [resolvedMode.current, themeName.current],
					() => {
						if (term)
							term.options.theme = {
								background: themeColour('--terminal-bg', '#1e1e1e'),
								foreground: themeColour('--terminal-fg', '#e4e4e7')
							};
					}
				)
			);
			// Same guard as refit(): a zero box fits to 1 row, and here that row count goes straight
			// into spawn(), so every line of output would wrap at 1 row for the shell's whole life.
			// This is reachable now that the compile shell runs in the background and can mount while
			// its tab is display:none. Left unfitted, xterm keeps its 80x24 default - fine for a shell
			// nobody is looking at - and the ResizeObserver refits it if the tab is ever shown.
			if (el.offsetParent !== null) fit.fit();

			const res = await b.spawn({ id, cwd, cols: term.cols, rows: term.rows });
			if (disposed) return;
			if (!res.ok) {
				status = 'unavailable';
				errorMsg = res.error ?? m.terminal_error_failed_start();
				return;
			}
			shellName = res.shell ?? '';
			status = 'ready';

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
			ro = new ResizeObserver(() => refit());
			ro.observe(el);
			term.focus();
			if (pending) {
				// flush a command queued before the shell was ready
				const { command, onDone } = pending;
				pending = null;
				b.write(id, (onDone ? withSentinel(command, onDone) : command) + '\r');
			}
		})();

		return () => {
			disposed = true;
			ro?.disconnect();
			for (const u of unsubs) u();
			unsubs = [];
			b.kill(id);
			term?.dispose();
			term = null;
		};
	});
</script>

<div class="relative h-full w-full overflow-hidden bg-[#1e1e1e]">
	{#if status === 'unavailable'}
		<div class="text-surface-300 flex h-full items-center justify-center p-4 text-center text-sm">
			{errorMsg || m.terminal_error_desktop_only()}
		</div>
	{:else}
		<!-- NO padding here: it must go on .xterm instead, see the note in the style block below -->
		<div bind:this={host} class="terminal-host h-full w-full"></div>
	{/if}
</div>

<style>
	/*
	 * The inset has to live on .xterm, not on the host, or the terminal ends up wider than the space
	 * it has and the scrollbar covers the end of the command line.
	 *
	 * FitAddon sizes the grid from `getComputedStyle(host).width` minus `.xterm`'s OWN padding. The
	 * host is border-box (Tailwind preflight), and for a border-box element that computed width is the
	 * BORDER box - so a px-2 py-1 on the host is counted as usable space and never subtracted by
	 * anyone. Measured here with a 760px pane: FitAddon saw 760 and asked for 104 columns where only
	 * 102 fit, leaving the last two under the scrollbar, and one row too many so the bottom line was
	 * clipped as well. Padding on .xterm is subtracted, which is what makes the arithmetic close.
	 *
	 * .xterm-viewport is absolutely positioned with inset 0, and an absolute box resolves against its
	 * containing block's PADDING box - so the scrollbar still sits flush against the right edge of the
	 * pane while the text is inset. That is what we want anyway (it is where VS Code puts it).
	 */
	.terminal-host :global(.xterm) {
		padding: calc(var(--spacing) * 1) calc(var(--spacing) * 2);
	}

	/* Pin the scrollbar width for both themes. The app's global dark-mode rule (app.css:
	   [data-mode='dark'] ::-webkit-scrollbar { width: 10px }) is a universal selector, so it matches
	   this viewport too - and xterm measures the bar ONCE in its Viewport constructor and never
	   re-reads it, so a theme toggle after mount would leave the reservation disagreeing with the real
	   width. Not what caused the overlap above, but it is one fewer way for the arithmetic to drift.
	   The thumb colours are here because the terminal has its own dark background regardless of the
	   app's theme, so the app's scrollbar would look wrong on it. */
	.terminal-host :global(.xterm-viewport::-webkit-scrollbar) {
		width: calc(var(--spacing) * 2.5);
	}
	.terminal-host :global(.xterm-viewport::-webkit-scrollbar-track) {
		background: transparent;
	}
	.terminal-host :global(.xterm-viewport::-webkit-scrollbar-thumb) {
		background-color: #4a4a52;
		border: 2px solid transparent;
		background-clip: padding-box;
		border-radius: calc(var(--radius-base) * 1.25);
	}
	.terminal-host :global(.xterm-viewport::-webkit-scrollbar-thumb:hover) {
		background-color: #5e5e68;
	}
</style>
