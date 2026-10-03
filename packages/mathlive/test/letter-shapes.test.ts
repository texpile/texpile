import { describe, expect, it } from 'vitest';
import { convertLatexToMarkup } from '../src/public/mathlive-ssr';

const classesOf = (latex: string, char: string) =>
  new RegExp(`class="([^"]*)"[^>]*>${char}<`).exec(
    convertLatexToMarkup(latex)
  )?.[1];

describe('letter shapes and font repertoires', () => {
  it('sets \\epsilon in italic like every other lowercase Greek letter', () => {
    expect(classesOf('\\alpha', 'α')).toBe('lcGreek ML__mathit');
    expect(classesOf('\\epsilon', 'ϵ')).toBe('lcGreek ML__mathit');
  });
});
