// argument signatures for installed packages Texpile has no data for. main .sty and \newcommand
// family only: \def and the package's other files brought in too many internals (texpile-tools package-scan)
import { macroInfo } from '@unified-latex/unified-latex-ctan';
import { MACRO_SIGNATURES } from './parser/macros';
import { isBundledPackage } from './intellisense/completion/packageData';
import { macroDefinitionsIn } from './macroDefinitions';

export type ReadInstalledPackage = (file: string) => Promise<string | null>;

const PACKAGE_NAME = /^[\w.+-]+$/;
// a package's own definition never narrows one the parser already has
const KNOWN = new Set([...Object.keys(MACRO_SIGNATURES), ...Object.values(macroInfo).flatMap((pkg) => Object.keys(pkg))]);
const cache = new Map<string, Promise<string>>();

function definitionLine(name: string, signature: string): string {
	const args = signature.split(/\s+/).filter(Boolean);
	if (args.every((a) => a === 'm')) return `\\newcommand{\\${name}}${args.length ? `[${args.length}]` : ''}{}`;
	return `\\NewDocumentCommand{\\${name}}{${signature}}{}`;
}

function definitionsOf(source: string): string {
	const lines = new Map<string, string>();
	for (const d of macroDefinitionsIn(source)) {
		if (d.redefines || d.name.includes('@') || KNOWN.has(d.name) || lines.has(d.name)) continue;
		lines.set(d.name, definitionLine(d.name, d.signature));
	}
	return [...lines.values()].join('\n');
}

/** empty definitions standing in for what the named packages define, for the parser's signature scan */
export async function installedPackageDefinitions(names: Iterable<string>, read: ReadInstalledPackage): Promise<string> {
	const wanted = [...new Set(names)].filter((n) => PACKAGE_NAME.test(n) && !isBundledPackage(n));
	const found = await Promise.all(
		wanted.map((name) => {
			let entry = cache.get(name);
			if (!entry) {
				entry = read(`${name}.sty`).then(
					(source) => {
						// asked again next time: TeX may be installed or found by then
						if (source === null) cache.delete(name);
						return source ? definitionsOf(source) : '';
					},
					() => {
						cache.delete(name);
						return '';
					}
				);
				cache.set(name, entry);
			}
			return entry;
		})
	);
	return found.filter(Boolean).join('\n');
}
