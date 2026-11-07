// the scope of a file within its project, the counterpart of LaTeX's projectMacros
import { loadedPackage, localImports, localIncludes, typstFileScope, type OwnLet, type TypstFileScope } from '../../../knowledge';

export type ProjectFiles = {
	path: string;
	main?: string | null;
	read(path: string): Promise<string | null>;
};

const MOST_MODULES = 40;

export async function projectTexts(source: string, project: ProjectFiles): Promise<Map<string, string | null>> {
	const texts = new Map<string, string | null>();
	const queue = localImports(source, project.path);
	if (project.main && project.main !== project.path) queue.push(project.main);
	while (queue.length && texts.size < MOST_MODULES) {
		const next = queue.shift()!;
		if (texts.has(next) || next === project.path) continue;
		const text = await project.read(next).catch(() => null);
		texts.set(next, text);
		if (text === null) continue;
		queue.push(...localImports(text, next));
		if (next === project.main) queue.push(...localIncludes(text, next));
	}
	return texts;
}

export function projectScope(project: ProjectFiles, texts: Map<string, string | null>): (source: string) => TypstFileScope {
	function read(path: string): string | null {
		return texts.get(path) ?? null;
	}
	const main = project.main && project.main !== project.path ? read(project.main) : null;
	const others =
		main === null || !project.main
			? []
			: [project.main, ...localIncludes(main, project.main)]
					.filter((path) => path !== project.path && read(path) !== null)
					.map((path) => typstFileScope(read(path)!, loadedPackage, path, read));
	return (source) => {
		const file = typstFileScope(source, loadedPackage, project.path, read);
		if (!others.length) return file;
		// a name the file leaves unbound reads the main file's let, as a chapter written for that main file means it
		function own(path: string): OwnLet | null {
			const mine = file.own(path);
			if (mine) return mine.file === project.path ? { ...mine, scope: inProject } : mine;
			if (file.binds(path) || file.lookup(path)) return null;
			for (const other of others) {
				const found = other.own(path);
				if (found) return found;
			}
			return null;
		}
		const inProject: TypstFileScope = {
			lookup: file.lookup,
			own,
			binds: file.binds,
			callsWith: (role) => [file, ...others].flatMap((scope) => scope.callsWith(role))
		};
		return inProject;
	};
}
