// \newlabel{name}{{number}{page}...}; cleveref adds name@cref twins, skipped
const AUX_LABEL_RE = /\\newlabel\{([^{}]+)\}\{\{([^{}]*)\}\{([^{}]*)\}/g;

/** The numbers and pages the last compile recorded for every label, straight out of the .aux. */
export function parseAuxLabels(aux: string): { numbers: Record<string, string>; pages: Record<string, string> } {
	const numbers: Record<string, string> = {};
	const pages: Record<string, string> = {};
	AUX_LABEL_RE.lastIndex = 0;
	for (let m = AUX_LABEL_RE.exec(aux); m; m = AUX_LABEL_RE.exec(aux)) {
		if (m[1].includes('@cref')) continue;
		numbers[m[1]] = m[2];
		pages[m[1]] = m[3];
	}
	return { numbers, pages };
}
