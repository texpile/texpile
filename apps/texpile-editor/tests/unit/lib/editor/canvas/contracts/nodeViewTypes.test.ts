import { describe, expect, expectTypeOf, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import type { MarkView, NodeView } from 'prosemirror-view';
import type { CanvasMarkView, CanvasNodeView, FaceInlineStyle, StyleProperty } from '$lib/editor/canvas';

const UPSTREAM = path.join(path.dirname(createRequire(import.meta.url).resolve('prosemirror-view')), 'index.d.ts');
const DOM_ONLY = ['ignoreMutation'];
const CANVAS_ONLY = ['nested', 'overlays', 'actions'] as const;

const NODE_VIEW_MEMBERS = [
	'dom',
	'contentDOM',
	'update',
	'multiType',
	'selectNode',
	'deselectNode',
	'setSelection',
	'stopEvent',
	'destroy',
	...CANVAS_ONLY
] as const;
const MARK_VIEW_MEMBERS = ['dom', 'contentDOM', 'update', 'destroy'] as const;

function upstreamMembers(name: string): string[] {
	const declarations = readFileSync(UPSTREAM, 'utf8');
	const body = declarations.slice(declarations.indexOf(`interface ${name} {`)).split(/\n\}/)[0];
	return [...body.matchAll(/^ {4}(\w+)\??:/gm)].map((match) => match[1]);
}

describe('canvas node view contract', () => {
	it("has prosemirror-view's NodeView members minus the DOM-only ones, plus the canvas-only ones", () => {
		expectTypeOf<(typeof NODE_VIEW_MEMBERS)[number]>().toEqualTypeOf<keyof CanvasNodeView>();
		expectTypeOf<keyof CanvasNodeView>().toEqualTypeOf<Exclude<keyof NodeView, 'ignoreMutation'> | (typeof CANVAS_ONLY)[number]>();
		const upstream = upstreamMembers('NodeView').filter((name) => !DOM_ONLY.includes(name));
		expect([...NODE_VIEW_MEMBERS].sort()).toEqual([...upstream, ...CANVAS_ONLY].sort());
	});

	it("has prosemirror-view's MarkView members minus the DOM-only ones", () => {
		expectTypeOf<(typeof MARK_VIEW_MEMBERS)[number]>().toEqualTypeOf<keyof CanvasMarkView>();
		expectTypeOf<keyof CanvasMarkView>().toEqualTypeOf<Exclude<keyof MarkView, 'ignoreMutation'>>();
		const upstream = upstreamMembers('MarkView').filter((name) => !DOM_ONLY.includes(name));
		expect([...MARK_VIEW_MEMBERS].sort()).toEqual(upstream.sort());
	});

	it('takes the arguments prosemirror-view hands update, and looks only name properties el.style has', () => {
		expectTypeOf<Parameters<NonNullable<CanvasNodeView['update']>>>().toEqualTypeOf<Parameters<NonNullable<NodeView['update']>>>();
		expectTypeOf<StyleProperty>().toExtend<keyof FaceInlineStyle>();
	});
});
