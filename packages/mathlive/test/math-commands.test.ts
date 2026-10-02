import { describe, expect, it } from 'vitest';
import { getMathCommands } from '../src/public/mathlive-ssr';

const named = (syntax: 'latex' | 'typst', name: string) =>
  getMathCommands(syntax).find(
    (c) => c.name === name || c.aliases.includes(name)
  );

describe('getMathCommands', () => {
  it('lists what a LaTeX equation can hold, a place to type into marked, and nothing it cannot', () => {
    expect(named('latex', '\\frac')?.insert).toBe('\\frac{#?}{#?}');
    expect(named('latex', '\\leq')?.kind).toBe('symbol');
    expect(named('latex', '\\begin{pmatrix}')?.insert).toBe(
      '\\begin{pmatrix}#?&#?\\\\#?&#?\\end{pmatrix}'
    );
    // a display environment, MathLive's own tooltip, a color
    expect(named('latex', '\\begin{equation}')).toBeUndefined();
    expect(named('latex', '\\mathtip')).toBeUndefined();
    expect(named('latex', '\\textcolor')).toBeUndefined();
  });

  it('lists the Typst names the fork reads, a call typed so it opens', () => {
    expect(named('typst', 'frac')).toMatchObject({
      insert: 'frac(',
      typed: true,
    });
    expect(named('typst', 'arrow.r.long')?.kind).toBe('symbol');
    expect(named('typst', 'sin')?.typed).toBeUndefined();
  });
});
