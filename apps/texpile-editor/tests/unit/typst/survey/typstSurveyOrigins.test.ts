import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { paperNames } from './typstSurveyOrigins';
import { fileRoles } from './typstSurveyFiles';

function folder(files: Record<string, string>): string {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'typst-survey-'));
	for (const [name, text] of Object.entries(files)) {
		fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
		fs.writeFileSync(path.join(root, name), text);
	}
	return root;
}

describe('typst survey origins', () => {
	it('reads a star import as the entrypoint top level and its re-exports, not every let in the package', () => {
		const packages = folder({
			'preview/gates/1.0.0/typst.toml': '[package]\nname = "gates"\nentrypoint = "src/lib.typ"\n',
			'preview/gates/1.0.0/src/lib.typ': '#import "impl.typ": gate\n#import "extra.typ"\n#let circuit(..a) = { let text = 1; a }\n',
			'preview/gates/1.0.0/src/impl.typ': '#let gate(x) = x\n',
			'preview/gates/1.0.0/src/extra.typ': '#let h(x) = x\n'
		});
		const paper = folder({ 'main.typ': '#import "@preview/gates:1.0.0": *\n#let mine(x) = { let table = x; x }\n' });
		const names = paperNames([path.join(paper, 'main.typ')], packages);
		expect(names.origin('gate')).toBe('package gates');
		expect(names.origin('circuit')).toBe('package gates');
		expect(names.origin('extra')).toBe('package gates');
		expect(names.origin('h')).toBe('typst');
		expect(names.origin('text')).toBe('typst');
		expect(names.origin('table')).toBe('typst');
		expect(names.origin('mine')).toBe('own');
	});

	it('leaves out a slide deck and what only it includes, and tells modules from content', () => {
		const packages = folder({ 'preview/deck/0.1.0/typst.toml': '[package]\nname = "deck"\ncategories = ["presentation"]\n' });
		const paper = folder({
			'main.typ': '#import "template.typ": *\n#include "intro.typ"\n#include "shared.typ"\n',
			'shared.typ': '= Shared\n',
			'template.typ': '#let conf(doc) = doc\n',
			'intro.typ': '= Intro\n',
			'talk/theme.typ': '#import "@preview/deck:0.1.0": *\n',
			'talk/main.typ': '#import "theme.typ": *\n#import "/template.typ": conf\n#include "part.typ"\n#include "/shared.typ"\n',
			'talk/part.typ': '= Part\n'
		});
		const files = ['main.typ', 'template.typ', 'intro.typ', 'shared.typ', 'talk/theme.typ', 'talk/main.typ', 'talk/part.typ'].map((f) =>
			path.join(paper, f)
		);
		const roles = fileRoles(paper, files, packages);
		expect(files.map((f) => roles.get(f))).toEqual(['content', 'module', 'content', 'content', 'slides', 'slides', 'slides']);
	});
});
