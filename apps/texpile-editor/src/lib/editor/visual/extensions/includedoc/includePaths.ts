import { namesTried } from '$lib/languages/latex/knowledge/calls/fileCommands';
import { commonCommand, rolesOf } from '$lib/languages/latex/knowledge/calls/commandCalls';

/** the paths a chip may open, best first: the names TeX tries for the command, joined to the file's directory */
export function resolveIncludePaths(baseDir: string, rawPath: string, command: string): string[] {
	const rel = rawPath.replace(/\\/g, '/').trim();
	const arg = commonCommand(command)?.args.find((a) => a.loads && rolesOf(a).includes('file'));
	const written = command === 'typst' ? [/\.[A-Za-z0-9]+$/.test(rel) ? rel : rel + '.typ'] : arg ? namesTried(arg, rel) : [rel];
	const base = (baseDir || '').replace(/\\/g, '/').replace(/\/+$/, '');
	return written.map((name) => {
		const segs = base ? base.split('/') : [];
		for (const part of name.split('/')) {
			if (part === '' || part === '.') continue;
			if (part === '..') {
				if (segs.length) segs.pop();
				continue;
			}
			segs.push(part);
		}
		return segs.join('/');
	});
}
