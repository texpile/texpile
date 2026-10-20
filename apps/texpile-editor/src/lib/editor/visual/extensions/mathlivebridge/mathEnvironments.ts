// LaTeX multiline math environments: which are numbered, which label per line, and how a
// block_math node's attrs follow the latex source as it is edited.
import type { Node, Attrs } from 'prosemirror-model';
import { generateLabel } from '$lib/editor/visual/label';
import { splitRows } from '$lib/languages/latex/serializer/mathBlocks';
import { commonEnvFacts, commonEnvNames, envNameAlternation } from '$lib/languages/latex/knowledge/environments/envFacts';

const MULTILINE_ENVIRONMENTS = commonEnvNames((f) => f.body === 'math-display' && f.rows === true).filter(
	(name) => commonEnvFacts(`${name}*`).body === 'math-display'
);

export function isMultilineEnvironment(name: string): boolean {
	return MULTILINE_ENVIRONMENTS.includes(name);
}

/** '' for an environment that prints no number of its own */
export function environmentNumbering(name: string): string {
	return commonEnvFacts(name).numbering ?? '';
}

export function isPerLineEnvironment(name: string): boolean {
	return environmentNumbering(name) === 'per-row';
}

export function isSingleLabelEnvironment(name: string): boolean {
	return environmentNumbering(name) === 'single';
}

/** the environment's name with its number on or off */
export function environmentName(environment: string, numbered: boolean): string {
	return numbered ? environment : `${environment}*`;
}

type EnvironmentDetection = {
	environment: string;
	numbered: boolean;
	supportsPerLineLabels: boolean;
};

export function detectMultilineEnvironment(latex: string): EnvironmentDetection | null {
	for (const environment of MULTILINE_ENVIRONMENTS) {
		for (const numbered of [false, true]) {
			const name = environmentName(environment, numbered);
			if (new RegExp(`\\\\begin\\{${envNameAlternation([name])}\\}`).test(latex)) {
				return { environment, numbered: !!commonEnvFacts(name).numbering, supportsPerLineLabels: isPerLineEnvironment(environment) };
			}
		}
	}
	return null;
}

/** the rows of the environment `latex` is set in, not those of a cases or matrix inside it */
function environmentRows(latex: string): string[] {
	// no brace inside a name: [^}]* also ran over '{', so a run of \begin{{ was rescanned from each one
	const open = /\\begin\{[^{}]*\}(\{[^{}]*\})?/.exec(latex);
	const from = open ? open.index + open[0].length : 0;
	const to = latex.lastIndexOf('\\end{');
	return splitRows(latex.slice(from, to > from ? to : latex.length)).filter((_, i) => i % 2 === 0);
}

function countEnvironmentLines(latex: string): number {
	return environmentRows(latex).length;
}

/**
 * How many numbers align/gather actually print. Not the label count: a row carries a number
 * whether or not anyone gave it a \label, so counting labels showed one "(1)" beside an
 * unlabelled two-row align that the PDF numbered twice.
 */
export function numberedLineCount(latex: string): number {
	const rows = environmentRows(latex);
	if (rows.length > 1 && !rows[rows.length - 1].trim()) rows.pop(); // a trailing \\ ends the last row
	return Math.max(1, rows.filter((r) => !/\\(?:nonumber|notag)\b/.test(r)).length);
}

/** rewrites align <-> align* (and friends) in the latex source. */
export function toggleEnvironmentStar(latex: string, addStar: boolean): string {
	for (const env of MULTILINE_ENVIRONMENTS) {
		if (addStar) {
			const beginPattern = new RegExp(`\\\\begin\\{${env}\\}`);
			if (beginPattern.test(latex)) {
				return latex
					.replace(new RegExp(`\\\\begin\\{${env}\\}`, 'g'), `\\begin{${env}*}`)
					.replace(new RegExp(`\\\\end\\{${env}\\}`, 'g'), `\\end{${env}*}`);
			}
		} else {
			const starredBeginPattern = new RegExp(`\\\\begin\\{${env}\\*\\}`);
			if (starredBeginPattern.test(latex)) {
				return latex
					.replace(new RegExp(`\\\\begin\\{${env}\\*\\}`, 'g'), `\\begin{${env}}`)
					.replace(new RegExp(`\\\\end\\{${env}\\*\\}`, 'g'), `\\end{${env}}`);
			}
		}
	}
	return latex;
}

