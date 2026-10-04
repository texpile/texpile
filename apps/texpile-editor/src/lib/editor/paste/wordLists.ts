// Word copies a list as paragraphs, each styled `mso-list:l1 level2` with its bullet or number
// drawn as text in a span marked `mso-list:Ignore`. Runs of those become real nested lists.

type WordListItem = { list: string; level: number; ordered: boolean; start: string | null };

function listItemOf(p: Element): WordListItem | null {
	const m = /mso-list:\s*(l\d+)\s+level(\d+)/i.exec(p.getAttribute('style') ?? '');
	if (!m) return null;
	const marker = p.querySelector('[style*="mso-list:Ignore" i], [style*="mso-list: Ignore" i]');
	const text = (marker?.textContent ?? '').replace(/\u00a0/g, ' ').trim();
	// outline numbering draws a sub level as 1.1. or 1.1
	const ordered = /^[(]?([0-9]+|[a-z]{1,4})([.)]|(\.[0-9]+)+\.?)$/i.test(text);
	return { list: m[1], level: Number(m[2]), ordered, start: ordered ? (/([0-9]+)\D*$/.exec(text)?.[1] ?? null) : null };
}

/** the paragraph's content, minus the drawn marker and Word's conditional comments around it */
function itemContent(p: Element): Node[] {
	for (const marker of p.querySelectorAll('[style*="mso-list:Ignore" i], [style*="mso-list: Ignore" i]')) marker.remove();
	for (const node of [...p.childNodes]) if (node.nodeType === 8) node.remove();
	return [...p.childNodes];
}

function convertRun(run: Element[], items: WordListItem[]): void {
	const doc = run[0].ownerDocument;
	const stack: { el: Element; level: number }[] = [];
	run[0].before(doc.createComment('list'));
	const anchor = run[0].previousSibling!;
	run.forEach((p, i) => {
		const { level, ordered, start } = items[i];
		while (stack.length && stack[stack.length - 1].level > level) stack.pop();
		const opens = !stack.length || stack[stack.length - 1].level < level;
		if (opens) {
			const list = doc.createElement(ordered ? 'ol' : 'ul');
			const parentItem = stack[stack.length - 1]?.el.lastElementChild;
			if (parentItem) parentItem.append(list);
			else anchor.before(list);
			stack.push({ el: list, level });
		}
		const li = doc.createElement('li');
		// a list copied from its middle starts at the number Word shows
		if (opens && start && start !== '1') li.dataset.listOrder = start;
		li.append(...itemContent(p));
		stack[stack.length - 1].el.append(li);
		p.remove();
	});
	anchor.remove();
}

/** consecutive sibling paragraphs of one Word list, each with what its style says about it */
function wordListRuns(root: Element): { paragraphs: Element[]; items: WordListItem[] }[] {
	const runs: { paragraphs: Element[]; items: WordListItem[] }[] = [];
	for (const p of root.querySelectorAll('p')) {
		const item = listItemOf(p);
		if (!item) continue;
		const run = runs[runs.length - 1];
		const previous = run?.paragraphs[run.paragraphs.length - 1];
		if (previous && nextElement(previous) === p && run.items[0].list === item.list) {
			run.paragraphs.push(p);
			run.items.push(item);
		} else runs.push({ paragraphs: [p], items: [item] });
	}
	return runs;
}

export function convertWordLists(root: Element): void {
	for (const run of wordListRuns(root)) convertRun(run.paragraphs, run.items);
}

function nextElement(el: Element): Element | null {
	let node = el.nextSibling;
	while (node && node.nodeType !== 1) {
		if (node.nodeType === 3 && node.textContent!.trim()) return null;
		node = node.nextSibling;
	}
	return node as Element | null;
}
