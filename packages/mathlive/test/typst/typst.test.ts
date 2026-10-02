import { beforeAll, describe, expect, it } from 'vitest';
import { hasTypstError, parseTypstMath } from 'texpile-typst-syntax-wasm';
import {
  configureTypst,
  convertLatexToTypst,
  getMathCommands,
} from '../../src/public/mathlive-ssr';
import { Atom } from '../../src/core/atom-class';
import { parseLatex } from '../../src/core/parser';
import { readTypst } from '../../src/typst/read/read';
import { atomToTypst } from '../../src/typst/write';
import { typstSymbolValue } from '../../src/typst/symbols';
import { typstNames } from '../../src/typst/names';

beforeAll(() => configureTypst({ parse: parseTypstMath }));

function rootOf(src: string): Atom {
  const reading = readTypst(src);
  const root = new Atom({ type: 'root', body: reading.atoms });
  root.verbatimTypst = src;
  root.typstSpelling = { open: reading.lead, close: reading.trail };
  return root;
}

/** what an edit reaching every atom would do: no verbatim source left anywhere */
function forget(root: Atom): Atom {
  for (const atom of [root, ...root.children]) atom.isDirty = true;
  return root;
}

const structure = (root: Atom) =>
  Atom.serialize(root.body ?? [], { defaultMode: 'math' });

function find(root: Atom, value: string): Atom {
  return root.children.find((atom) => atom.value === value)!;
}

/** what typing over `atom` does: a new atom in its place, everything above it edited */
function replace(atom: Atom, latex: string): void {
  atom.parent!.addChildrenAfter(parseLatex(latex), atom);
  atom.parent!.removeChild(atom);
}

