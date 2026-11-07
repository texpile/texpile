// the functions a Typst file defines, which Insert offers as environments
import { typstTreeOf } from '../syntax/typstTrees';

/** maker: the function a call makes it with (`#let theorem = thmbox(..)`, `rect.with(..)`), the way a package's maker
 *  makes an environment */
export type OwnFunction = { name: string; maker: string | null };

/** the functions a Typst source defines with `#let`, in the order it defines them */
export async function ownFunctions(source: string): Promise<OwnFunction[]> {
	const out: OwnFunction[] = [];
	(await typstTreeOf(source)).iterate({
		enter: (n) => {
			if (n.name !== 'LetBinding' || n.node.prevSibling?.name !== 'Hash') return;
			// `#let name(..) =` defines a function; `#let name = thmbox(..)`, `= f.with(..)` or `= (..) => ..` makes one
			const closure = n.node.getChild('Closure')?.firstChild;
			const defined = closure?.name === 'Ident' && closure.nextSibling?.name === 'Params' ? closure : null;
			const named = n.node.getChild('Ident');
			const made = named && (n.node.getChild('FuncCall') || n.node.getChild('Closure')) ? named : null;
			const name = defined ?? made;
			const call = defined ? null : n.node.getChild('FuncCall')?.firstChild;
			if (name) out.push({ name: source.slice(name.from, name.to), maker: call ? source.slice(call.from, call.to) : null });
		}
	});
	return out;
}

/** the functions a Typst source defines with `#let`, in the order it defines them */
export async function definedFunctions(source: string): Promise<string[]> {
	return (await ownFunctions(source)).map((f) => f.name);
}
