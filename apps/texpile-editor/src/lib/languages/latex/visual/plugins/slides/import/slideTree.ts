import {
	PieceCursor,
	argText,
	argumentsText,
	commandName,
	createDefaultContext,
	environmentNameOf,
	isNamed,
	isSamelineComment,
	mandatoryArgs,
	noteBlockSpan,
	sliceOf,
	type ImportCall,
	type LatexEnvironmentImport,
	type Piece,
	type PmNode,
	type Stretch,
	type TreeArg,
	type TreeCall,
	type TreeEnvironment,
	type TreeImport
} from '$lib/languages/latex/visual/core/document';

const BLOCK_KINDS = new Set(['block', 'alertblock', 'exampleblock']);

export function isSlideCommand(im: TreeImport, environment: string): boolean {
	return im.readings.environmentArgumentsOf(environment)[0]?.kind === 'd<>';
}

function span(node: PmNode, from: number, to: number): PmNode {
	return noteBlockSpan(node, { srcFrom: from, srcTo: to, size: 1 });
}

function optionsOf(im: TreeImport, args: TreeArg[]): string {
	const present = args.filter((a) => a.present);
	return present.length ? sliceOf(im, { from: present[0].from, to: present[present.length - 1].to }) : '';
}

function titleOf(im: TreeImport, type: string, form: 'arg' | 'macro', spec: string, body: Stretch | null): PmNode {
	return im.core.node(type, { form, spec }, body ? im.core.inline(body, createDefaultContext()) : []);
}

type LeadingTitles = { title: PmNode | null; subtitle: PmNode | null; rest: Stretch };

function titleCall(im: TreeImport, call: ImportCall, type: string): PmNode | null {
	const args = call.args;
	const text = args.findLast((a) => a.present && a.kind === 'm');
	if (!text?.body || call.raw != null) return null;
	const spec = sliceOf(im, { from: args.find((a) => a.present)!.from, to: text.from });
	return span(titleOf(im, type, 'macro', spec, text.body), call.from, call.to);
}

function leadingTitles(im: TreeImport, body: Stretch, hasTitle: boolean, hasSubtitle: boolean): LeadingTitles {
	const cursor = new PieceCursor(im.src, body);
	let title: PmNode | null = null;
	let subtitle: PmNode | null = null;
	let rest = body.from;
	for (;;) {
		const mark = cursor.save();
		let p: Piece | null = cursor.next();
		while (p?.kind === 'space' || (p?.kind === 'node' && p.node.name === 'Comment')) p = cursor.next();
		const name = p?.kind === 'node' && p.node.name === 'ControlWord' ? commandName(im, p) : '';
		const wanted: boolean =
			(name === 'frametitle' && !hasTitle && !title && !subtitle) || (name === 'framesubtitle' && !hasSubtitle && !subtitle);
		const made: PmNode | null = wanted
			? titleCall(im, im.core.readCall(cursor, p!), name === 'frametitle' ? 'frame_title' : 'frame_subtitle')
			: null;
		if (!made) {
			cursor.restore(mark);
			break;
		}
		if (name === 'frametitle') title = made;
		else subtitle = made;
		rest = cursor.pos;
	}
	return { title, subtitle, rest: { ...body, from: rest } };
}

function frameNode(
	im: TreeImport,
	form: 'env' | 'macro',
	options: string,
	titleArg: TreeArg | null,
	subtitleArg: TreeArg | null,
	body: Stretch
): PmNode {
	const lead = leadingTitles(im, body, !!titleArg, !!subtitleArg);
	const title = titleArg ? titleOf(im, 'frame_title', 'arg', '', titleArg.body) : lead.title;
	const subtitle = subtitleArg ? titleOf(im, 'frame_subtitle', 'arg', '', subtitleArg.body) : lead.subtitle;
	return im.core.node('frame', { form, options }, [title, subtitle, ...im.core.blocks(lead.rest)]);
}

