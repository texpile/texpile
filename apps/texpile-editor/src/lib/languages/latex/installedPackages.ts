// argument signatures for loaded packages, from the user's package file or the installed .sty
import { macroInfo } from '@unified-latex/unified-latex-ctan';
import { MACRO_SIGNATURES } from './parser/macros';
import { isBundledPackage, type PackageData, type PkgEntry } from './intellisense/completion/packageData';
import { signatureOfFormat, userPackage } from './intellisense/userPackages';
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

/** a .sty's own \newcommand family only; \def and its other files brought in too many internals */
function publicDefinitions(source: string): Map<string, string> {
	const found = new Map<string, string>();
	for (const d of macroDefinitionsIn(source)) {
		if (d.redefines || d.name.includes('@') || KNOWN.has(d.name) || found.has(d.name)) continue;
		found.set(d.name, d.signature);
	}
	return found;
}

function definitionsOf(source: string): string {
	return [...publicDefinitions(source)].map(([name, signature]) => definitionLine(name, signature)).join('\n');
}

function fileDefinitions(contents: PackageData): string {
	const lines = new Map<string, string>();
	for (const m of contents.macros) {
		const signature = m.arg ? signatureOfFormat(m.arg.format) : '';
		if (signature === null || !/^[a-zA-Z]+$/.test(m.name) || KNOWN.has(m.name) || lines.has(m.name)) continue;
		lines.set(m.name, definitionLine(m.name, signature));
	}
	return [...lines.values()].join('\n');
}

// leaves out names built from a parameter (wrapfig's wrap#2) and internal ones with @
const ENVIRONMENT = /\\(?:new|New(?:Document)?)environment\*?\s*\{([a-zA-Z][a-zA-Z0-9-]*\*?)\}/g;

/** a starting package file drafted from a .sty */
export function packageFileFrom(source: string): PackageData {
	const macros: PkgEntry[] = [...publicDefinitions(source)].map(([name, signature]) => {
		const args = signature.split(/\s+/).filter(Boolean);
		// a package file format has only [] and {}
		if (!args.length || args.some((a) => a !== 'm' && a !== 'o')) return { name };
		const format = args.map((a) => (a === 'o' ? '[]' : '{}')).join('');
		const snippet = name + args.map((a, i) => (a === 'o' ? `[\${${i + 1}}]` : `{\${${i + 1}}}`)).join('');
		return { name, arg: { format, snippet } };
	});
	const envs = [...new Set([...source.matchAll(ENVIRONMENT)].map((m) => m[1]))].map((name) => ({ name }));
	return { macros, envs, keys: {} };
}

/** stub definitions of the packages' commands, for the parser's signature scan */
export async function installedPackageDefinitions(names: Iterable<string>, read: ReadInstalledPackage): Promise<string> {
	const wanted = [...new Set(names)].filter((n) => PACKAGE_NAME.test(n));
	const found = await Promise.all(
		wanted.map((name) => {
			const own = userPackage(name);
			if (own) return fileDefinitions(own);
			if (isBundledPackage(name)) return '';
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
