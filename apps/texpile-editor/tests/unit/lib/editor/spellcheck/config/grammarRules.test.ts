import { describe, expect, it } from 'vitest';
import { QUIET_RULES, ruleConfig, ruleIsOn, ruleName, systemVariant } from '$lib/editor/spellcheck/config/grammarRules';

describe('grammar rule defaults', () => {
	it('starts the quiet rules off and every other rule at its own default', () => {
		const config = ruleConfig(['OxfordComma', 'AnA', 'SpellCheck'], {});
		expect(config).toEqual({ OxfordComma: false, AnA: null, SpellCheck: null });
	});

	it("puts the reader's choices over the defaults, and passes over a rule Harper does not have", () => {
		const config = ruleConfig(['OxfordComma', 'AnA'], { OxfordComma: true, AnA: false, Gone: false });
		expect(config).toEqual({ OxfordComma: true, AnA: false });
		expect(ruleIsOn('OxfordComma', {})).toBe(false);
		expect(ruleIsOn('OxfordComma', { OxfordComma: true })).toBe(true);
		expect(ruleIsOn('AnA', {})).toBe(true);
	});

	it('names a rule in words', () => {
		expect(ruleName('OxfordComma')).toBe('Oxford Comma');
		expect(ruleName('NoFrenchSpaces')).toBe('No French Spaces');
		expect(ruleName('AnA')).toBe('An A');
	});
});

describe('systemVariant', () => {
	it("follows the first English among the system's languages", () => {
		expect(systemVariant(['de-DE', 'en-GB', 'en-US'])).toBe('british');
		expect(systemVariant(['en-AU'])).toBe('australian');
		expect(systemVariant(['en-CA'])).toBe('canadian');
		expect(systemVariant(['en_IN'])).toBe('indian');
		expect(systemVariant(['en-US'])).toBe('american');
		expect(systemVariant(['en'])).toBe('american');
	});

	it('spells an English Harper does not have as in Britain, and no English as in America', () => {
		expect(systemVariant(['en-NZ'])).toBe('british');
		expect(systemVariant(['en-IE'])).toBe('british');
		expect(systemVariant(['fr-FR', 'zh-CN'])).toBe('american');
		expect(systemVariant([])).toBe('american');
	});
});

describe('the defaults in Harper', () => {
	async function linter(dialect?: number) {
		const [{ LocalLinter }, { binaryInlined }] = await Promise.all([import('harper.js'), import('harper.js/binaryInlined')]);
		const l = new LocalLinter({ binary: binaryInlined, ...(dialect === undefined ? {} : { dialect }) });
		await l.setup();
		return l;
	}

	async function rulesFound(l: Awaited<ReturnType<typeof linter>>, text: string): Promise<string[]> {
		const byRule = await l.organizedLints(text);
		return Object.entries(byRule)
			.filter(([, lints]) => lints.length)
			.map(([rule]) => rule);
	}

	it('names only rules Harper has, so an upgrade that renames one is caught here', async () => {
		const known = Object.keys(await (await linter()).getDefaultLintConfig());
		expect(QUIET_RULES.filter((r) => !known.includes(r))).toEqual([]);
	}, 30000);

	it('keeps a quiet rule quiet until the reader turns it on', async () => {
		const l = await linter();
		const text = 'We project the queries, keys and values with learned weights.';
		expect(await rulesFound(l, text)).toContain('OxfordComma');
		const rules = Object.keys(await l.getDefaultLintConfig());
		await l.setLintConfig(ruleConfig(rules, {}));
		expect(await rulesFound(l, text)).not.toContain('OxfordComma');
		await l.setLintConfig(ruleConfig(rules, { OxfordComma: true }));
		expect(await rulesFound(l, text)).toContain('OxfordComma');
	}, 30000);

	it('spells as the chosen English does', async () => {
		const { Dialect } = await import('harper.js');
		const text = 'The colour of the sky.';
		expect(await rulesFound(await linter(Dialect.American), text)).toContain('SpellCheck');
		expect(await rulesFound(await linter(Dialect.British), text)).not.toContain('SpellCheck');
	}, 30000);
});
