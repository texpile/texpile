// printRaw ends every comment with a line break and opens an own-line one with another
export function joinCommentRuns(node: unknown): void {
	if (Array.isArray(node)) {
		for (let i = 0; i < node.length; i++) {
			const kid = node[i];
			const next = node[i + 1];
			if (kid?.type === 'comment' && next?.type === 'comment' && !next.sameline) kid.suffixParbreak = true;
			joinCommentRuns(kid);
		}
		return;
	}
	if (!node || typeof node !== 'object') return;
	const { content, args } = node as { content?: unknown; args?: unknown };
	if (typeof content !== 'string') joinCommentRuns(content);
	joinCommentRuns(args);
}
