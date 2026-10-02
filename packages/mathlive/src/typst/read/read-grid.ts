import { Atom } from '../../core/atom-class';
import { getEnvironmentDefinition } from '../../latex-commands/definitions-utils';
import type { Environment } from '../../public/core-types';
import type { TypstSyntaxNode } from '../syntax';
import {
  keep,
  readSequence,
  sourceOf,
  trimTrivia,
  type TypstReader,
} from './read';
import { isTrue, readArg, type TypstCallArgs } from './read-call';
import { inverse, MATRIX_DELIMS } from '../names';

/** cells as rows of node runs, and the source before each cell; the text after the last is `end` */
type Grid = { cells: TypstSyntaxNode[][][]; before: string[][]; end: string };

export function createGrid(
  r: TypstReader,
  environment: Environment,
  cells: Atom[][][]
): Atom {
  const columns = Math.max(...cells.map((row) => row.length));
  // MathLive's arrays are rectangular; the cells a row never had stay empty
  const full = cells.map((row) => [
    ...row,
    ...Array.from({ length: columns - row.length }, () => []),
  ]);
  const atom = getEnvironmentDefinition(environment)!.createAtom!(
    environment,
    full,
    [],
    [],
    Math.max(columns, 10)
  )!;
  atom.style = { ...atom.style, ...r.style };
  atom.typstSpelling = { environment };
  return atom;
}

/**
 * Splits nodes at `\` (rows) and `&` (cells). The source before a cell takes in the separator
 * and the whitespace around it, so an untouched grid writes back exactly.
 */
function splitLines(
  r: TypstReader,
  nodes: readonly TypstSyntaxNode[],
  from: number,
  to: number
): Grid {
  const grid: Grid = { cells: [[]], before: [[]], end: '' };
  let cursor = from;
  let current: TypstSyntaxNode[] = [];
  const closeCell = () => {
    const content = trimTrivia(current);
    current = [];
    grid.cells[grid.cells.length - 1].push(content);
    if (content.length === 0) {
      grid.before[grid.before.length - 1].push('');
      return;
    }
    grid.before[grid.before.length - 1].push(
      r.src.slice(cursor, content[0].from)
    );
    cursor = content[content.length - 1].to;
  };
  for (const node of nodes) {
    if (node.kind === 'MathAlignPoint') closeCell();
    else if (node.kind === 'Linebreak') {
      closeCell();
      grid.cells.push([]);
      grid.before.push([]);
    } else current.push(node);
  }
  closeCell();
  grid.end = r.src.slice(cursor, to);
  return grid;
}

/** a Math node that breaks lines or aligns: one grid, rows at `\`, columns at `&` */
export function readLines(r: TypstReader, node: TypstSyntaxNode): Atom {
  const grid = splitLines(r, node.children, node.from, node.to);
  const aligned = node.children.some((c) => c.kind === 'MathAlignPoint');
  const cells = grid.cells.map((row) =>
    row.map((nodes) => readSequence(r, nodes))
  );
  const atom = createGrid(r, aligned ? 'aligned' : 'gathered', cells);
  return keep(atom, sourceOf(r, node), { cells: grid.before, end: grid.end });
}

// a matrix's `delim` argument as written, and the ways besides that to say the same
const MATRIX_ENVIRONMENTS: Readonly<Record<string, Environment>> = {
  ...(inverse(
    Object.fromEntries(
      Object.entries(MATRIX_DELIMS).filter(([, delim]) => delim !== undefined)
    ) as Record<string, string>
  ) as Record<string, Environment>),
  '"("': 'pmatrix',
  '"||"': 'Vmatrix',
  'none': 'matrix',
};

function matrixEnvironment(args: TypstCallArgs): Environment | undefined {
  const delim = args.values.delim;
  if (delim === undefined) return 'pmatrix';
  return MATRIX_ENVIRONMENTS[delim];
}

/** the source before each cell of a call's arguments, laid out like its cells */
function argSeparators(args: TypstCallArgs, shape: number[]): string[][] {
  const out: string[][] = [];
  let i = 0;
  for (const count of shape) out.push(args.separators.slice(i, (i += count)));
  return out;
}

export function readMat(r: TypstReader, args: TypstCallArgs): Atom | undefined {
  const environment = matrixEnvironment(args);
  if (!environment) return undefined;
  const cells = args.rows.map((row) => row.map((nodes) => readArg(r, nodes)));
  const atom = createGrid(r, environment, cells);
  atom.typstSpelling = {
    ...atom.typstSpelling,
    cells: argSeparators(
      args,
      args.rows.map((row) => row.length)
    ),
    end: args.separators[args.separators.length - 1],
  };
  return atom;
}

export function readVec(r: TypstReader, args: TypstCallArgs): Atom | undefined {
  const environment = matrixEnvironment(args);
  if (!environment || args.rows.length !== 1) return undefined;
  const cells = args.rows[0].map((nodes) => [readArg(r, nodes)]);
  const atom = createGrid(r, environment, cells);
  atom.typstSpelling = {
    ...atom.typstSpelling,
    cells: argSeparators(
      args,
      cells.map(() => 1)
    ),
    end: args.separators[args.separators.length - 1],
  };
  return atom;
}

/** each argument a row, `&` splitting it into the value and its condition */
export function readCases(
  r: TypstReader,
  args: TypstCallArgs
): Atom | undefined {
  if (args.rows.length !== 1) return undefined;
  const reverse = isTrue(args.values.reverse);
  if (Object.keys(args.values).some((key) => key !== 'reverse'))
    return undefined;
  const cells: Atom[][][] = [];
  const before: string[][] = [];
  args.rows[0].forEach((nodes, i) => {
    const content =
      nodes.length === 1 && nodes[0].kind === 'Math' ? nodes[0] : undefined;
    const parts = content
      ? splitLines(r, content.children, content.from, content.to)
      : { cells: [[nodes]], before: [['']], end: '' };
    if (parts.cells.length !== 1 || parts.end) return;
    cells.push(parts.cells[0].map((run) => readSequence(r, run)));
    before.push([
      args.separators[i] + parts.before[0][0],
      ...parts.before[0].slice(1),
    ]);
  });
  if (cells.length !== args.rows[0].length) return undefined;
  const atom = createGrid(r, reverse ? 'rcases' : 'cases', cells);
  atom.typstSpelling = {
    ...atom.typstSpelling,
    cells: before,
    end: args.separators[args.separators.length - 1],
  };
  return atom;
}
