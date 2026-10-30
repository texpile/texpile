// what the files a document reads in number, counted where the \input stands
import { samePath } from '$lib/workspace/fileSystem';
import type { TexInclude } from '$lib/workspace/document/texIncludes';
import type { NumberEvent } from './numberEvents';

export type ReadInFile = { path: string; events: NumberEvent[] };

/** the folder's files as the document reads them in */
export type NumberedFiles = {
	start(): ReadInFile | null;
	/** the file an include in the file at `from` reads in, null when the folder has no such file */
	readIn(include: TexInclude, from: string): ReadInFile | null;
};

// a file that reads itself in
const DEEPEST = 8;

function foreign(event: NumberEvent): NumberEvent {
	return event.type === 'item' ? { ...event, foreign: true } : event;
}

// the events with each file read in spliced in its place, up to the first read of `stop`
function spliced(
	events: NumberEvent[],
	from: string,
	files: NumberedFiles,
	stop: string | null
): { events: NumberEvent[]; stopped: boolean } {
	const out: NumberEvent[] = [];
	function walk(list: NumberEvent[], path: string, depth: number, own: boolean): boolean {
		for (const event of list) {
			if (event.type !== 'include' || depth >= DEEPEST) {
				out.push(own ? event : foreign(event));
				continue;
			}
			for (const include of event.includes) {
				const file = files.readIn(include, path);
				if (!file) out.push({ type: 'include', includes: [include] });
				else if (stop && samePath(file.path, stop)) return true;
				else if (walk(file.events, file.path, depth + 1, false)) return true;
			}
		}
		return false;
	}
	const stopped = walk(events, from, 0, stop === null);
	return { events: out, stopped };
}

export function withReadIn(events: NumberEvent[], path: string, files: NumberedFiles): NumberEvent[] {
	return spliced(events, path, files, null).events;
}

/** what the document numbers before it first reads in the file at `path`, null when it never does */
export function eventsBefore(path: string, files: NumberedFiles): NumberEvent[] | null {
	const start = files.start();
	if (!start) return null;
	const { events, stopped } = spliced(start.events, start.path, files, path);
	return stopped ? events : null;
}
