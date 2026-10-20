// the TeX files a piece of source brings in, read from the package data
import { joinPath } from '../fileSystem';
import { fileCallsIn, namesTried, dirOf } from '$lib/languages/latex/knowledge/calls/fileCommands';

export type TexInclude = {
	at: number;
	/** the name as written */
	name: string;
	/** the names TeX looks for, in order */
	names: string[];
	from: 'main' | 'file';
	/** the folder the name sits under (\import{dir}{file}) */
	under: string;
};

/** every call in `code` (comments already removed) to a command that reads a TeX file, in reading order */
export function texIncludesIn(code: string): TexInclude[] {
	const out: TexInclude[] = [];
	for (const call of fileCallsIn(code, ['file'])) {
		for (const a of call.args) {
			if (!a.arg.loads) continue;
			for (const v of a.values)
				out.push({ at: v.at, name: v.value, names: namesTried(a.arg, v.value), from: a.arg.from ?? 'main', under: dirOf(call, a) });
		}
	}
	return out;
}

/** the paths to try for one include; `mainBases` are the folders searched for a name relative to the main file */
export function includePaths(include: TexInclude, fileDir: string, mainBases: string[]): string[] {
	const bases = include.from === 'file' ? [fileDir] : mainBases;
	return include.names.flatMap((name) => bases.map((base) => joinPath(include.under ? joinPath(base, include.under) : base, name)));
}

/** the first of `paths` that `read` returns, with its text */
export async function readFirst(paths: string[], read: (path: string) => Promise<string>): Promise<{ path: string; text: string } | null> {
	for (const path of paths) {
		try {
			return { path, text: await read(path) };
		} catch {
			/* try the next candidate */
		}
	}
	return null;
}
