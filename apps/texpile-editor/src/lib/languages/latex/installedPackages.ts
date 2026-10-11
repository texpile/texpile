// argument signatures for the packages a document loads: from the user's package file for one, else
// from the installed .sty of one Texpile has no contents for. main .sty and \newcommand family only:
// \def and the package's other files brought in too many internals (texpile-tools package-scan)
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

/** what a package's .sty defines and a reader would type: its own \newcommand family, internals left out */
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

// a package file names each command's arguments as a format; those the parser can read stand in for the .sty
function fileDefinitions(contents: PackageData): string {
	const lines = new Map<string, string>();
	for (const m of contents.macros) {
		const signature = m.arg ? signatureOfFormat(m.arg.format) : '';
		if (signature === null || !/^[a-zA-Z]+$/.test(m.name) || KNOWN.has(m.name) || lines.has(m.name)) continue;
		lines.set(m.name, definitionLine(m.name, signature));
	}
	return [...lines.values()].join('\n');
}

// a name built from a parameter (wrapfig's wrap#2) or an internal one (with @) is no environment to offer
const ENVIRONMENT = /\\(?:new|New(?:Document)?)environment\*?\s*\{([a-zA-Z][a-zA-Z0-9-]*\*?)\}/g;

/** a starting package file from a .sty: its commands with their arguments, and its environments */
export function packageFileFrom(source: string): PackageData {
	const macros: PkgEntry[] = [...publicDefinitions(source)].map(([name, signature]) => {
		const args = signature.split(/\s+/).filter(Boolean);
		// a spec past [] and {} (a star, a default, a delimited one) has no format to say it
		if (!args.length || args.some((a) => a !== 'm' && a !== 'o')) return { name };
		const format = args.map((a) => (a === 'o' ? '[]' : '{}')).join('');
		const snippet = name + args.map((a, i) => (a === 'o' ? `[\${${i + 1}}]` : `{\${${i + 1}}}`)).join('');
		return { name, arg: { format, snippet } };
	});
	const envs = [...new Set([...source.matchAll(ENVIRONMENT)].map((m) => m[1]))].map((name) => ({ name }));
	return { macros, envs, keys: {} };
}

/** empty definitions standing in for what the named packages define, for the parser's signature scan */
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
