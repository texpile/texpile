// `git status` read here rather than by simple-git, whose parser trims every record: a name starting
// or ending with a space lost it. The branch line is read with simple-git's own patterns.
import type { SimpleGit } from 'simple-git';

export type StatusFile = { path: string; index: string; working_dir: string; from?: string };

export type StatusRead = {
	files: StatusFile[];
	/** the files both sides changed, as git's unmerged codes name them */
	conflicted: string[];
	current: string | null;
	tracking: string | null;
	ahead: number;
	behind: number;
	detached: boolean;
};

function parseStatus(raw: string): StatusRead {
	const out: StatusRead = { files: [], conflicted: [], current: null, tracking: null, ahead: 0, behind: 0, detached: false };
	const records = raw.split('\0');
	for (let i = 0; i < records.length; i++) {
		const record = records[i];
		if (record.startsWith('## ')) {
			const line = record.slice(3);
			out.ahead = Number(/ahead (\d+)/.exec(line)?.[1] ?? 0);
			out.behind = Number(/behind (\d+)/.exec(line)?.[1] ?? 0);
			out.current = /\son\s(\S+?)(?=\.{3}|$)/.exec(line)?.[1] ?? /^(.+?(?=(?:\.{3}|\s|$)))/.exec(line)?.[1] ?? null;
			out.tracking = /\.{3}(\S*)/.exec(line)?.[1] ?? null;
			out.detached = /\(no branch\)/.test(line);
			continue;
		}
		if (record.length < 4) continue;
		const file: StatusFile = { path: record.slice(3), index: record[0], working_dir: record[1] };
		// a rename or a copy names the path it came from in the record after it
		if ('RC'.includes(file.index) || 'RC'.includes(file.working_dir)) file.from = records[++i];
		out.files.push(file);
	}
	out.conflicted = out.files.filter((f) => isUnmergedCode(f.index, f.working_dir)).map((f) => f.path);
	return out;
}

function isUnmergedCode(x: string, y: string): boolean {
	return x === 'U' || y === 'U' || (x === 'A' && y === 'A') || (x === 'D' && y === 'D');
}

/** the flags simple-git's status() runs with, so what git prints is unchanged */
export async function statusOf(g: SimpleGit, args: string[] = []): Promise<StatusRead> {
	return parseStatus(await g.raw(['status', '--porcelain', '-b', '-u', '--null', ...args]));
}
