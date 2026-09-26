// LaTeX multiline math environments: which are numbered, which label per line, and how a
// block_math node's attrs follow the latex source as it is edited.
import type { Node, Attrs } from 'prosemirror-model';
import { generateLabel } from '$lib/editor/visual/label';

const PER_LINE_ENVIRONMENTS = ['align', 'gather', 'alignat', 'eqnarray'] as const;
export const SINGLE_LABEL_ENVIRONMENTS = ['multline'] as const;
const MULTILINE_ENVIRONMENTS = [...PER_LINE_ENVIRONMENTS, ...SINGLE_LABEL_ENVIRONMENTS] as const;
type MultilineEnvironment = (typeof MULTILINE_ENVIRONMENTS)[number];

type EnvironmentDetection = {
	environment: MultilineEnvironment;
	isStarred: boolean; // starred (align*) = unnumbered
	supportsPerLineLabels: boolean;
};

export function detectMultilineEnvironment(latex: string): EnvironmentDetection | null {
	for (const env of MULTILINE_ENVIRONMENTS) {
		const starredPattern = new RegExp(`\\\\begin\\{${env}\\*\\}`);
		if (starredPattern.test(latex)) {
			return {
				environment: env,
				isStarred: true,
				supportsPerLineLabels: (PER_LINE_ENVIRONMENTS as readonly string[]).includes(env)
			};
		}
		const unstarredPattern = new RegExp(`\\\\begin\\{${env}\\}`);
		if (unstarredPattern.test(latex)) {
			return {
				environment: env,
				isStarred: false,
				supportsPerLineLabels: (PER_LINE_ENVIRONMENTS as readonly string[]).includes(env)
			};
		}
	}
	return null;
}

function countEnvironmentLines(latex: string): number {
	const matches = latex.match(/\\\\/g);
	return matches ? matches.length + 1 : 1;
}

/**
 * How many numbers align/gather actually print. Not the label count: a row carries a number
 * whether or not anyone gave it a \label, so counting labels showed one "(1)" beside an
 * unlabelled two-row align that the PDF numbered twice.
 */
export function numberedLineCount(latex: string): number {
	const body = latex.replace(/^[\s\S]*?\\begin\{[^}]*\}/, '').replace(/\\end\{[^}]*\}[\s\S]*$/, '');
	const rows = body.split(/\\\\/);
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

	const isNumbered = !detection.isStarred;

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
				newAttrs.numbered = !detection.isStarred;
			} else {
				const lineCount = countEnvironmentLines(newValue);
				const existingLabels = (node.attrs.lineLabels as string[]) || [];
				// keep existing labels, auto-generate for new lines when numbered
				newAttrs.lineLabels = Array(lineCount)
					.fill('')
					.map((_, i) => existingLabels[i] || (!detection.isStarred ? generateLabel('equation') : ''));
				newAttrs.numbered = !detection.isStarred;
			}
		} else {
			newAttrs.lineLabels = [];
		}
	} else if (detection) {
		const wasNumbered = node.attrs.numbered;
		const shouldBeNumbered = !detection.isStarred;
		if (wasNumbered !== shouldBeNumbered) {
			newAttrs.numbered = shouldBeNumbered;
		}
		if (detection.supportsPerLineLabels) {
			const lineCount = countEnvironmentLines(newValue);
			const existingLabels = (node.attrs.lineLabels as string[]) || [];
			if (lineCount !== existingLabels.length) {
				newAttrs.lineLabels = Array(lineCount)
					.fill('')
					.map((_, i) => existingLabels[i] || (shouldBeNumbered ? generateLabel('equation') : ''));
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
		// drop envs whose body is only whitespace, &, or \\
		.replace(/\\begin\{([^}]+)\}[\s&\\]*\\end\{\1\}/g, '')
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
		const env = numbered ? kind : `${kind}*`;
		const latex = `\\begin{${env}}\\end{${env}}`;
		return node.type.create({ ...computeMathAttrs(latex), continuesAfter }, schema.text(latex));
	}
	const label = numbered ? generateLabel('equation') : null;
	return node.type.create({ numbered, starredEnv, continuesAfter, label }, schema.text(' '));
}
