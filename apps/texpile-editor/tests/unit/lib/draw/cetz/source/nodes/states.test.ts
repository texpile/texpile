import { describe, expect, it } from 'vitest';
import { cetzLanguage as lang } from '$lib/draw/cetz/cetzLanguage';

const SRC = lang.newPicture;
const at = (text: string, i: number) => lang.readPicture(text, 0)!.statements.find((s) => s.i === i)!;

describe('a CeTZ state machine, as TikZ draws one', () => {
	it('adds finite states named q0, q1 ..., imports finite once, and marks where it starts and may stop', () => {
		const once = lang.addShape(SRC, 0, { tool: 'state', at: [2, 2] })!;
		const twice = lang.addShape(once, 0, { tool: 'state', at: [5, 2] })!;
		expect(twice).toContain('finite.draw.state((2, 2), "q0", label: [$q_0$])');
		expect(twice).toContain('finite.draw.state((5, 2), "q1", label: [$q_1$])');
		expect(twice.match(/#import "@preview\/finite:/g)).toHaveLength(1);
		const marked = lang.writeNodeBox(twice, at(twice, 3), { initial: true, accepting: true })!;
		expect(marked).toContain('finite.draw.state((2, 2), "q0", label: [$q_0$], initial: true, final: true)');
		expect(lang.readNodeBox(marked, at(marked, 3))).toEqual({ shape: 'circle', w: 1.2, h: 1.2, state: { initial: true, accepting: true } });
		expect(lang.describe(marked, at(marked, 3)).title).toBe('State');
	});

	it('gives a copy of a state a name of its own, so deleting the copy leaves the state as it was', () => {
		const one = lang.addShape(SRC, 0, { tool: 'state', at: [2, 2] })!;
		const copied = lang.duplicateStatement(one, at(one, 3), 1, 0)!;
		expect(copied).toContain('finite.draw.state((3, 2), "q1", label: [$q_0$])');
		const gone = lang.letGoOf(
			copied,
			0,
			[4],
			() => [3, 2],
			() => [3, 2]
		);
		expect(gone).toContain('finite.draw.state((2, 2), "q0", label: [$q_0$])');
	});
});