/** initial block_math attrs for a latex string: detects multiline envs, sets numbered/lineLabels, auto-labels numbered equations. */
export function computeMathAttrs(latex: string): { environment: string | null; numbered: boolean; lineLabels: string[]; label?: string } {
	const detection = detectMultilineEnvironment(latex);

	if (!detection) {
		return { environment: null, numbered: false, lineLabels: [] };
	}

	const isNumbered = detection.numbered;

	if (!detection.supportsPerLineLabels) {
		const attrs: { environment: string | null; numbered: boolean; lineLabels: string[]; label?: string } = {
			environment: detection.environment,
			numbered: isNumbered,
			lineLabels: [] // single-label envs use node.attrs.label instead
		};
		if (isNumbered) {
			attrs.label = generateLabel('equation');
		}
		return attrs;
	}

	const lineCount = countEnvironmentLines(latex);
	const lineLabels = Array(lineCount)
		.fill('')
		.map(() => (isNumbered ? generateLabel('equation') : ''));

	return {
		environment: detection.environment,
		numbered: isNumbered,
		lineLabels
	};
}

/** re-detects the multiline env after an edit and syncs environment/numbered/lineLabels attrs. */
export function syncBlockMathAttrs(node: Node, newValue: string): Attrs {
	const newAttrs = { ...node.attrs };
	const detection = detectMultilineEnvironment(newValue);
	const currentEnv = node.attrs.environment;
	const detectedEnv = detection?.environment || null;

	if (detectedEnv !== currentEnv) {
		newAttrs.environment = detectedEnv;
		if (detection) {
			if (!detection.supportsPerLineLabels) {
				newAttrs.lineLabels = [];
				newAttrs.numbered = detection.numbered;
			} else {
				const lineCount = countEnvironmentLines(newValue);
				const existingLabels = (node.attrs.lineLabels as string[]) || [];
				// keep existing labels, auto-generate for new lines when numbered
				newAttrs.lineLabels = Array(lineCount)
					.fill('')
					.map((_, i) => existingLabels[i] || (detection.numbered ? generateLabel('equation') : ''));
				newAttrs.numbered = detection.numbered;
			}
		} else {
			newAttrs.lineLabels = [];
		}
	} else if (detection) {
		const wasNumbered = node.attrs.numbered;
		const shouldBeNumbered = detection.numbered;
		if (wasNumbered !== shouldBeNumbered) {
			newAttrs.numbered = shouldBeNumbered;
		}
		if (detection.supportsPerLineLabels) {
			const lineCount = countEnvironmentLines(newValue);
			const existingLabels = (node.attrs.lineLabels as string[]) || [];
			// only a row the edit added is labelled: a row the file left without one stays so
			const linesBefore = countEnvironmentLines(node.textContent);
			if (lineCount !== linesBefore) {
				newAttrs.lineLabels = Array(lineCount)
					.fill('')
					.map((_, i) => existingLabels[i] || (shouldBeNumbered && i >= linesBefore ? generateLabel('equation') : ''));
			}
		}
	}
	return newAttrs;
}

/** empty including wrapper-only content like \begin{align} & \end{align}. */
export function isMathLatexEmpty(rawValue: string): boolean {
	if (rawValue.length < 1 || rawValue.trim() === '' || rawValue === ' ') {
		return true;
	}

	const strippedValue = rawValue
		// drop envs whose body is only whitespace, &, or \\ (a name of letters, so `\begin{{` is not
		// read to the end once for each)
		.replace(/\\begin\{([a-zA-Z]+\*?)\}[\s&\\]*\\end\{\1\}/g, '')
		.replace(/&/g, '')
		.replace(/\\\\/g, '')
		.trim();

	return strippedValue.length === 0;
}

/** an empty display of the same kind, for Shift+Enter. */
export function emptyMathBlockLike(node: Node): Node {
	const { environment, numbered, starredEnv, continuesAfter } = node.attrs;
	const { schema } = node.type;
	// continuesAfter: the prose after this display now follows the new one
	if (environment) {
		// alignat needs a column count ({2}) an empty copy would not have; align lines up the same way without one
		const kind = environment === 'alignat' ? 'align' : environment;
		const env = environmentName(kind, numbered);
		const latex = `\\begin{${env}}\\end{${env}}`;
		return node.type.create({ ...computeMathAttrs(latex), continuesAfter }, schema.text(latex));
	}
	const label = numbered ? generateLabel('equation') : null;
	return node.type.create({ numbered, starredEnv, continuesAfter, label }, schema.text(' '));
}
