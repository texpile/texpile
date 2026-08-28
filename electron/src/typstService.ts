// tinymist: the one binary Typst support runs on. It compiles documents (`tinymist compile`,
// embedding the Typst 0.15 crates) and serves the language features (`tinymist lsp`, stdio).
//
// The binary is NOT bundled. It is found on PATH, at a path the user configured, or in the copy
// this app downloaded into userData - in that order, so a user who manages their own toolchain
// keeps control of which version runs.
import { execFile, spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { shellEnvReady } from './shell/shellEnv';

export type TinymistInfo = {
	/** the command to spawn: an absolute path, or the bare name when it came from PATH */
	command: string;
	/** tinymist's own version, e.g. "0.15.2" */
	version: string;
	/** the Typst version its embedded compiler is, e.g. "0.15.0" - what actually builds the PDF */
	typstVersion: string;
	/** which candidate answered; see resolveTinymist for why there is no configured path */
	source: 'path' | 'managed';
};

const EXE = process.platform === 'win32' ? '.exe' : '';

/**
 * Where a copy Texpile manages itself WOULD live; the caller passes userData because app isn't
 * imported here. Nothing writes this path today - there is no downloader - so every read of it is
 * guarded by existsSync and the resolution chain below is, in practice, configured -> PATH.
 */
export function managedTinymistPath(userData: string): string {
	return path.join(userData, 'tinymist', `tinymist${EXE}`);
}

/**
 * `tinymist --version` prints a block, not a bare version:
 *     tinymist
 *     Build Git Describe:  v0.15.2
 *     ...
 *     Typst Version:       0.15.0
 * Both numbers matter: the Typst one is what a document is actually compiled by, and is the one
 * to show a user asking "which Typst built this?".
 */
function parseVersion(out: string): { version: string; typstVersion: string } {
	const v = out.match(/Build Git Describe:\s*v?([^\s]+)/i);
	const t = out.match(/Typst Version:\s*([^\s]+)/i);
	return { version: v?.[1] ?? 'unknown', typstVersion: t?.[1] ?? 'unknown' };
}

async function probe(command: string): Promise<{ version: string; typstVersion: string } | null> {
	await shellEnvReady();
	return new Promise((resolve) => {
		execFile(command, ['--version'], { timeout: 8000, windowsHide: true }, (err, stdout) => {
			if (err) return resolve(null);
			const parsed = parseVersion(stdout);
			// a binary that answers --version but names no Typst is not tinymist
			resolve(parsed.typstVersion === 'unknown' ? null : parsed);
		});
	});
}

/**
 * Find tinymist, or null when it isn't installed.
 *
 * PATH, and nothing the user configures in Texpile. There used to be a path box in Preferences,
 * removed because where a program lives is the operating system's answer to give: every installer
 * (winget, scoop, brew, cargo) puts tinymist on PATH, shellEnvReady already recovers the real
 * login-shell PATH that a GUI launch would otherwise miss, and none of the eight LaTeX tools
 * beside it has an override either. A per-app copy of $PATH is a second place for the answer to be
 * wrong.
 *
 * PATH is tried BEFORE the managed copy on purpose: someone who installed tinymist themselves means
 * for that one to be used, and silently preferring our own would compile their documents with a
 * version they did not choose.
 */
export async function resolveTinymist(userData: string): Promise<TinymistInfo | null> {
	const candidates: { command: string; source: TinymistInfo['source'] }[] = [{ command: `tinymist${EXE}`, source: 'path' }];
	const managed = managedTinymistPath(userData);
	if (fs.existsSync(managed)) candidates.push({ command: managed, source: 'managed' });

	for (const c of candidates) {
		// an absolute path that isn't there can't be spawned; skip without paying the exec timeout
		if (path.isAbsolute(c.command) && !fs.existsSync(c.command)) continue;
		const v = await probe(c.command);
		if (v) return { command: c.command, ...v, source: c.source };
	}
	return null;
}

// ---------------------------------------------------------------------------
// Language server
// ---------------------------------------------------------------------------

/**
 * LSP messages are length-prefixed on the wire (`Content-Length: N\r\n\r\n{json}`), but the
 * renderer's client speaks bare JSON strings. Framing and de-framing both live here so the
 * renderer never has to think about the byte stream.
 */
class LspFramer {
	private buf = Buffer.alloc(0);

	constructor(private onMessage: (json: string) => void) {}

	push(chunk: Buffer): void {
		this.buf = Buffer.concat([this.buf, chunk]);
		for (;;) {
			const headerEnd = this.buf.indexOf('\r\n\r\n');
			if (headerEnd < 0) return;
			const header = this.buf.subarray(0, headerEnd).toString('ascii');
			const len = /content-length:\s*(\d+)/i.exec(header);
			if (!len) {
				// unparseable header: drop it rather than stall the stream for ever
				this.buf = this.buf.subarray(headerEnd + 4);
				continue;
			}
			const start = headerEnd + 4;
			const size = Number(len[1]);
			if (this.buf.length < start + size) return; // body still arriving
			this.onMessage(this.buf.subarray(start, start + size).toString('utf8'));
			this.buf = this.buf.subarray(start + size);
		}
	}
}

export function frame(json: string): Buffer {
	const body = Buffer.from(json, 'utf8');
	return Buffer.concat([Buffer.from(`Content-Length: ${body.length}\r\n\r\n`, 'ascii'), body]);
}

export type LspHandle = {
	send(json: string): void;
	stop(): void;
};

/**
 * Start `tinymist lsp` and pipe it to the given callbacks.
 *
 * stderr is forwarded separately: tinymist logs there, and mixing it into the message stream
 * would corrupt the framing.
 */
export function startLsp(
	command: string,
	cwd: string | null,
	on: { message: (json: string) => void; exit: (code: number | null) => void; log?: (line: string) => void }
): LspHandle {
	let proc: ChildProcessWithoutNullStreams;
	try {
		proc = spawn(command, ['lsp'], {
			cwd: cwd && fs.existsSync(cwd) ? cwd : undefined,
			windowsHide: true,
			stdio: ['pipe', 'pipe', 'pipe']
		});
	} catch (err) {
		on.exit(null);
		throw err;
	}

	let alive = true;
	const framer = new LspFramer(on.message);
	proc.stdout.on('data', (c: Buffer) => framer.push(c));
	proc.stderr.on('data', (c: Buffer) => on.log?.(c.toString('utf8')));
	// exit is only reported for a GENUINE death (crash, external kill): the renderer reacts to it
	// by dropping its client and restarting things, and our own stop() must not trigger that
	proc.on('exit', (code) => {
		if (alive) on.exit(code);
		alive = false;
	});
	// a spawn failure (ENOENT) surfaces here rather than as a throw
	proc.on('error', () => {
		if (alive) on.exit(null);
		alive = false;
	});
	return {
		send(json: string) {
			if (!alive || !proc.stdin.writable) return;
			proc.stdin.write(frame(json));
		},
		stop() {
			if (!alive) return;
			alive = false;
			// LSP shutdown is a request/response dance; the client does that before calling stop,
			// so by here killing is the correct end of the conversation
			try {
				proc.kill();
			} catch {
				/* already gone */
			}
		}
	};
}
