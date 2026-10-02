import type { Atom } from '../../core/atom-class';
import { ArrayAtom } from '../../atoms/array';
import type { Environment } from '../../public/core-types';
import type { _Mathfield } from '../../editor-mathfield/mathfield-private';
import { createGrid } from '../read/read-grid';
import { isLineGrid } from './calls';

// `\` and `&` break and align the top of the equation, which becomes a grid the first time

const SINGLE_COLUMN = new Set(['gathered', 'gather', 'lines', 'multline']);

/** the atoms of the caret's cell before and after it, the ones after to start a cell */
function split(caret: Atom): [Atom[], Atom[]] {
  const siblings = caret.siblings.filter((x) => x.type !== 'first');
  const at = siblings.indexOf(caret) + 1;
  const after = siblings.slice(at);
  // the space before a cell is the separator's
  if (after[0]) after[0].typstLead = undefined;
  return [siblings.slice(0, at), after];
}

function cellContent(grid: ArrayAtom, row: number, column: number): Atom[] {
  return (grid.getCell(row, column) ?? []).filter(
    (x) => x.type !== 'first' && x.type !== 'placeholder'
  );
}

function enterCell(
  mf: _Mathfield,
  grid: ArrayAtom,
  row: number,
  column: number
): void {
  mf.model.position = mf.model.offsetOf(grid.getCell(row, column)![0]);
}

/** the top of the equation as a grid: what is before the caret in the first cell */
function wrapRoot(mf: _Mathfield, environment: Environment): void {
  const { model } = mf;
  const [before, after] = split(model.at(model.position));
  const grid = createGrid(
    { src: '', style: {} },
    environment,
    environment === 'aligned' ? [[before, after]] : [[before], [after]]
  ) as ArrayAtom;
  model.root.setChildren([grid], 'body');
  if (environment === 'aligned') enterCell(mf, grid, 0, 1);
  else enterCell(mf, grid, 1, 0);
}

/**
 * A caret beside an equation that is nothing but lines goes into them, its first cell or its
 * last: typed there, Typst reads it as part of them.
 */
export function intoLines(mf: _Mathfield): void {
  const { model } = mf;
  const caret = model.at(model.position);
  if (!model.selectionIsCollapsed || caret.parent !== model.root) return;
  const body = model.root.body!.filter((x) => x.type !== 'first');
  const [grid] = body;
  if (body.length !== 1 || !(grid instanceof ArrayAtom) || !isLineGrid(grid))
    return;
  if (caret === grid) {
    // the last line's last cell with something in it, MathLive's padding aside
    const row = grid.rowCount - 1;
    let column = grid.colCount - 1;
    while (column > 0 && cellContent(grid, row, column).length === 0) column--;
    const cell = grid.getCell(row, column)!;
    model.position = model.offsetOf(cell[cell.length - 1]);
  } else enterCell(mf, grid, 0, 0);
}

function isTop(mf: _Mathfield, caret: Atom): boolean {
  return caret.parent === mf.model.root && mf.model.root.type === 'root';
}

/** `\`: the rest of the row moves to a new row after it */
export function breakLine(mf: _Mathfield): boolean {
  const { model } = mf;
  const caret = model.at(model.position);
  const grid = caret.parent;
  if (grid instanceof ArrayAtom && isLineGrid(grid)) {
    const [row, column] = caret.parentBranch as [number, number];
    const [before, after] = split(caret);
    const following: Atom[][] = [];
    for (let c = column + 1; c < grid.colCount; c++) {
      following.push(cellContent(grid, row, c));
      grid.setCell(row, c, []);
    }
    grid.addRowAfter(row);
    grid.setCell(row, column, before);
    grid.setCell(row + 1, 0, after);
    following.forEach((atoms, i) => grid.setCell(row + 1, i + 1, atoms));
    enterCell(mf, grid, row + 1, 0);
    return true;
  }
  if (!isTop(mf, caret)) return false;
  wrapRoot(mf, 'gathered');
  return true;
}

/** the grid as `environment`, with `extra` empty columns after its own */
function regrid(
  mf: _Mathfield,
  grid: ArrayAtom,
  environment: Environment,
  extra = 0
): ArrayAtom {
  const cells = grid.rows.map((row) => [
    ...row.map((cell) => (cell ?? []).filter((x) => x.type !== 'first')),
    ...Array.from({ length: extra }, () => []),
  ]);
  const next = createGrid({ src: '', style: grid.style }, environment, cells);
  const parent = grid.parent!;
  parent.addChildBefore(next, grid);
  parent.removeChild(grid);
  return next as ArrayAtom;
}

/** `&`: the rest of the cell moves to a new cell after it */
export function alignPoint(mf: _Mathfield): boolean {
  const { model } = mf;
  const caret = model.at(model.position);
  if (!(caret.parent instanceof ArrayAtom)) {
    if (!isTop(mf, caret)) return false;
    wrapRoot(mf, 'aligned');
    return true;
  }
  let grid = caret.parent;
  const cases = /^r?cases$/.test(grid.environmentName);
  if (!cases && !isLineGrid(grid)) return false;
  const [row, column] = caret.parentBranch as [number, number];
  if (SINGLE_COLUMN.has(grid.environmentName))
    grid = regrid(mf, grid, 'aligned');
  const [before, after] = split(caret);
  const last = grid.colCount - 1;
  if (column === last || cellContent(grid, row, last).length > 0) {
    // an aligned grid's columns are set when it is made: one more is a grid made again
    if (grid.colCount < grid.maxColumns) grid.addColumnAfter(last);
    else if (grid.environmentName === 'aligned')
      grid = regrid(mf, grid, 'aligned', 1);
    else return false;
  }
  for (let c = grid.colCount - 1; c > column + 1; c--)
    grid.setCell(row, c, cellContent(grid, row, c - 1));
  grid.setCell(row, column + 1, after);
  grid.setCell(row, column, before);
  enterCell(mf, grid, row, column + 1);
  return true;
}
