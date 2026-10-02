// What a page's own menu needs to know about the place in a field it opens on, and the one change
// it offers that MathLive has no command for: where an operator puts its scripts.
import type { Atom } from '../core/atom-class';
import { parseLatex } from '../core/parser';
import type { _Mathfield } from '../editor-mathfield/mathfield-private';
import type { _Model } from '../editor-model/model-private';
import { register } from '../editor/commands';
import type { MathfieldElement } from '../public/mathfield-element';
import type { MathfieldContext, MathfieldLimits } from '../public/mathlive';

const OPERATORS = new Set(['extensible-symbol', 'operator', 'mop']);

/** the operator left of the caret, or the one whose scripts hold it, if it has scripts to place */
function operatorAt(model: _Model): Atom | undefined {
  const atom = model.at(model.position);
  const inScripts =
    atom.parentBranch === 'subscript' || atom.parentBranch === 'superscript';
  const operator = OPERATORS.has(atom.type ?? '')
    ? atom
    : inScripts
      ? atom.parent
      : undefined;
  if (!operator || !OPERATORS.has(operator.type ?? '')) return undefined;
  const scripted =
    !operator.hasEmptyBranch('subscript') ||
    !operator.hasEmptyBranch('superscript');
  return scripted ? operator : undefined;
}

export function mathfieldContext(field: MathfieldElement): MathfieldContext {
  const mf = (field as unknown as { _mathfield: _Mathfield | null })._mathfield;
  if (!mf) return {};
  const { model } = mf;
  const context: MathfieldContext = {};
  const array = model.parentEnvironment;
  if (array) {
    const options = array as unknown as {
      minRows?: number;
      minColumns?: number;
    };
    context.array = {
      environment: array.environmentName,
      canAddRow: true,
      canRemoveRow: array.rowCount > Math.max(1, options.minRows ?? 1),
      canAddColumn: array.colCount < array.maxColumns,
      canRemoveColumn: array.colCount > Math.max(1, options.minColumns ?? 1),
    };
  }
  const operator = operatorAt(model);
  if (operator) {
    const placement = operator.subsupPlacement;
    context.limits =
      operator.explicitSubsupPlacement && placement !== 'auto' && placement
        ? placement
        : 'default';
  }
  return context;
}

function setLimits(model: _Model, limits: MathfieldLimits): boolean {
  const operator = operatorAt(model);
  if (!operator || !model.contentWillChange({})) return false;
  model.mathfield.snapshot();
  if (limits === 'default') {
    operator.subsupPlacement = parseLatex(operator.command)[0]?.subsupPlacement;
    operator.explicitSubsupPlacement = false;
  } else {
    operator.subsupPlacement = limits;
    operator.explicitSubsupPlacement = true;
  }
  operator.isDirty = true;
  model.contentDidChange({});
  return true;
}

register(
  { setLimits },
  { target: 'model', canUndo: true, changeContent: true }
);