export function frameEnvironment(im: TreeImport, env: TreeEnvironment): PmNode[] | null {
	if (!isSlideCommand(im, env.name)) return null;
	const groups = env.args.filter((a) => a.kind === 'g');
	if (groups.length !== 2) return null;
	const others = env.args.filter((a) => a.kind !== 'g');
	return [
		frameNode(im, 'env', optionsOf(im, others), groups[0].present ? groups[0] : null, groups[1].present ? groups[1] : null, env.body)
	];
}

export function frameCommand(im: TreeImport, call: ImportCall): PmNode[] | null {
	const body = mandatoryArgs(call)[0]?.body;
	if (!body || call.raw != null || !isSlideCommand(im, 'frame')) return null;
	return [frameNode(im, 'macro', '', null, null, body)];
}

export function blockEnvironment(im: TreeImport, env: TreeEnvironment): PmNode[] | null {
	if (!BLOCK_KINDS.has(env.name) || !isSlideCommand(im, env.name)) return null;
	const title = env.args.find((a) => a.present && a.kind === 'm');
	if (!title?.body) return null;
	const spec = argumentsText(im.src, { ...env, args: env.args.filter((a) => a.kind === 'd<>') });
	const head = im.core.node('beamer_block_title', null, im.core.inline(title.body, createDefaultContext()));
	return [im.core.node('beamer_block', { kind: env.name, spec }, [head, ...im.core.blocks(env.body)])];
}

type ColumnStart = { from: number; end: number; call: TreeCall; env: TreeEnvironment | null };

function columnStarts(im: TreeImport, body: Stretch): ColumnStart[] | null {
	const cursor = new PieceCursor(im.src, body);
	const starts: ColumnStart[] = [];
	let macro = false;
	for (let p = cursor.next(); p; p = cursor.next()) {
		if (p.kind === 'space' || isNamed(p, 'ParBreak') || (isNamed(p, 'Comment') && isSamelineComment(im.src, p.from))) continue;
		if (p.kind === 'node' && p.node.name === 'ControlWord' && commandName(im, p) === 'column') {
			const call = im.core.readCall(cursor, p);
			starts.push({ from: p.from, end: call.to, call, env: null });
			macro = true;
		} else if (!macro && isNamed(p, 'Environment') && environmentNameOf(im, p.node) === 'column') {
			const env = im.core.environment(p.node);
			starts.push({ from: p.from, end: p.to, call: { name: 'column', node: p.node, from: p.from, to: p.to, args: env.args }, env });
		} else if (!macro || starts.length === 0) return null;
	}
	return starts.length ? starts : null;
}

function columnNode(im: TreeImport, start: ColumnStart, bodyTo: number, parent: Stretch['parent']): PmNode | null {
	const { call, env } = start;
	const width = call.args.find((a) => a.present && a.kind === 'm');
	if (!width?.body) return null;
	const options = optionsOf(
		im,
		call.args.filter((a) => a.kind !== 'm')
	);
	const content = env ? env.body : { parent, from: start.end, to: bodyTo };
	const to = env ? env.to : start.end + sliceOf(im, { from: start.end, to: bodyTo }).trimEnd().length;
	return span(
		im.core.node('column', { form: env ? 'env' : 'macro', options, width: argText(im.src, width) }, im.core.blocks(content)),
		start.from,
		to
	);
}

export function columnsEnvironment(im: TreeImport, env: TreeEnvironment): PmNode[] | null {
	if (!isSlideCommand(im, env.name)) return null;
	const starts = columnStarts(im, env.body);
	if (!starts) return null;
	const columns = starts.map((s, i) => columnNode(im, s, starts[i + 1]?.from ?? env.body.to, env.body.parent));
	if (columns.some((c) => c === null)) return null;
	return [im.core.node('columns', { options: optionsOf(im, env.args) }, columns)];
}

export const SLIDE_ENVIRONMENTS: Record<string, LatexEnvironmentImport> = {
	frame: frameEnvironment,
	block: blockEnvironment,
	alertblock: blockEnvironment,
	exampleblock: blockEnvironment,
	columns: columnsEnvironment
};
