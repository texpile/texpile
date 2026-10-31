import type { CircuitPartKind } from '$lib/draw/editor/figure/figureLanguage';
import { kindTitle } from '$lib/draw/editor/figure/statementKinds';
import { BIPOLE_NAMES } from './bipoleNames';

function iconOf(id: string) {
	return new URL(`./parts/${id.replaceAll(' ', '-')}.svg`, import.meta.url).href;
}
function along(id: string): CircuitPartKind {
	return {
		id,
		get name() {
			return kindTitle(`part:${id}`);
		},
		placed: 'path',
		pins: [],
		icon: iconOf(id)
	};
}
function node(id: string, pins: string[] = []): CircuitPartKind {
	return {
		id,
		get name() {
			return kindTitle(`part:${id}`);
		},
		placed: 'node',
		pins,
		icon: iconOf(id)
	};
}

/** the parts the component tool offers, by circuitikz's own names; pins are the anchors TeX reports for wiring */
export const CIRCUIT_PARTS: readonly CircuitPartKind[] = [
	along('short'),
	along('R'),
	along('C'),
	along('L'),
	along('D'),
	along('leD'),
	along('zD'),
	along('V'),
	along('I'),
	along('sV'),
	along('battery1'),
	along('nos'),
	along('lamp'),
	along('fuse'),
	along('ammeter'),
	along('voltmeter'),
	node('ground'),
	node('vcc'),
	node('npn', ['B', 'C', 'E']),
	node('pnp', ['B', 'C', 'E']),
	node('nmos', ['G', 'D', 'S']),
	node('pmos', ['G', 'D', 'S']),
	node('op amp', ['-', '+', 'out'])
];

/** the name a new node of the part gets: op1, Q1, M1 ... */
export const NODE_NAME_STEMS: Record<string, string> = { npn: 'Q', pnp: 'Q', nmos: 'M', pmos: 'M', 'op amp': 'op' };

export function circuitPart(id: string) {
	return CIRCUIT_PARTS.find((p) => p.id === id) ?? null;
}

/** a style that draws a part along a path: circuitikz's own, a diode's filled `*` or empty `o` form among them */
export function isBipole(key: string) {
	const name = key.replace(/^(empty|full)\s+/, '');
	return BIPOLE_NAMES.has(name) || (/[*o]$/.test(name) && BIPOLE_NAMES.has(name.slice(0, -1)));
}
