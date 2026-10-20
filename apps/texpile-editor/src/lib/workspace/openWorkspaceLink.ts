// A markdown link inside the workspace: external schemes stay with the browser, same-page
// anchors are the renderer's, and a relative path opens as a workspace file.
export function openWorkspaceLink(href: string, jumpToFile: (targets: string[]) => void): boolean {
	if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return false;
	if (href.startsWith('#')) return true;
	const path = href.split('#')[0];
	// hrefs reach us already decoded (see `dest` in markdown/converter.ts); this only catches a
	// target still holding escapes, and must not throw on a literal `%` that decodes to nothing
	let target = path;
	try {
		target = decodeURIComponent(path);
	} catch {
		/* not valid escaping: the raw text IS the path */
	}
	jumpToFile([target]);
	return true;
}
