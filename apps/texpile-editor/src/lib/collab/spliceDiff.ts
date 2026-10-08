// a slice compare is a memcmp, so whole slices first; char by char took 8 ms to the middle of a 2 MB paper
const STEP = 1024;

/** minimal single-splice diff (common prefix/suffix trim); enough for editor-shaped changes. */
export function spliceDiff(oldStr: string, newStr: string): { index: number; remove: number; insert: string } | null {
	if (oldStr === newStr) return null;
	let start = 0;
	const maxStart = Math.min(oldStr.length, newStr.length);
	while (start + STEP <= maxStart && oldStr.slice(start, start + STEP) === newStr.slice(start, start + STEP)) start += STEP;
	while (start < maxStart && oldStr[start] === newStr[start]) start++;
	let endOld = oldStr.length;
	let endNew = newStr.length;
	// suffix must not overlap the prefix (classic "abab" pitfall)
	while (endOld - STEP >= start && endNew - STEP >= start && oldStr.slice(endOld - STEP, endOld) === newStr.slice(endNew - STEP, endNew)) {
		endOld -= STEP;
		endNew -= STEP;
	}
	while (endOld > start && endNew > start && oldStr[endOld - 1] === newStr[endNew - 1]) {
		endOld--;
		endNew--;
	}
	return { index: start, remove: endOld - start, insert: newStr.slice(start, endNew) };
}
