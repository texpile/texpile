import type { CircuitPartKind } from '$lib/draw/editor/figure/figureLanguage';
import { BIPOLE_NAMES } from './bipoleNames';

function iconOf(id: string) {
	return new URL(`./parts/${id.replaceAll(' ', '-')}.svg`, import.meta.url).href;
}
function along(id: string, name: string): CircuitPartKind {
	return { id, name, placed: 'path', pins: [], icon: iconOf(id) };
}
function node(id: string, name: string, pins: string[] = []): CircuitPartKind {
	return { id, name, placed: 'node', pins, icon: iconOf(id) };
}

/** the parts the component tool offers, by circuitikz's own names; pins are the anchors TeX reports for wiring */
export const CIRCUIT_PARTS: readonly CircuitPartKind[] = [
	along('short', 'Wire'),
	along('R', 'Resistor'),
	along('C', 'Capacitor'),
	along('L', 'Inductor'),
	along('D', 'Diode'),
	along('leD', 'LED'),
	along('zD', 'Zener diode'),
	along('V', 'Voltage source'),
	along('I', 'Current source'),
	along('sV', 'AC source'),
	along('battery1', 'Battery'),
	along('nos', 'Switch'),
	along('lamp', 'Lamp'),
	along('fuse', 'Fuse'),
	along('ammeter', 'Ammeter'),
	along('voltmeter', 'Voltmeter'),
	node('ground', 'Ground'),
	node('vcc', 'Supply'),
	node('npn', 'NPN transistor', ['B', 'C', 'E']),
	node('pnp', 'PNP transistor', ['B', 'C', 'E']),
	node('nmos', 'NMOS transistor', ['G', 'D', 'S']),
	node('pmos', 'PMOS transistor', ['G', 'D', 'S']),
	node('op amp', 'Op amp', ['-', '+', 'out'])
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
