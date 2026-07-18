// the cross-file scan behind projectIntelStore: reads every project .tex (except the active
// buffer, whose live text the editor owns), the .bib files, and the main file's .aux, and
// derives what completion/hover/definition/outline need. see stores/projectIntel.ts for types.
import { readTextFile, type TexFile } from './fileSystem';
import { projectIntelStore, EMPTY_PROJECT_INTEL, type ProjectIntel } from '$lib/stores/projectIntel';
import { scanGlossary } from '$lib/editor/extensions/intellisense/completion/glossary';
import { scanScripts } from '$lib/editor/extensions/intellisense/completion/subsuperscript';
import { scanMacroDefinitions } from '$lib/editor/extensions/math-preview/userMacros';
import { parseOutlineRaw } from '$lib/editor/extensions/tableofcontents/latexHeadings';

const MAX_FILES = 300;
const MAX_FILE_LENGTH = 2_000_000;

const samePath = (a: string, b: string) => a.replace(/\\/g, '/').toLowerCase() === b.replace(/\\/g, '/').toLowerCase();

const LABEL_RE = /\\(?:line)?label\s*\{([^{}]+)\}/g;
// \newcommand family + the forms LW parses beyond it; group 1 = name, group 2 = optional [argcount]
const DEF_RES: Array<{ re: RegExp; sig: (m: RegExpExecArray) => string }> = [
	{
		re: /\\(?:new|renew|provide)command\*?\s*\{?\\([a-zA-Z@]+)\}?(?:\[(\d)\])?/g,
		sig: (m) => 'm '.repeat(+(m[2] ?? 0)).trim()
	},
	{
		re: /\\(?:New|Renew|Provide|Declare)(?:Expandable)?DocumentCommand\s*\{?\\([a-zA-Z@]+)\}?\s*\{([^{}]*)\}/g,
		sig: (m) => m[2].trim()
	},
	{ re: /\\DeclareMathOperator\*?\{\\([a-zA-Z@]+)\}/g, sig: () => '' },
	{ re: /\\DeclarePairedDelimiter(?:XPP|X)?\{?\\([a-zA-Z@]+)\}?/g, sig: () => 'm' },
	{
		re: /\\(?:(?:re)?newrobustcmd|DeclareRobustCommand)\*?\s*\{\\([a-zA-Z@]+)\}(?:\[(\d)\])?/g,
		sig: (m) => 'm '.repeat(+(m[2] ?? 0)).trim()
	}
];
const ENV_DEF_RE = /\\(?:(?:re)?newenvironment|NewDocumentEnvironment|newtheorem)\*?\s*\{([a-zA-Z][^{}\s]*)\}/g;
const BIB_ENTRY_RE = /^\s*@[a-zA-Z]+\s*\{\s*([^\s,{}]+)\s*,/gm;
// \newlabel{name}{{number}{page}...}; cleveref adds name@cref twins, skipped
const AUX_LABEL_RE = /\\newlabel\{([^{}]+)\}\{\{([^{}]*)\}\{([^{}]*)\}/g;

function scanTexIntel(text: string, file: string, into: ProjectIntel) {
	if (text.length > MAX_FILE_LENGTH) return;
	const lineStarts = [0];
	for (let i = text.indexOf('\n'); i !== -1; i = text.indexOf('\n', i + 1)) lineStarts.push(i + 1);
	const lineOf = (pos: number) => {
		let lo = 0;
		let hi = lineStarts.length - 1;
		while (lo < hi) {
			const mid = (lo + hi + 1) >> 1;
			if (lineStarts[mid] <= pos) lo = mid;
			else hi = mid - 1;
		}
		return lo + 1;
	};
	const contextAt = (pos: number): string => {
		const line = lineOf(pos);
		const from = lineStarts[Math.max(0, line - 2)];
		const to = (lineStarts[Math.min(lineStarts.length - 1, line + 1)] ?? text.length) - 1;
		return text.slice(from, Math.min(to < from ? text.length : to, from + 500));
	};

	LABEL_RE.lastIndex = 0;
	for (let m = LABEL_RE.exec(text); m; m = LABEL_RE.exec(text)) {
		into.labels.push({ name: m[1].trim(), file, line: lineOf(m.index), context: contextAt(m.index) });
	}
	const firstMacro = into.macros.length;
	for (const { re, sig } of DEF_RES) {
		re.lastIndex = 0;
		for (let m = re.exec(text); m; m = re.exec(text)) {
			into.macros.push({ name: m[1], signature: sig(m), file, line: lineOf(m.index) });
		}
	}
	// replacement bodies for this file's macros, so math previews can expand them cross-file
	const bodies = scanMacroDefinitions(text);
	for (let i = firstMacro; i < into.macros.length; i++) {
		const body = bodies[into.macros[i].name];
		if (body) {
			into.macros[i].definition = body.def;
			into.macros[i].argCount = body.args;
		}
	}
	ENV_DEF_RE.lastIndex = 0;
	for (let m = ENV_DEF_RE.exec(text); m; m = ENV_DEF_RE.exec(text)) {
		into.envs.push({ name: m[1], signature: '', file, line: lineOf(m.index) });
	}
	for (const g of scanGlossary(text)) into.glossary.push({ ...g, file });
	const scripts = scanScripts(text);
	into.sub.push(...scripts.sub);
	into.sup.push(...scripts.sup);
	into.outlines[file] = parseOutlineRaw(text);
}

async function readAux(auxPath: string, into: ProjectIntel) {
	let aux: string;
	try {
		aux = await readTextFile(auxPath);
	} catch {
		return; // never compiled (or aux elsewhere): completion just shows no numbers
	}
	AUX_LABEL_RE.lastIndex = 0;
	for (let m = AUX_LABEL_RE.exec(aux); m; m = AUX_LABEL_RE.exec(aux)) {
		if (m[1].includes('@cref')) continue;
		into.auxNumbers[m[1]] = m[2];
		into.auxPages[m[1]] = m[3];
	}
}

let scanToken = 0;

/**
 * rescan the project into projectIntelStore. cheap enough to run on file-list / main-file /
 * active-file changes (local reads of small files); the active buffer is excluded because the
 * completion sources read it live.
 */
export async function refreshProjectIntel(
	texFiles: TexFile[],
	bibPaths: string[],
	auxPath: string | null,
	activePath: string | null
): Promise<void> {
	const token = ++scanToken;
	const into: ProjectIntel = {
		...EMPTY_PROJECT_INTEL,
		labels: [],
		macros: [],
		envs: [],
		glossary: [],
		bibEntries: [],
		sub: [],
		sup: [],
		auxNumbers: {},
		auxPages: {},
		outlines: {}
	};

	const texTargets = texFiles.filter((f) => !activePath || !samePath(f.path, activePath)).slice(0, MAX_FILES);
	await Promise.all(
		texTargets.map(async (f) => {
			try {
				scanTexIntel(await readTextFile(f.path), f.path, into);
			} catch {
				/* unreadable file: skip */
			}
		})
	);
	await Promise.all(
		bibPaths.slice(0, MAX_FILES).map(async (path) => {
			try {
				const text = await readTextFile(path);
				BIB_ENTRY_RE.lastIndex = 0;
				for (let m = BIB_ENTRY_RE.exec(text); m; m = BIB_ENTRY_RE.exec(text)) {
					into.bibEntries.push({ key: m[1], file: path, line: text.slice(0, m.index).split('\n').length });
				}
			} catch {
				/* unreadable file: skip */
			}
		})
	);
	if (auxPath) await readAux(auxPath, into);

	// dedupe the repetition-mining pools
	into.sub = [...new Set(into.sub)];
	into.sup = [...new Set(into.sup)];

	if (token === scanToken) projectIntelStore.set(into);
}
