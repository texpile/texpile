// Hayagriva, Typst's own bibliography format: a YAML file mapping each citation key to its fields
// (https://github.com/typst/hayagriva/blob/main/docs/file-format.md). Read for the editors only -
// the key for @-completion and the citation chips, and title, authors, date, DOI and arXiv ID for
// display and for Cite by DOI's "already cited" check. Nothing is ever written back.
//
// It declines - null - on any file that is not a mapping of entries made of Hayagriva's fields, so
// the project's other YAML (CI workflows, configs, CSL-YAML lists) never turns into references.
import type { BiblatexReference } from './types';
import { parseYamlSubset, type YamlNode } from './hayagrivaYaml';

/** every field an entry (or a parent) may carry, per the file-format reference */
const FIELDS = new Set([
	'type',
	'title',
	'author',
	'date',
	'parent',
	'abstract',
	'genre',
	'editor',
	'affiliated',
	'call-number',
	'publisher',
	'location',
	'organization',
	'issue',
	'volume',
	'volume-total',
	'chapter',
	'edition',
	'page-range',
	'page-total',
	'time-range',
	'runtime',
	'url',
	'serial-number',
	'language',
	'archive',
	'archive-location',
	'note'
]);

/** the file's entries, or null when it is not a Hayagriva file */
export function parseHayagriva(text: string): BiblatexReference[] | null {
	let doc: YamlNode | null;
	try {
		doc = parseYamlSubset(text);
	} catch {
		return null;
	}
	if (!isMap(doc)) return null;
	const entries = Object.entries(doc);
	if (!entries.length) return null;
	// every entry a mapping that names at least one Hayagriva field: a workflow's `jobs:` or a
	// compose file's `services:` is a mapping of mappings too, but of the wrong keys
	for (const [, fields] of entries) if (!isMap(fields) || !Object.keys(fields).some((f) => FIELDS.has(f))) return null;
	return entries.map(([key, fields]) => toReference(key, fields as Record<string, YamlNode>));
}

function toReference(key: string, e: Record<string, YamlNode>): BiblatexReference {
	const ref: BiblatexReference = { key, entrytype: scalar(e.type)?.toLowerCase() || 'misc', fromHayagriva: true };
	// a chapter or an article may leave its title, authors and date to the book or journal it
	// sits in; the picker and the chips show those rather than a bare key
	const parent = [e.parent].flat()[0];
	const up = isMap(parent) ? parent : {};
	const title = scalar(e.title) ?? scalar(up.title);
	if (title) ref.title = title;
	const author = persons(e.author) ?? persons(up.author);
	if (author) ref.author = author;
	const date = (scalar(e.date) ?? scalar(up.date))?.replace(/^~/, '');
	if (date) {
		ref.date = date;
		const year = /-?\d{4}/.exec(date);
		if (year) ref.year = year[0];
	}
	const serial = e['serial-number'];
	const doi = isMap(serial) ? scalar(serial.doi) : undefined;
	if (doi) ref.doi = doi;
	const arxiv = isMap(serial) ? scalar(serial.arxiv) : undefined;
	if (arxiv) ref.eprint = arxiv;
	const url = scalar(e.url);
	if (url) ref.url = url;
	return ref;
}

function isMap(n: YamlNode | null | undefined): n is { [key: string]: YamlNode } {
	return !!n && typeof n === 'object' && !Array.isArray(n);
}

/** a formattable string's text: plain, or the `value` of its long form */
function scalar(n: YamlNode | undefined): string | undefined {
	if (typeof n === 'string') return n.trim() || undefined;
	if (isMap(n)) return scalar(n.value);
	return undefined;
}

/** a person as BibTeX writes one ("Last, First"), which is also Hayagriva's short form */
function person(n: YamlNode): string | undefined {
	if (typeof n === 'string') return n.trim() || undefined;
	if (!isMap(n)) return undefined;
	const name = [scalar(n.prefix), scalar(n.name)].filter(Boolean).join(' ');
	if (!name) return scalar(n.alias);
	return [name, scalar(n.suffix), scalar(n['given-name'])].filter(Boolean).join(', ');
}

/** one person or a list, joined the way a .bib author field is */
function persons(n: YamlNode | undefined): string | undefined {
	if (n === undefined) return undefined;
	const list = (Array.isArray(n) ? n : [n]).map(person).filter((p): p is string => !!p);
	return list.length ? list.join(' and ') : undefined;
}
