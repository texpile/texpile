// Regenerates src/lib/languages/bib/bibDatamodel.ts from biblatex's own files.
//
// biblatex ships its data model as LaTeX that Biber reads, not as prose, so this reads the same
// declarations Biber does rather than the manual: blx-dm.def for the entry types, the fields and
// their datatypes, and the mandatory-field constraints; biblatex.def for the legacy BibTeX field
// names it silently renames.
//
// Run it when biblatex updates. The output is committed: a user may have another version of
// biblatex, or none, and a guest in a shared session has no TeX at all.
//
//   node scripts/gen-bib-datamodel.mjs [path-to-biblatex-dir]
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const OUT = path.join(import.meta.dirname, '../src/lib/languages/bib/bibDatamodel.ts');

/** where biblatex lives, asked of kpsewhich unless a directory is given */
function biblatexDir() {
	if (process.argv[2]) return process.argv[2];
	const found = execFileSync('kpsewhich', ['blx-dm.def'], { encoding: 'utf8' }).trim();
	if (!found) throw new Error('blx-dm.def not found; pass the biblatex directory as an argument');
	return path.dirname(found);
}

/** TeX comments, whole-line and trailing; an escaped \% is a literal percent and stays */
const strip = (tex) => tex.replace(/(?<!\\)%.*$/gm, '');
const items = (csv) =>
	csv
		.replace(/\s+/g, '')
		.split(',')
		.filter((s) => s.length > 0);

/** every `\cmd[opt]{body}` with a brace-balanced body */
function calls(src, cmd) {
	const out = [];
	const head = new RegExp('\\\\' + cmd + '(\\[[^\\]]*\\])?\\s*\\{', 'g');
	for (let m = head.exec(src); m; m = head.exec(src)) {
		const open = src.indexOf('{', m.index + cmd.length);
		let depth = 0;
		for (let i = open; i < src.length; i++) {
			if (src[i] === '{') depth++;
			else if (src[i] === '}' && --depth === 0) {
				out.push({ opt: (m[1] ?? '').replace(/^\[|\]$/g, ''), body: src.slice(open + 1, i) });
				head.lastIndex = i;
				break;
			}
		}
	}
	return out;
}

/** key=value pairs out of a declaration's optional argument */
function opts(text) {
	const out = {};
	for (const part of text.split(',')) {
		const [k, v] = part.split('=').map((s) => s?.trim());
		if (k) out[k] = v ?? true;
	}
	return out;
}

function build(dir) {
	const dm = strip(fs.readFileSync(path.join(dir, 'blx-dm.def'), 'utf8'));
	const def = strip(fs.readFileSync(path.join(dir, 'biblatex.def'), 'utf8'));
	const sty = fs.readFileSync(path.join(dir, 'biblatex.sty'), 'utf8');

	// \ProvidesPackage holds macros, not the number; the definitions above it hold the number
	const num = sty.match(/\\def\\abx@version\{([^}]*)\}/)?.[1];
	const date = sty.match(/\\def\\abx@date\{([^}]*)\}/)?.[1];
	const version = num ? `${num} (${date})` : 'unknown';

	const entryTypes = [];
	for (const { body } of calls(dm, 'DeclareDatamodelEntrytypes')) entryTypes.push(...items(body));

	const fields = {};
	for (const { opt, body } of calls(dm, 'DeclareDatamodelFields')) {
		const o = opts(opt);
		for (const name of items(body)) fields[name] = { kind: o.type ?? 'field', datatype: o.datatype ?? 'literal' };
	}

	// Dateparts are not declared, they are generated: every datatype=date field auto-creates
	// <prefix>year, <prefix>month and the rest, the prefix being its own name without the trailing
	// "date". So `date` is what gives a .bib file plain `year`, which is in no declaration at all.
	const dateparts = [
		...items(dm.match(/\\def\\blx@notnulldateparts\{([^}]*)\}/)?.[1] ?? ''),
		...items(dm.match(/\\def\\blx@nullokdateparts\{([^}]*)\}/)?.[1] ?? '')
	];
	const generatedFrom = {};
	for (const [name, spec] of Object.entries(fields)) {
		if (spec.datatype !== 'date') continue;
		const prefix = name.replace(/date$/, '');
		generatedFrom[name] = dateparts.map((p) => prefix + p);
		for (const part of generatedFrom[name]) fields[part] ??= { kind: 'field', datatype: 'datepart' };
	}

	// no optional argument means "every entry type accepts these"
	const universal = new Set();
	const byType = {};
	for (const { opt, body } of calls(dm, 'DeclareDatamodelEntryfields')) {
		const names = items(opt);
		const list = items(body);
		if (names.length === 0) {
			for (const f of list) universal.add(f);
			continue;
		}
		for (const t of names) {
			byType[t] ??= new Set();
			for (const f of list) byType[t].add(f);
		}
	}

	// A date field is in no entry-field list at all - biber splits `date` into `year`/`month`/`day`
	// before it checks them, so only the PARTS are listed. Tie the two together in both directions,
	// or the model would call `date` invalid everywhere and `year` invalid where it is spelled out.
	for (const [dateField, parts] of Object.entries(generatedFrom)) {
		if (parts.some((p) => universal.has(p)) || universal.has(dateField)) {
			universal.add(dateField);
			for (const p of parts) universal.add(p);
		}
		for (const set of Object.values(byType)) {
			if (!set.has(dateField) && !parts.some((p) => set.has(p))) continue;
			set.add(dateField);
			for (const p of parts) set.add(p);
		}
	}

	const mandatory = {};
	for (const { opt, body } of calls(dm, 'DeclareDatamodelConstraints')) {
		const types = items(opt);
		if (types.length === 0) continue;
		for (const c of calls(body, 'constraint')) {
			if (opts(c.opt).type !== 'mandatory') continue;
			const groups = [];
			for (const x of calls(c.body, 'constraintfieldsxor'))
				groups.push({ xor: calls(x.body, 'constraintfield').map((f) => f.body.trim()) });
			for (const x of calls(c.body, 'constraintfieldsor')) groups.push({ or: calls(x.body, 'constraintfield').map((f) => f.body.trim()) });
			// bare \constraintfield outside a group: each is required on its own
			const nested = new Set(
				[...calls(c.body, 'constraintfieldsxor'), ...calls(c.body, 'constraintfieldsor')].flatMap((x) =>
					calls(x.body, 'constraintfield').map((f) => f.body.trim())
				)
			);
			const all = calls(c.body, 'constraintfield')
				.map((f) => f.body.trim())
				.filter((f) => !nested.has(f));
			if (all.length) groups.push({ all });
			for (const t of types) (mandatory[t] ??= []).push(...groups);
		}
	}

	// the legacy BibTeX names biblatex renames on the way in, so "journal" is a rename and not a typo
	const aliases = {};
	for (const m of def.matchAll(/\\step\[fieldsource=([a-zA-Z]+),\s*fieldtarget=([a-zA-Z]+)\]/g)) aliases[m[1]] = m[2];

	return { version, entryTypes, fields, universal: [...universal], byType, mandatory, aliases };
}

