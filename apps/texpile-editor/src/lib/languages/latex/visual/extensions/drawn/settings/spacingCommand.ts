import { HORIZONTAL_SPACES, VERTICAL_SKIPS } from '$lib/languages/latex/drawnCommands';

// a space as its settings: \vspace{1.5cm}, \hspace*{2em}, the named skips and quads. A length written any other way
// (\baselineskip, plus and minus) is left to the LaTeX field, so settings written back unchanged give the same bytes
export type SpacingCommand = {
	/** the whitespace around the command in the chip, kept as it was */
	lead: string;
	trail: string;
	vertical: boolean;
	name: string;
	star: boolean;
	/** '' for a named space */
	amount: string;
	unit: string;
};

export const SPACING_UNITS = ['pt', 'mm', 'cm', 'in', 'em', 'ex'];
export const VERTICAL_NAMED = ['smallskip', 'medskip', 'bigskip', 'vfill'];
export const HORIZONTAL_NAMED = [',', 'quad', 'qquad', 'hfill'];
/** what a named space measures, for the length fields while it is picked */
export const NAMED_LENGTHS: Record<string, [string, string]> = {
	...Object.fromEntries(Object.entries(VERTICAL_SKIPS).map(([name, points]) => [name, [String(points), 'pt']])),
	...Object.fromEntries(
		HORIZONTAL_NAMED.filter((name) => name in HORIZONTAL_SPACES).map((name) => [name, [String(+HORIZONTAL_SPACES[name].toFixed(2)), 'em']])
	)
};

const LENGTH = /^(\s*)\\([vh])space(\*?)\{(-?(?:\d+(?:\.\d*)?|\.\d+))(pt|mm|cm|in|em|ex|bp|pc|dd|cc|sp)\}(\s*)$/;
const NAMED = /^(\s*)\\(smallskip|medskip|bigskip|vfill|quad|qquad|hfill|,)((?:\{\})?\s*)$/;
export const AMOUNT = /^-?(?:\d+(?:\.\d*)?|\.\d+)$/;

export function readSpacing(source: string): SpacingCommand | null {
	const length = LENGTH.exec(source);
	if (length) {
		const [, lead, axis, star, amount, unit, trail] = length;
		return { lead, trail, vertical: axis === 'v', name: axis + 'space', star: star === '*', amount, unit };
	}
	const named = NAMED.exec(source);
	if (!named) return null;
	const [, lead, name, trail] = named;
	return { lead, trail, vertical: VERTICAL_NAMED.includes(name), name, star: false, amount: '', unit: '' };
}

export function writeSpacing(command: SpacingCommand): string {
	const { lead, name, trail } = command;
	if (!command.amount) return `${lead}\\${name}${trail}`;
	return `${lead}\\${name}${command.star ? '*' : ''}{${command.amount}${command.unit}}${trail.replace('{}', '')}`;
}
