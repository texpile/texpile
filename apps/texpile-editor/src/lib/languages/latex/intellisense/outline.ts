// symbol/outline extraction: a flat text scan producing the same shape as LaTeX Workshop's
// document-symbol tree (sections + the floats), for a future Source-mode outline
// panel. NOT wired to any UI yet — Texpile's existing TableOfContents.svelte reads the WYSIWYG
// doc via tocStore/editorViewStore, and pointing a Source-mode panel at this would need its own
// store plus a jump-by-offset affordance in WorkspaceView; deferred, see the parity report.
import { commandsWith, commonFacts } from '../knowledge/commands/commandFacts';
import { commonRegistry } from '../knowledge/registries/registries';

export type OutlineItem = {
	kind: 'section' | 'environment';
	level: number; // 1 = part, 2 = chapter, 3 = section ... 7 = subparagraph; environments go below the deepest heading
	text: string;
	pos: number;
};

const SECTION_NAMES = commandsWith('section');
const SECTION_RE = new RegExp(`\\\\(${SECTION_NAMES.join('|')})\\*?\\{`, 'g');
// the data's levels start at -1 for \part
function levelOf(name: string): number {
	return (commonFacts(name).section ?? 0) + 2;
}
const ENVIRONMENT_LEVEL = Math.max(...SECTION_NAMES.map(levelOf)) + 1;
const FLOAT_RE = new RegExp(`\\\\begin\\{(${[...new Set(commonRegistry('floats').map((f) => f.name))].join('|')})\\*?\\}`, 'g');

function balancedTitle(text: string, openBrace: number): string {
	let depth = 0;
	for (let i = openBrace; i < text.length; i++) {
		if (text[i] === '{') depth++;
		else if (text[i] === '}') {
			depth--;
			if (depth === 0)
				return text
					.slice(openBrace + 1, i)
					.replace(/\\[a-zA-Z]+\s*/g, '') // drop inline macro names ("\textbf")...
					.replace(/[{}]/g, '') // ...and the now-orphaned braces around their argument
					.replace(/\s+/g, ' ')
					.trim();
		}
	}
	return '';
}

/** extracts a flat, position-ordered outline of sections and floats. */
export function extractOutline(text: string): OutlineItem[] {
	const items: OutlineItem[] = [];

	SECTION_RE.lastIndex = 0;
	let m: RegExpExecArray | null;
	while ((m = SECTION_RE.exec(text))) {
		const openBrace = m.index + m[0].length - 1;
		items.push({
			kind: 'section',
			level: levelOf(m[1]),
			text: balancedTitle(text, openBrace) || m[1],
			pos: m.index
		});
	}

	FLOAT_RE.lastIndex = 0;
	while ((m = FLOAT_RE.exec(text))) items.push({ kind: 'environment', level: ENVIRONMENT_LEVEL, text: m[1], pos: m.index });

	return items.sort((a, b) => a.pos - b.pos);
}
