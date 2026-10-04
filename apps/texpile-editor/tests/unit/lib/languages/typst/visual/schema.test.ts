import { describe, it, expect } from 'vitest';
import type { TagParseRule } from 'prosemirror-model';
import { typSchema as S } from '$lib/languages/typst/visual/schema';

describe('a heading deeper than six levels as html', () => {
	it('is drawn as the deepest html heading and read back at its own level', () => {
		const spec = S.nodes.heading.spec;
		const [tag, attrs] = spec.toDOM!(S.nodes.heading.create({ level: 8 })) as [string, Record<string, string>];
		expect(tag).toBe('h6');
		const element = { getAttribute: (name: string) => attrs[name] ?? null } as unknown as HTMLElement;
		const rule = (spec.parseDOM as TagParseRule[]).find((r) => r.tag === 'h6')!;
		expect(rule.getAttrs!(element)).toMatchObject({ level: 8 });
		expect((spec.toDOM!(S.nodes.heading.create({ level: 2 })) as [string])[0]).toBe('h2');
	});
});