describe('typst math in MathLive', () => {
  it('resolves symbol names the way Typst does', () => {
    // a bare name is its first variant with the fewest modifiers, and modifiers come in any order
    expect(typstSymbolValue('arrow')).toBe('→');
    expect(typstSymbolValue('dots')).toBe('…');
    expect(typstSymbolValue('dot')).toBe('⋅');
    expect(typstSymbolValue('theta.alt')).toBe('ϑ');
    expect(typstSymbolValue('arrow.long.r')).toBe('⟶');
    expect(typstSymbolValue('frac')).toBeUndefined();
  });

  it('rewrites only the part of an equation an edit reaches', () => {
    const root = rootOf(
      ' frac( a , b ) dot.c vec(x,y)  + sum_(i=1)^n x_i / n '
    );
    replace(find(root, 'b'), 'q');
    expect(atomToTypst(root)).toBe(
      ' frac( a , q ) dot.c vec(x,y)  + sum_(i=1)^n x_i / n '
    );
    replace(find(root, 'y'), '\\alpha');
    expect(atomToTypst(root)).toBe(
      ' frac( a , q ) dot.c vec(x,alpha)  + sum_(i=1)^n x_i / n '
    );
  });

  it('writes a call renamed in the field by the name it now has', () => {
    const root = rootOf('sin(x) + max(a, b)');
    for (const [from, to] of [
      ['s', 'c'],
      ['i', 'o'],
      ['n', 's'],
    ])
      replace(find(root, from), to);
    expect(atomToTypst(root)).toBe('cos(x) + max(a, b)');
  });

  it('rebuilds an equation from its structure as Typst draws it', () => {
    // each checked against the Typst compiler, which draws the two sides alike
    const cases: [string, string][] = [
      ['"a\\nb"', '"a\\nb"'],
      ['op("m s")^(-1)', 'op("m s")^(-1)'],
      ["limits(x)^'", 'limits(x)^prime'],
      ['max(|x_i|)', 'max(|x_i|)'],
      ['overbrace(a, b)^c', 'overbrace(a, b)^c'],
      ['liminf_n x', 'liminf_n x'],
      ['f(x)/2 + x_i(t)', 'f(x)/2 + x_i(t)'],
      ['limits(c)^(a b) stretch(->)^f', 'limits(c)^(a b) stretch(arrow.r)^f'],
      ['lr(\\{ x/y) lr(|]a|])', 'lr(\\{x/y) lr(\\⟧a\\⟧)'],
      ['(a mid(|) b/c)', '(a mid(|) b/c)'],
      ['1/(2 (x)', '1/(2 (x)'],
    ];
    for (const [src, rebuilt] of cases)
      expect(atomToTypst(forget(rootOf(src))), src).toBe(rebuilt);
  });

  it('reads every symbol name as one atom MathLive draws, written back by name', () => {
    for (const { name, kind } of typstNames()) {
      if (kind !== 'symbol' && kind !== 'constant') continue;
      const root = rootOf(name);
      const atoms = root.body!.filter((x) => x.type !== 'first');
      expect(atoms, name).toHaveLength(1);
      expect(atoms[0].type, name).not.toBe('error');
      expect(atomToTypst(forget(root)), name).toBe(name);
    }
    // the text form of ↔ is the arrow MathLive has, `~` a tilde and not a space
    expect(structure(rootOf('arrow.l.r'))).toBe('\\leftrightarrow');
    expect(structure(rootOf('tilde.basic'))).toBe('\\char"7E ');
    // Typst's `aleph` is the Hebrew letter, which pdflatex takes only as \aleph
    expect(structure(rootOf('aleph_0 < beth_1'))).toBe('\\aleph_0<\\beth_1');
  });

  it('reads what MathLive places or sizes otherwise as the command that does', () => {
    const cases: [string, string][] = [
      ['limits(c)^(a b)', '\\overset{ab}{c}'],
      ['stretch(->)_x^f', '\\xrightarrow[x]{f}'],
      ['a ~ b parallel c', 'a\\sim b\\parallel c'],
      ['lr(\\{ x)', '\\left\\lbrace x\\right.'],
      ['(a mid(|) b)', '(a\\middle|b)'],
      // the minus pdflatex reads, not U+2212
      ['e^(-x) - minus 1', 'e^{-x}--1'],
    ];
    for (const [typst, latex] of cases)
      expect(structure(rootOf(typst)), typst).toBe(latex);
  });

  it('reads bold upright as \\mathbf, which LaTeX sets upright, and bold alone as \\bm', () => {
    expect(structure(rootOf('bold(upright(v))'))).toBe('\\mathbf{{{v}}}');
    expect(structure(rootOf('upright(bold(v))'))).toBe(
      '\\mathrm{{\\mathbf{{v}}}}'
    );
    expect(structure(rootOf('bold(v)'))).toBe('\\bm{{v}}');
    expect(convertLatexToTypst(structure(rootOf('bold(upright(v))')))).toBe(
      'bold(upright(v))'
    );
  });

  it('writes LaTeX as the Typst that draws it', () => {
    // each checked against the Typst compiler
    const cases: [string, string][] = [
      ['a \\neq b \\notin c', 'a != b in.not c'],
      [
        '\\xrightarrow[x]{f} \\longleftarrow',
        'stretch(arrow.r)_x^f arrow.l.long',
      ],
      ['\\frac{1}{{a+b}}c', '1/(a + b) c'],
      ['|x| + \\|y\\|', '|x| + ‖y‖'],
      ['\\left\\{ x \\right.', 'lr(\\{x)'],
      [
        '\\int\\limits_a^b \\sum\\nolimits_i',
        'limits(integral)_a^b scripts(sum)_i',
      ],
      ['\\tfrac12 \\overgroup{AB}', 'inline(1/2) overshell(A B)'],
      ['a\\mkern18mu b', 'a#h(1em) b'],
      [
        '\\begin{matrix}\\infty_{\\colon}\\infty\\end{matrix}',
        'mat(delim: #none, oo_ : oo)',
      ],
      ['\\{_x]', '\\{_x\\]'],
      ['𝐀𝐚', '𝐀 𝐚'],
    ];
    for (const [latex, typst] of cases)
      expect(convertLatexToTypst(latex), latex).toBe(typst);
  });

  it("writes amsmath's dots and row numbering as Typst, not as their names", () => {
    const cases: [string, string][] = [
      ['a_1, \\dots, a_n', 'a_1, ..., a_n'],
      ['a_1 + \\dotsb + a_n', 'a_1 + dots.h.c + a_n'],
      [
        '\\begin{align}a &= b \\nonumber \\\\ c &= d \\notag\\end{align}',
        'a & = b \\\nc & = d',
      ],
    ];
    for (const [latex, typst] of cases)
      expect(convertLatexToTypst(latex), latex).toBe(typst);
  });

  it('writes alignat and flalign as the lines align sets, without the count of pairs', () => {
    const cases: [string, string][] = [
      [
        '\\begin{alignat}{2} a &= b & c &= d \\\\ e &= f & g &= h \\end{alignat}',
        'a & = b & c & = d \\\ne & = f & g & = h',
      ],
      ['\\begin{alignat*} {2} a &= b \\end{alignat*}', 'a & = b'],
      [
        '\\begin{flalign} a &= b \\\\ c &= d \\end{flalign}',
        'a & = b \\\nc & = d',
      ],
      ['\\begin{flalign*} a &= b \\end{flalign*}', 'a & = b'],
    ];
    for (const [latex, typst] of cases)
      expect(convertLatexToTypst(latex), latex).toBe(typst);
  });

  it('writes what a command placing its argument holds, Typst having no such placement', () => {
    const cases: [string, string][] = [
      ['\\sum_{\\mathclap{0 \\le i < n}} a_i', 'sum_(0 <= i < n) a_i'],
      [
        '\\begin{multline} a + b \\\\ \\shoveleft{+ c} \\end{multline}',
        'a + b \\\n+c',
      ],
      ['\\lefteqn{a = b} + c', 'a = b + c'],
      ['\\fbox{x}', 'x'],
    ];
    for (const [latex, typst] of cases)
      expect(convertLatexToTypst(latex), latex).toBe(typst);
  });

  it('writes nothing for a label, a tag, a break hint or vertical space, which Typst sets otherwise', () => {
    const cases: [string, string][] = [
      ['x = 1 \\label{eq:a}', 'x = 1'],
      ['x = 1 \\tag{3}', 'x = 1'],
      ['x = 1 \\tag*{A}', 'x = 1'],
      [
        '\\begin{align}a &= b \\label{eq:a} \\\\ \\displaybreak c &= d\\end{align}',
        'a & = b \\\nc & = d',
      ],
      ['a \\allowbreak + b \\nobreak + c', 'a + b + c'],
      ['a \\hfill b \\vspace{2mm} c', 'a b c'],
      [
        '\\begin{matrix}a & b \\\\ \\cline{1-2} c & d\\end{matrix}',
        'mat(delim: #none, a, b; c, d)',
      ],
    ];
    for (const [latex, typst] of cases)
      expect(convertLatexToTypst(latex), latex).toBe(typst);
  });

  it('writes the old font switches as the styles they set in math', () => {
    const cases: [string, string][] = [
      ['{\\rm d}x', 'upright(d) x'],
      ['\\rm d', 'upright(d)'],
      ['{\\bf v}', 'bold(upright(v))'],
      ['{\\sf T}', 'sans(upright(T))'],
      ['{\\tt x}', 'mono(upright(x))'],
      ['{\\cal L}', 'cal(L)'],
    ];
    for (const [latex, typst] of cases)
      expect(convertLatexToTypst(latex), latex).toBe(typst);
  });

  it('leaves the old font switches in text as typed when the equation is edited', () => {
    for (const command of ['\\rm', '\\sf', '\\tt', '\\cal']) {
      const root = new Atom({
        type: 'root',
        body: parseLatex(`\\text{${command} x} + y`),
      });
      replace(find(root, 'y'), 'z');
      expect(Atom.serialize(root.body ?? [], { defaultMode: 'math' })).toBe(
        `\\text{${command} x}+z`
      );
    }
  });

  it('writes \\emph as the italic text LaTeX sets, and back as typed', () => {
    expect(convertLatexToTypst('\\emph{if}')).toBe('italic("if")');
    expect(convertLatexToTypst('\\emph{a b}')).toBe('italic("a b")');
    expect(convertLatexToTypst('\\text{see \\emph{this} too}')).toBe(
      '"see "italic("this")" too"'
    );
    const root = new Atom({
      type: 'root',
      body: parseLatex('\\emph{a b} + y'),
    });
    replace(find(root, 'y'), 'z');
    expect(Atom.serialize(root.body ?? [], { defaultMode: 'math' })).toBe(
      '\\emph{a b}+z'
    );
  });

  it('writes the text symbols LaTeX also sets in math by their Typst names, and back as typed', () => {
    expect(convertLatexToTypst('\\P \\copyright \\textregistered')).toBe(
      'pilcrow copyright trademark.registered'
    );
    expect(structure(rootOf('pilcrow copyright'))).toBe('\\P\\copyright');
    const root = new Atom({
      type: 'root',
      body: parseLatex('a\\P b\\copyright\\textregistered + y'),
    });
    replace(find(root, 'y'), 'z');
    expect(Atom.serialize(root.body ?? [], { defaultMode: 'math' })).toBe(
      'a\\P b\\copyright\\textregistered+z'
    );
  });

  it('writes every LaTeX command MathLive draws as Typst that parses', () => {
    for (const { insert } of getMathCommands('latex'))
      for (const arg of ['x', '']) {
        const latex = insert.replace(/#\?/g, arg);
        const typst = convertLatexToTypst(latex);
        expect(hasTypstError(parseTypstMath(typst)), `${latex}: ${typst}`).toBe(
          false
        );
      }
  });

  it('writes what MathLive builds as the Typst a person would type', () => {
    const root = new Atom({
      type: 'root',
      body: parseLatex(
        '\\frac{x^2}{y}+\\sqrt{z}\\le\\left(a\\cdot b\\right)^{-1}xy'
      ),
    });
    expect(atomToTypst(root)).toBe('x^2/y + sqrt(z) <= (a dot b)^(-1) x y');
  });
});