const json = (v) => JSON.stringify(v, null, '\t').replace(/\n/g, '\n');

function emit(d) {
	const sortedByType = Object.fromEntries(
		Object.keys(d.byType)
			.sort()
			.map((t) => [t, [...d.byType[t]].sort()])
	);
	return `// GENERATED by scripts/gen-bib-datamodel.mjs - do not edit by hand.
//
// biblatex's own data model, read from the files Biber reads: which entry types exist, which
// fields each accepts, what each field holds, which are mandatory, and the legacy BibTeX names
// biblatex renames. Regenerate when biblatex updates.
//
// Source: biblatex ${d.version}

/** a field holds one value, or a list of them (authors, locations) */
export type BibFieldKind = 'field' | 'list';

export type BibFieldSpec = { kind: BibFieldKind; datatype: string };

/** one mandatory-field rule: all of them, exactly one of them, or at least one of them */
export type BibConstraint = { all?: string[]; xor?: string[]; or?: string[] };

export const BIBLATEX_VERSION = ${JSON.stringify(d.version)};

/** every entry type biblatex defines, \`customa\`-\`customf\` and the machinery types included */
export const BIB_ENTRY_TYPES: readonly string[] = ${json(d.entryTypes.sort())};

/** what each field name holds */
export const BIB_FIELDS: Readonly<Record<string, BibFieldSpec>> = ${json(
		Object.fromEntries(
			Object.keys(d.fields)
				.sort()
				.map((k) => [k, d.fields[k]])
		)
	)};

/** accepted by every entry type */
export const BIB_UNIVERSAL_FIELDS: readonly string[] = ${json(d.universal.sort())};

/** accepted by that entry type on top of the universal ones */
export const BIB_FIELDS_BY_TYPE: Readonly<Record<string, readonly string[]>> = ${json(sortedByType)};

/** what an entry of that type must carry, as biber will check it */
export const BIB_MANDATORY: Readonly<Record<string, readonly BibConstraint[]>> = ${json(d.mandatory)};

/** legacy BibTeX field names biblatex renames on input: \`journal\` is \`journaltitle\` */
export const BIB_FIELD_ALIASES: Readonly<Record<string, string>> = ${json(d.aliases)};
`;
}

const data = build(biblatexDir());
fs.writeFileSync(OUT, emit(data), 'utf8');
console.log(
	`wrote ${path.relative(process.cwd(), OUT)}: biblatex ${data.version}, ${data.entryTypes.length} entry types, ` +
		`${Object.keys(data.fields).length} fields, ${data.universal.length} universal, ` +
		`${Object.keys(data.mandatory).length} types with mandatory rules, ${Object.keys(data.aliases).length} aliases`
);
