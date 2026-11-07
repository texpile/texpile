// the steps of algorithmic (algorithms), algpseudocode (algorithmicx) and LyX's algolyx, by lower-case name. The package
// data holds neither the words a step prints nor which steps open and close a block, so they are listed here
export type AlgorithmStep = {
	/** what the step prints before its condition, and the \algorithmic<key> a document renews it with */
	say: string;
	key?: string;
	/** what it prints after its condition */
	then?: { say: string; key: string };
	opens?: boolean;
	closes?: boolean;
	/** a remark after the step on its line, not a step of its own */
	comment?: boolean;
};

const THEN = { say: 'then', key: 'then' };
const DO = { say: 'do', key: 'do' };

const STEPS: Record<string, AlgorithmStep> = {
	state: { say: '' },
	statex: { say: '' },
	// LyX writes a plain step as \item [{*}]
	'*': { say: '' },
	require: { say: 'Require:', key: 'require' },
	ensure: { say: 'Ensure:', key: 'ensure' },
	return: { say: 'return', key: 'return' },
	print: { say: 'print', key: 'print' },
	if: { say: 'if', key: 'if', then: THEN, opens: true },
	elsif: { say: 'else if', key: 'elsif', then: THEN, opens: true, closes: true },
	elseif: { say: 'else if', key: 'elsif', then: THEN, opens: true, closes: true },
	else: { say: 'else', key: 'else', opens: true, closes: true },
	endif: { say: 'end if', key: 'endif', closes: true },
	for: { say: 'for', key: 'for', then: DO, opens: true },
	forall: { say: 'for all', key: 'forall', then: DO, opens: true },
	endfor: { say: 'end for', key: 'endfor', closes: true },
	while: { say: 'while', key: 'while', then: DO, opens: true },
	endwhile: { say: 'end while', key: 'endwhile', closes: true },
	loop: { say: 'loop', key: 'loop', opens: true },
	endloop: { say: 'end loop', key: 'endloop', closes: true },
	repeat: { say: 'repeat', key: 'repeat', opens: true },
	until: { say: 'until', key: 'until', closes: true },
	procedure: { say: 'procedure', key: 'procedure', opens: true },
	endprocedure: { say: 'end procedure', key: 'endprocedure', closes: true },
	function: { say: 'function', key: 'function', opens: true },
	endfunction: { say: 'end function', key: 'endfunction', closes: true },
	comment: { say: '', comment: true }
};

export function algorithmStep(name: string): AlgorithmStep | null {
	const key = name.toLowerCase();
	return Object.hasOwn(STEPS, key) ? STEPS[key] : null;
}
