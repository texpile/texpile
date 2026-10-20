import { describe, it, expect } from 'vitest';
import { parseBblEntries } from '$lib/languages/bib/bblScan';

// trimmed-down biber output: refsection wrapper, name block with hash noise, brace-protected
// title, bookkeeping fields interleaved with the display ones
const biberBbl = `% $ biblatex auxiliary file $
\\refsection{0}
  \\datalist[entry]{nty/global//global/global}
    \\entry{knuth1984}{article}{}
      \\name{author}{1}{}{%
        {{hash=abc123}{%
           family={Knuth},
           familyi={K\\bibinitperiod},
           given={Donald~E.},
           giveni={D\\bibinitperiod}}}%
      }
      \\strng{namehash}{abc123}
      \\field{sortinit}{K}
      \\field{journaltitle}{The Computer Journal}
      \\field{title}{Literate {Programming}}
      \\field{volume}{27}
      \\field{year}{1984}
    \\endentry
    \\entry{eason1955}{article}{}
      \\name{author}{2}{}{%
        {{hash=d1}{%
           family={Eason},
           given={G.}}}%
        {{hash=d2}{%
           family={Noble},
           given={B.}}}%
      }
      \\field{title}{On certain integrals}
      \\field{year}{1955}
    \\endentry
    \\entry{acme2020}{report}{}
      \\list{institution}{1}{%
        {ACME}%
      }
      \\field{title}{Annual Report}
      \\field{date}{2020-06}
    \\endentry
  \\enddatalist
\\endrefsection`;

describe('parseBblEntries (biber .bbl)', () => {
	it('extracts every \\entry key and type', () => {
		const refs = parseBblEntries(biberBbl);
		expect(refs.map((r) => r.key)).toEqual(['knuth1984', 'eason1955', 'acme2020']);
		expect(refs.map((r) => r.entrytype)).toEqual(['article', 'article', 'report']);
		expect(refs.every((r) => r.fromBbl)).toBe(true);
	});

	it('pulls display fields, unwrapping brace protection in values', () => {
		const [knuth] = parseBblEntries(biberBbl);
		expect(knuth.title).toBe('Literate Programming');
		expect(knuth.journaltitle).toBe('The Computer Journal');
		expect(knuth.year).toBe('1984');
		expect(knuth.author).toBe('Knuth');
	});

	it('joins several author surnames and keeps the given names out', () => {
		const eason = parseBblEntries(biberBbl)[1];
		expect(eason.author).toBe('Eason, Noble');
	});

	it('carries a date field for entries without a year', () => {
		const acme = parseBblEntries(biberBbl)[2];
		expect(acme.year).toBeUndefined();
		expect(acme.date).toBe('2020-06');
		expect(acme.author).toBeUndefined();
	});

	it('de-dupes keys and skips commented-out entries', () => {
		const text = [
			'% \\entry{ghost}{misc}{}',
			'\\entry{a}{misc}{}',
			'\\field{title}{First}',
			'\\endentry',
			'\\entry{a}{misc}{}',
			'\\field{title}{Second}',
			'\\endentry'
		].join('\n');
		const refs = parseBblEntries(text);
		expect(refs).toHaveLength(1);
		expect(refs[0].title).toBe('First');
	});

	it('does not read fields past \\endentry into the previous entry', () => {
		const text = ['\\entry{a}{misc}{}', '\\endentry', '\\entry{b}{misc}{}', '\\field{title}{Only B}', '\\endentry'].join('\n');
		const [a, b] = parseBblEntries(text);
		expect(a.title).toBeUndefined();
		expect(b.title).toBe('Only B');
	});
});
