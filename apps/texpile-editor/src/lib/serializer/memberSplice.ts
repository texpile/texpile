// splicing a construct's changed children into its bytes
import type { Node } from 'prosemirror-model';
import type { Ctx } from './types';
import { isContainer, shiftSegment, type Segment } from '$lib/editor/visual/sourceSpans';
import { containerOriginsOf, originsOf, type BlockOrigin } from '$lib/editor/visual/parseOrigins';
import type { BlockAssemblyOptions, Neighbour } from './blockAssembly';
import {
	BLANK,
	WS,
	WS_END,
	brokenRuns,
	ctxFor,
	derivedInner,
	inCell,
	lastIndexBefore,
	nestedOf,
	optionChecks,
	rewrapLike,
	wrapsAsFile,
	type Splice,
	type Spliced
} from './blockAssemblyUtils';

function unplaced(o: BlockOrigin): boolean {
	return o.text === undefined || o.srcFrom === undefined || o.srcTo === undefined;
}

export function createMemberSplice(
	serializeNode: (node: Node, ctx: Ctx) => string,
	options: BlockAssemblyOptions,
	leafSplice: Splice,
	segmentSplice: Splice
) {
	const { joinedAround, ownBytes } = optionChecks(options);

	/**
	 * A construct whose shape the parse still knows, written out as the bytes it came from with
	 * only its changed children rendered afresh: the frame around the children, and the gaps
	 * between them, are the file's own. `members` are what the parse knew the construct's blocks
	 * as (one container, or the list nodes an itemize became), `nodes` the blocks standing for
	 * them now. Null when a child was added, removed or moved, a container's own markup changed,
	 * or a child's place in the file is unknown; the dialect's handlers then render the whole
	 * construct. The runs are relative to the first node and to the text.
	 */
	function spliceMembers(
		nodes: Node[],
		members: BlockOrigin[],
		ctx: Ctx,
		lineHead = '',
		owns: BlockOrigin[] | null = null
	): Spliced | null {
		const first = members[0];
		if (nodes.length !== members.length || !first.parse.verbatim || first.text === undefined) return null;
		const src = first.text;
		const base = first.srcFrom!;
		let text = '';
		const leaves: Segment[] = [];
		const inner: Segment[] = [];
		let cursor = base;
		let nodePm = 0;
		for (let m = 0; m < nodes.length; m++) {
			const node = nodes[m];
			const origin = members[m];
			const own = owns?.[m] ?? origin;
			if (own !== origin) {
				// a member dragged into another member's slot: the slot's frame (its marker, the gap
				// before it), then the member's own bytes as the file had them, untouched
				if (node !== own.node) return null;
				const rec = containerOriginsOf(own.node);
				const slotRec = containerOriginsOf(origin.node);
				if (!rec || !slotRec || rec.origins.length === 0 || slotRec.origins.length === 0) return null;
				const ownFrom = rec.origins[0].srcFrom;
				const ownTo = rec.origins[rec.origins.length - 1].srcTo;
				const slotFrom = slotRec.origins[0].srcFrom;
				const slotTo = slotRec.origins[slotRec.origins.length - 1].srcTo;
				if (ownFrom === undefined || ownTo === undefined || slotFrom === undefined || slotTo === undefined || slotFrom < cursor)
					return null;
				for (const co of rec.origins) if (co.text === undefined) return null;
				text += src.slice(cursor - base, slotFrom - base);
				const at = text.length;
				text += src.slice(ownFrom - base, ownTo - base);
				const pmShift = nodePm + 1 - rec.origins[0].pmFrom;
				const srcShift = at - ownFrom;
				for (const co of rec.origins) for (const l of co.leaves) leaves.push(shiftSegment(l, pmShift, srcShift));
				for (const seg of nestedOf([node], rec.origins[0].pmFrom - 1)) inner.push(shiftSegment(seg, pmShift, srcShift));
				cursor = slotTo;
				nodePm += node.nodeSize;
				continue;
			}
			if (!isContainer(node) || !node.sameMarkup(origin.node)) return null;
			if (options.frameHolds && !options.frameHolds(node, origin.node)) return null;
			const record = containerOriginsOf(origin.node);
			if (!record || record.origins.length === 0) return null;
			const parsed = record.origins;
			// a child the parse could not place (a caption set below its tabular, one the file never
			// had) rides along in the bytes around the placed ones, so it may only stand where it
			// stood, as it was
			const placed: number[] = [];
			parsed.forEach((o, j) => {
				if (!unplaced(o)) placed.push(j);
			});
			if (placed.length === 0) return null;
			const firstPlaced = placed[0];
			const lastPlaced = placed[placed.length - 1];
			if (parsed[firstPlaced].srcFrom! < cursor) return null;
			function placedBefore(j: number): number {
				let i = j - 1;
				while (i >= 0 && unplaced(parsed[i])) i--;
				return i;
			}
			function placedAfter(j: number): number {
				let i = j + 1;
				while (i < parsed.length && unplaced(parsed[i])) i++;
				return i < parsed.length ? i : -1;
			}
			// the frame: what opens the container (up to its first child), the gap before each parsed
			// child, and what closes it; a child that went keeps nothing of its own but the frame
			// around it stays
			function gapBefore(j: number): string {
				return src.slice(parsed[placedBefore(j)].srcTo! - base, parsed[j].srcFrom! - base);
			}
			function gapAfter(j: number): string {
				const next = placedAfter(j);
				return next >= 0 ? gapBefore(next) : m + 1 < nodes.length ? '' : src.slice(parsed[lastPlaced].srcTo! - base);
			}
			function headOf(j: number): string {
				const lineStart = src.lastIndexOf('\n', parsed[j].srcFrom! - base - 1) + 1;
				return (lineStart === 0 ? lineHead : '') + src.slice(lineStart, parsed[j].srcFrom! - base);
			}
			// a gap for a child the file never had: the gap before some parsed child that had one, else a
			// blank line, prefixed as the container continues its lines
			const p = options.continuation ? (options.continuation(node, parsed[firstPlaced].text!, headOf(firstPlaced)) ?? '') : '';
			const blankGap = options.childGap?.(node, p) ?? '\n' + p.replace(/[ \t]+$/, '') + '\n' + p;
			let usualGap: string | null = null;
			for (const j of placed) if (usualGap === null && j > firstPlaced && parsed[j].member === 0) usualGap = gapBefore(j);
			if (usualGap === null) usualGap = blankGap;
			// prose after anything needs the blank line, or it reads on as the block before it (a lazy
			// continuation of an item, one paragraph with the one above); a nested list or environment
			// may follow on the next line, as the file's own gap before one shows
			function gapFor(child: Node): string {
				return child.isTextblock && !BLANK.test(usualGap!) ? blankGap : usualGap!;
			}
			// bytes that cannot stand alone still fit the slot they were cut from, right after the frame's opening
			function fits(ref: BlockOrigin, k: number): boolean {
				return ownBytes(ref) || (k === 0 && ref.index === 0);
			}
			const { origins, was } = originsOf(node, record);
			const n = node.childCount;
			// the children in groups: one construct the parse knew as several blocks (a nested list, one
			// node per item) is one group, placed and written as one. Each group stands for a parsed
			// group (kept as it was, dragged from elsewhere, or changed inside), or for none: written afresh
			type Slot = { k: number; size: number; ref: BlockOrigin | null; kept: boolean };
			const slots: Slot[] = [];
			for (let k = 0; k < n;) {
				const ref = origins[k] ?? was[k];
				// a kept child may stand anywhere (dragged); a changed one stands for a parsed child in order
				const inOrder = origins[k] === ref || !slots.some((sl) => sl.ref && sl.ref.index >= ref!.index);
				if (ref && ref.member === 0 && k + ref.size <= n && inOrder) {
					let whole = true;
					for (let t = 1; t < ref.size; t++) if ((origins[k + t] ?? was[k + t]) !== parsed[ref.index + t]) whole = false;
					if (whole) {
						let kept = true;
						for (let t = 0; t < ref.size; t++) if (origins[k + t] !== parsed[ref.index + t]) kept = false;
						slots.push({ k, size: ref.size, ref, kept });
						k += ref.size;
						continue;
					}
				}
				if (ref && ref.member !== 0) return null; // part of a group the parse wrote as one: written whole or not at all
				slots.push({ k, size: 1, ref: null, kept: false });
				k++;
			}
			if (slots.some((sl) => sl.ref && joinedAround(node, sl.k, sl.k + sl.size))) return null;
			if (placed.length < parsed.length) {
				let at = 0;
				for (const sl of slots) {
					if (!sl.ref || sl.ref.index !== at || (unplaced(sl.ref) && !sl.kept)) return null;
					at += sl.size;
				}
				if (at !== parsed.length) return null;
			}
			let lastEmitted = slots.length - 1;
			while (lastEmitted > 0 && slots[lastEmitted].ref && unplaced(slots[lastEmitted].ref!)) lastEmitted--;
			text += src.slice(cursor - base, parsed[firstPlaced].srcFrom! - base);
			let childPm = nodePm + 1;
			let emitted = 0;
			// the parsed child the last slot stood for, so a pair still the file's pair keeps its gap
			let prevRef: BlockOrigin | null = null;
			for (const slot of slots) {
				const group = node.content.content.slice(slot.k, slot.k + slot.size);
				let groupPm = 0;
				for (const g of group) groupPm += g.nodeSize;
				const ref = slot.ref;
				if (ref && unplaced(ref)) {
					childPm += groupPm;
					continue;
				}
				const childCtx: Ctx = {
					parent: node,
					index: slot.k,
					isLastChild: slot.k + slot.size === n,
					inTableCell: ctx.inTableCell || inCell(node)
				};
				// the gap before: the file's own between a pair still the file's, else the usual one
				const gap =
					emitted > 0
						? ref && placedBefore(ref.index) >= 0 && prevRef === parsed[placedBefore(ref.index)]
							? gapBefore(ref.index)
							: gapFor(group[0])
						: '';
				prevRef = ref ? parsed[ref.index + slot.size - 1] : null;
				if (ref && slot.kept && fits(ref, slot.k)) {
					text += gap;
					const at = text.length;
					text += ref.text!;
					// every member of a construct carries the construct's runs, from its first block's
					// position: they are moved once, or the second member's copy lands one member off
					for (const l of ref.leaves) leaves.push(shiftSegment(l, childPm - ref.pmFrom, at - ref.srcFrom!));
					inner.push({ pmFrom: childPm, pmTo: childPm + groupPm, srcFrom: at, srcTo: at + ref.text!.length, kind: 'sub' });
					for (const seg of nestedOf(group, ref.pmFrom)) inner.push(shiftSegment(seg, childPm - ref.pmFrom, at - ref.srcFrom!));
				} else {
					const k = slot.k;
					const child = group[0];
					if (options.spliceChild && !options.spliceChild(node, k, ref?.node ?? null)) return null;
					// what stood on the child's line before it: a marker, a quote prefix, indentation; for a
					// fresh child, what the nearest parsed child had
					// a fresh child continues its lines as the nearest parsed child did
					const guide = ref ?? parsed[Math.min(parsed.length - 1, Math.max(0, lastIndexBefore(slots, slot) + 1))];
					const head = headOf(guide.index);
					const prefix = options.continuation ? (options.continuation(node, guide.text!, head) ?? '') : '';
					const nested =
						ref && fits(ref, slot.k)
							? slot.size === 1
								? (frameSplice(child, ref, childCtx, head) ??
									leafSplice(child, ref, childCtx, prefix) ??
									segmentSplice(child, ref, childCtx, prefix))
								: spliceMembers(group, parsed.slice(ref.index, ref.index + slot.size), childCtx, head)
							: null;
					if (!nested && slot.size > 1) return null;
					let part = nested ? nested.text : serializeNode(child, childCtx);
					const lead = nested ? 0 : WS.exec(part)![0].length;
					let core = nested ? part : part.slice(lead, part.length - WS_END.exec(part)![0].length);
					// a paragraph written afresh keeps the wrap the file gave the one it replaces
					const wrapWas = nested ? null : wrapsAsFile(child, ref);
					const rewrapped = wrapWas ? rewrapLike(wrapWas, core, options.endsLine) : null;
					let partLeaves = nested ? nested.leaves : (options.mapLeaves?.(child, childCtx, part) ?? []);
					if (rewrapped) {
						part = part.slice(0, lead) + rewrapped.text + part.slice(lead + core.length);
						core = rewrapped.text;
						partLeaves = brokenRuns(
							partLeaves,
							rewrapped.breaks.map((b) => b + lead)
						);
					}
					// a child that writes nothing (an emptied paragraph) takes no gap of its own either,
					// unless the file's bytes around it are its frame (a caption's braces), which stays
					if (core.trim() === '') {
						const before = ref && placedBefore(ref.index) >= 0 ? gapBefore(ref.index) : '';
						const after = ref ? gapAfter(ref.index + slot.size - 1) : '';
						if (!ref || (/^\s*$/.test(before) && /^\s*$/.test(after))) continue;
					}
					text += gap;
					const at = text.length;
					const prefixing = !nested && prefix !== '' && core.includes('\n');
					if (prefixing) core = core.replace(/\n(?!\n|$)/g, '\n' + prefix);
					// the gap after the child is what separates it from the next; a paragraph ending rule
					// of the dialect (a \par before a blank line) applies as at the top level
					const after = ref ? gapAfter(ref.index + slot.size - 1) : usualGap;
					const last = slot === slots[lastEmitted] && m === nodes.length - 1;
					// a child ending on a comment keeps the line end after it, or the comment would run
					// on into what follows: after the last one, the frame closing the container
					const follows = last && !ref ? gapAfter(lastPlaced) : after;
					if (options.endsLine?.(core) && !follows.startsWith('\n') && !(last && follows === '')) core += '\n';
					if (options.beforeBreak && (last || BLANK.test(after))) {
						const at2 = slots.indexOf(slot) + 1;
						const nextSlot = at2 < slots.length ? slots[at2] : null;
						const next: Neighbour = nextSlot
							? { node: node.child(nextSlot.k), origin: nextSlot.kept ? nextSlot.ref : null, was: nextSlot.ref }
							: { node: group[slot.size - 1], origin: null, was: null };
						core = options.beforeBreak(core, { node: group[slot.size - 1], origin: null, was: ref }, next);
					}
					text += core;
					inner.push({ pmFrom: childPm, pmTo: childPm + groupPm, srcFrom: at, srcTo: at + core.length, kind: 'sub' });
					const leavesFrom = leaves.length;
					function prefixed(off: number): number {
						let moved = off;
						if (prefixing)
							for (let i = lead; i < off; i++) if (part[i] === '\n' && i + 1 < part.length && part[i + 1] !== '\n') moved += prefix.length;
						return moved;
					}
					for (const sg of partLeaves) {
						// a text run reaching into the whitespace trimmed off the child keeps what was written of it
						const lo = Math.max(sg.srcFrom, lead);
						const hi = Math.min(sg.srcTo, lead + core.length);
						if (hi <= lo || (sg.kind !== 'text' && (lo !== sg.srcFrom || hi !== sg.srcTo))) continue;
						leaves.push({
							pmFrom: childPm + sg.pmFrom + (lo - sg.srcFrom),
							pmTo: childPm + sg.pmTo - (sg.srcTo - hi),
							srcFrom: at + prefixed(lo) - lead,
							srcTo: at + prefixed(hi) - lead,
							kind: sg.kind
						});
					}
					if (nested) for (const sg of nested.inner) inner.push(shiftSegment(sg, childPm, at));
					else for (const sg of derivedInner(child, childPm, leaves.slice(leavesFrom), at)) inner.push(sg);
				}
				childPm += groupPm;
				emitted++;
			}
			cursor = parsed[lastPlaced].srcTo!;
			nodePm += node.nodeSize;
		}
		text += src.slice(cursor - base);
		return { text, leaves, inner };
	}

	/** one container the parse still knows, against what it knew it as */
	function frameSplice(node: Node, origin: BlockOrigin, ctx: Ctx, lineHead = ''): Spliced | null {
		if (origin.size !== 1) return null;
		return spliceMembers([node], [origin], ctx, lineHead);
	}

	/**
	 * The whole construct a changed block at `i` belongs to, when the parse knew it as several
	 * blocks (an itemize is one list node per item), each standing for the member the parse had
	 * there: its bytes with only the changed items' blocks rendered afresh, or null
	 */
	function constructSplice(doc: Node, i: number, neighbours: Neighbour[]): (Spliced & { count: number }) | null {
		// the run starts at the construct's first slot, whichever member stands there now
		const m0 = neighbours[i].origin ?? neighbours[i].was;
		const w = m0 ? m0.parse.origins[m0.index - m0.member] : null;
		if (!w || w.size < 2 || i + w.size > neighbours.length) return null;
		const first = w;
		function inConstruct(o: BlockOrigin | null) {
			return !!o && o.parse === first.parse && o.index >= first.index && o.index < first.index + first.size;
		}
		if (i > 0 && inConstruct(neighbours[i - 1].origin ?? neighbours[i - 1].was)) return null;
		if (joinedAround(doc, i, i + w.size)) return null;
		const nodes: Node[] = [];
		const slots: BlockOrigin[] = [];
		const owns: BlockOrigin[] = [];
		let permuted = false;
		for (let k = 0; k < w.size; k++) {
			const nb = neighbours[i + k];
			const m = nb.origin ?? nb.was;
			const slot = w.parse.origins[w.index + k];
			if (!m || !slot || slot.member !== k || !inConstruct(m) || m.member !== m.index - w.index) return null;
			nodes.push(nb.node);
			slots.push(slot);
			owns.push(m);
			if (m !== slot) permuted = true;
		}
		// every member once, in some order
		if (permuted && new Set(owns).size !== w.size) return null;
		const spliced = spliceMembers(nodes, slots, ctxFor(doc, i, doc.childCount), '', permuted ? owns : null);
		return spliced ? { ...spliced, count: w.size } : null;
	}

	return { frameSplice, constructSplice };
}
