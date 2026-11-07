// a theorem-style call whose maker only Typst can run (`#let lemma = thmbox(..)`), drawn as its name over its content
import type { SyntaxNode } from '@lezer/common';
import { faceElement } from '$lib/editor/visual/extensions/drawnChips/chipFace';
import type { OwnLet } from '../../../knowledge';
import { isMakerCall } from '../../../knowledge/scan/dictionaryFields';
import { partsOf, textOf } from '../../../knowledge/scan/syntax';
import { environmentCard } from '../parts/environmentCard';
import type { MarkupDrawing } from '../parts/drawingFace';
import type { TypstDrawer } from '../plugin/typstPlugin';
import type { OwnUse } from './ownUse';
import { drawTheoremHead, theoremHead } from './theoremHead';

function printedHead(use: OwnUse): HTMLElement | null {
	const { call } = use;
	const args = call?.open != null && call.close != null ? call.source.slice(call.open + 1, call.close) : null;
	const printed = theoremHead(use.own, args);
	const drawn = printed ? drawTheoremHead(printed) : null;
	if (!drawn) return null;
	const head = faceElement('span', 'env-head');
	head.dataset.look = 'theorem';
	head.appendChild(drawn);
	return head;
}

function isMadeFunction(node: SyntaxNode, own: OwnLet): boolean {
	if (node.name !== 'FuncCall') return false;
	const callee = partsOf(node)[0];
	if (callee?.name !== 'FieldAccess' || textOf(callee.lastChild!, own.source) !== 'with') return isMakerCall(node, own.source, own.scope);
	const maker = callee.firstChild;
	if (maker?.name === 'FuncCall') return isMadeFunction(maker, own);
	const name = maker && (maker.name === 'Ident' || maker.name === 'FieldAccess') ? textOf(maker, own.source) : null;
	return !!name && !own.scope.own(name) && own.scope.lookup(name) !== null;
}

export function ownEnvironment(use: OwnUse, drawer: TypstDrawer): MarkupDrawing | null {
	if (!use.call || use.params || !isMadeFunction(use.body, use.own)) return null;
	return environmentCard(use.name, use.call, drawer, printedHead(use));
}
