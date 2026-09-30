import { describe, expect, it } from 'vitest';
import { parseHayagriva } from '$lib/languages/bib/biblatex';

const SAMPLE = `# my references
kinetics:
    type: Article
    title: Kinetics and luminescence of the excitations of a nonequilibrium polariton condensate
    author: ["Doan, T. D.", "Tran Thoai, D. B.", "Haug, Hartmut"]
    serial-number:
        doi: "10.1103/PhysRevB.102.165126"
    page-range: 165126-165139
    date: 2020-10-14
    parent:
        type: Periodical
        title: Physical Review B

electronic:
    type: Web
    title: Ishkur's Guide to Electronic Music   # a comment
    author: Ishkur
    url: { value: http://www.techno.org/electronic-music-guide/, date: 2020-11-30 }
`;

describe('parseHayagriva', () => {
	it('reads each entry under its key, with the fields the editors show', () => {
		const refs = parseHayagriva(SAMPLE)!;
		expect(refs.map((r) => r.key)).toEqual(['kinetics', 'electronic']);
		expect(refs[0]).toMatchObject({
			entrytype: 'article',
			title: 'Kinetics and luminescence of the excitations of a nonequilibrium polariton condensate',
			author: 'Doan, T. D. and Tran Thoai, D. B. and Haug, Hartmut',
			date: '2020-10-14',
			year: '2020',
			doi: '10.1103/PhysRevB.102.165126',
			fromHayagriva: true
		});
		expect(refs[1]).toMatchObject({
			entrytype: 'web',
			title: "Ishkur's Guide to Electronic Music",
			author: 'Ishkur',
			url: 'http://www.techno.org/electronic-music-guide/'
		});
	});

	it('reads block lists, person mappings and the long form of a title', () => {
		const refs = parseHayagriva(`hooks:
  type: book
  title:
    value: "All About Love: New Visions"
    short: All About Love
  author:
    - given-name: Gloria Jean
      name: Watkins
    - von der Leyen, Ursula
  date: ~2000
`)!;
		expect(refs[0]).toMatchObject({
			title: 'All About Love: New Visions',
			author: 'Watkins, Gloria Jean and von der Leyen, Ursula',
			date: '2000',
			year: '2000'
		});
	});

	it("takes a chapter's missing title, authors and date from its parent", () => {
		const refs = parseHayagriva(`inheritance:
    type: Chapter
    page-range: 218-231
    parent:
        title: Inheritance
        author: Paolini, Christopher
        date: 2011-11-08
`)!;
		expect(refs[0]).toMatchObject({ entrytype: 'chapter', title: 'Inheritance', author: 'Paolini, Christopher', year: '2011' });
	});

	it('reads a whole entry written as a flow mapping, and an arXiv ID', () => {
		const refs = parseHayagriva('attention: { type: article, title: "Attention, Please", serial-number: { arxiv: "1706.03762" } }\n')!;
		expect(refs[0]).toMatchObject({ key: 'attention', title: 'Attention, Please', eprint: '1706.03762' });
	});

	it('folds a wrapped plain or quoted title into one line', () => {
		const refs = parseHayagriva(`long:
  title: A title that is long enough
    to wrap onto a second line
  author: "Doe,
    Jane"
`)!;
		expect(refs[0].title).toBe('A title that is long enough to wrap onto a second line');
		expect(refs[0].author).toBe('Doe, Jane');
	});

	it("reads a single-quoted title with an escaped quote and a # in it, and keeps the file's other entries", () => {
		const refs = parseHayagriva("a:\n  title: 'It''s # 1'  # note\nb:\n  title: Second\n")!;
		expect(refs.map((r) => [r.key, r.title])).toEqual([
			['a', "It's # 1"],
			['b', 'Second']
		]);
	});

	it("gives an entry with no type Hayagriva's default", () => {
		expect(parseHayagriva('x:\n  title: Untyped\n')![0].entrytype).toBe('misc');
	});

	it('declines YAML that is not a bibliography', () => {
		const workflow = 'name: CI\non:\n  push:\n    branches: [main]\njobs:\n  build:\n    runs-on: ubuntu-latest\n';
		expect(parseHayagriva(workflow)).toBeNull();
		expect(parseHayagriva('services:\n  web:\n    image: nginx\n')).toBeNull();
		expect(parseHayagriva('packages:\n  - apps/*\n')).toBeNull();
		// CSL-YAML is a list, not a mapping of keys
		expect(parseHayagriva('references:\n- id: doe\n  title: Something\n')).toBeNull();
		expect(parseHayagriva('- id: doe\n  title: Something\n')).toBeNull();
	});

	it('declines an empty file and malformed text rather than guessing', () => {
		expect(parseHayagriva('')).toBeNull();
		expect(parseHayagriva('# nothing yet\n')).toBeNull();
		expect(parseHayagriva('doe:\n  title: "never closed\n')).toBeNull();
		expect(parseHayagriva('a:\n  title: x\n---\nb:\n  title: y\n')).toBeNull();
	});
});
