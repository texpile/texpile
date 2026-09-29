// How a path is written in the panel. One implementation, because two lists show the same files
// and reading two different ways in two rows is worse than either way.

export type PathLabels = {
	/** relative to the open folder, forward-slashed */
	relPath: (p: string) => string;
	baseName: (p: string) => string;
	/** empty at the top level */
	dirName: (p: string) => string;
};

export function pathLabels(root: string): PathLabels {
	const rootN = root.replace(/\\/g, '/').replace(/\/+$/, '');
	function relPath(p: string): string {
		const a = p.replace(/\\/g, '/');
		return a.startsWith(rootN + '/') ? a.slice(rootN.length + 1) : a;
	}
	return {
		relPath,
		baseName: (p) => p.split(/[\\/]/).pop() ?? p,
		dirName: (p) => {
			const r = relPath(p);
			const i = r.lastIndexOf('/');
			return i >= 0 ? r.slice(0, i) : '';
		}
	};
}
