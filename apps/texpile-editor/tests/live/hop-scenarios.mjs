// focused grading for the certified hop: just the fixtures whose rows exercise it
import { FIXTURES as ALL } from './scenarios.mjs';
export { applyOp } from './scenarios.mjs';
export const FIXTURES = ALL.filter((f) => ['twopage', 'twocol'].includes(f.name));
