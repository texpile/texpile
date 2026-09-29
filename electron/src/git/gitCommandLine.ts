// file lists cut to fit one command line, which Windows caps at 32,767 characters (VS Code's MAX_CLI_LENGTH)
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const MAX_CLI_LENGTH = 30000;

/** VS Code's splitInChunks, also counting the space and quotes around each path: 2,700 short names
 *  overran the limit on those alone */
export function* splitInChunks(paths: string[], max = MAX_CLI_LENGTH): Generator<string[]> {
	let chunk: string[] = [];
	let length = 0;
	for (const p of paths) {
		const cost = p.length + 3;
		if (length + cost > max && chunk.length) {
			yield chunk;
			chunk = [];
			length = 0;
		}
		chunk.push(p);
		length += cost;
	}
	if (chunk.length) yield chunk;
}

export async function runInChunks(paths: string[], run: (chunk: string[]) => Promise<unknown>): Promise<void> {
	for (const chunk of splitInChunks(paths)) await run(chunk);
}

/** for a command that cannot be split, a commit: past the limit the list goes in a file (git 2.25+) */
export async function runWithPathspecs<T>(paths: string[], run: (pathspecArgs: string[]) => Promise<T>): Promise<T> {
	const [first, more] = splitInChunks(paths);
	if (!more) return run(['--', ...(first ?? [])]);
	const dir = await mkdtemp(join(tmpdir(), 'texpile-pathspec-'));
	try {
		const file = join(dir, 'paths');
		await writeFile(file, paths.join('\0'));
		return await run([`--pathspec-from-file=${file}`, '--pathspec-file-nul']);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
}
