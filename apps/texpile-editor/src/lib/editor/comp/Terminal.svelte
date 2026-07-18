<script lang="ts">
	import { onMount } from 'svelte';
	import { get } from 'svelte/store';
	import { Terminal } from '@xterm/xterm';
	import { FitAddon } from '@xterm/addon-fit';
	import '@xterm/xterm/css/xterm.css';
	import { settings } from '$lib/settings';

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

	const bridge = () => (typeof window !== 'undefined' ? window.texpileTerminal : undefined);

	// completion detection for tracked runs (the compile): the shell never exits, so the tracked
	// command gets a unique token echoed after it. the token in the typed line is split by a shell
	// escape, so the input echo can never match; only real output does.
	let shellName = ''; // basename of the spawned shell, picks the sentinel syntax below
	let trackSeq = 0;
	let tracked: { token: string; done: (output: string) => void; out: string } | null = null;
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
		if (!get(settings).compileSentinel) return command;
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
		tracked = { token, done: onDone, out: '' };
		scanTail = '';
		return command + suffix;
	}

	// ConPTY interleaves escape sequences into output; strip CSI/OSC runs so the token matches as plain text
	// eslint-disable-next-line no-control-regex
	const stripEscapes = (s: string) => s.replace(/\x1b(?:\[[0-9;?]*[ -/]*[@-~]|\][^\x07\x1b]*(?:\x07|\x1b\\)?)/g, '');

	/** runs a command in the shell, queued if not ready; onDone fires once the command line
	 * finishes, receiving the command's captured output (escape-stripped, capped) so callers can
	 * parse tool diagnostics that only go to stdout (dvipdfmx etc.). */
	export function run(command: string, onDone?: (output: string) => void): void {
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
			let ok = false;
			try {
				ok = await b.available();
			} catch {
				ok = false;
			}
			if (!ok) {
				status = 'unavailable';
				errorMsg =
					'The terminal needs node-pty built for Electron. Install C/C++ build tools, then run `pnpm electron:rebuild` and restart.';
				return;
			}
			term = new Terminal({
				fontSize: 13,
				fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
				cursorBlink: true,
				scrollback: 5000,
				theme: { background: '#1e1e1e', foreground: '#e4e4e7' }
			});
			fit = new FitAddon();
			term.loadAddon(fit);
			term.open(el);
			fit.fit();

			const res = await b.spawn({ id, cwd, cols: term.cols, rows: term.rows });
			if (disposed) return;
			if (!res.ok) {
				status = 'unavailable';
				errorMsg = res.error ?? 'Failed to start the shell.';
				return;
			}
			shellName = res.shell ?? '';
			status = 'ready';

			term.onData((d) => b.write(id, d));
			term.onResize(({ cols, rows }) => b.resize(id, cols, rows));
			unsubs.push(
				b.onData(({ id: tid, data }) => {
					if (tid !== id) return;
					term?.write(data);
					if (tracked) {
						const clean = stripEscapes(data);
						tracked.out = (tracked.out + clean).slice(-MAX_CAPTURE);
						scanTail = (scanTail + clean).slice(-512);
						if (scanTail.includes(tracked.token)) {
							const { done, out } = tracked;
							tracked = null;
							// trim from the sentinel's own echo (the last "__texpile" is the token line)
							const end = out.lastIndexOf('__texpile');
							done(end > 0 ? out.slice(0, end) : out);
						}
					}
				})
			);
			unsubs.push(
				b.onExit(({ id: tid, code }) => {
					if (tid === id) {
						status = 'exited';
						term?.write(`\r\n\x1b[90m[shell exited with code ${code}]\x1b[0m\r\n`);
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
			{errorMsg || 'The terminal is only available in the desktop app.'}
		</div>
	{:else}
		<div bind:this={host} class="h-full w-full px-2 py-1"></div>
	{/if}
</div>
