// The What's New page is built from the root CHANGELOG.md, the same file the app's What's New
// panel reads (apps/texpile-editor/scripts/changelog.mjs), so release notes are written once.

const SRC = Object.values(import.meta.glob('../../../../CHANGELOG.md', { query: '?raw', import: 'default', eager: true }))[0] as string;
const ISSUES = 'https://github.com/texpile/texpile/issues/';

interface Release {
	version: string;
	date?: string;
	added: string[];
	fixed: string[];
}

/** shipped releases from 1.0.0 on, newest first; Unreleased and prereleases are left out */
function releases(): Release[] {
	const out: Release[] = [];
	let cur: Release | null = null;
	for (const line of SRC.split('\n')) {
		const h = /^##\s+\[?([^\]\s]+)\]?(?:\s*[-–]\s*(\d{4}-\d{2}-\d{2}))?/.exec(line);
		if (h) {
			cur = /^[1-9]\d*\.\d+\.\d+$/.test(h[1]) ? { version: h[1], date: h[2], added: [], fixed: [] } : null;
			if (cur) out.push(cur);
			continue;
		}
		const b = /^\s*[-*]\s+(.*\S)\s*$/.exec(line);
		if (!b || !cur) continue;
		const typed = /^(\w+)(?:\([^)]*\))?!?:\s*(.*)$/.exec(b[1]);
		const text = tidy(typed ? typed[2] : b[1]);
		(typed?.[1] === 'fix' ? cur.fixed : cur.added).push(text);
	}
	return out;
}

/** a note as a reader sees it: no author credit, a capital letter, issue numbers linked */
function tidy(note: string): string {
	const t = note
		.replace(/\s*\(?by @[\w-]+\)?\s*$/, '')
		.replace(/\.$/, '')
		.replace(/(^|\s)#(\d+)\b/g, `$1[#$2](${ISSUES}$2)`);
	return t.charAt(0).toUpperCase() + t.slice(1);
}

/** markdown for the releases, one `##` per version */
export function changelogMarkdown(): string {
	return releases()
		.map((r) => {
			const list = (title: string, notes: string[]) => (notes.length ? `**${title}**\n\n${notes.map((n) => `- ${n}`).join('\n')}\n` : '');
			return [`## ${r.version}${r.date ? ` (${r.date})` : ''}`, '', list('New', r.added), list('Fixed', r.fixed)]
				.filter(Boolean)
				.join('\n');
		})
		.join('\n');
}
