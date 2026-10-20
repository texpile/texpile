// a cross-reference as its settings, the command and its labels
export type CrossRefCommand = { name: string; star: boolean; labels: string };

const CROSS_REF = /^(\s*\\)(ref|eqref|pageref|cref|Cref|autoref|nameref)(\*?)\{([^{}]*)\}(\s*)$/;

export function readCrossRef(source: string): CrossRefCommand | null {
	const match = CROSS_REF.exec(source);
	return match ? { name: match[2], star: match[3] === '*', labels: match[4] } : null;
}

/** `starred` is the commands the loaded files give a star; a command already written with one keeps it */
export function writeCrossRef(source: string, next: CrossRefCommand, starred: string[] = []): string {
	const star = next.star && (starred.includes(next.name) || readCrossRef(source)?.name === next.name) ? '*' : '';
	return source.replace(CROSS_REF, (_, lead: string, ...rest: string[]) => `${lead}${next.name}${star}{${next.labels}}${rest[3]}`);
}

export function labelList(labels: string): string[] {
	return labels
		.split(',')
		.map((label) => label.trim())
		.filter(Boolean);
}
