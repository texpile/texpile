import { element } from './libraryElement';

function shape(id: string, name: string, options: string, library: string) {
	return element('Shapes', id, name, `\\node[draw, ${options}] at (0,0) {};`, [library]);
}
function line(id: string, name: string, text: string, libraries: string[] = []) {
	return element('Lines', id, name, text, libraries);
}

export const SHAPES = [
	shape('triangle', 'Triangle', 'regular polygon, regular polygon sides=3, minimum size=2.5cm', 'shapes.geometric'),
	shape('pentagon', 'Pentagon', 'regular polygon, regular polygon sides=5, minimum size=2.5cm', 'shapes.geometric'),
	shape('hexagon', 'Hexagon', 'regular polygon, regular polygon sides=6, minimum size=2.5cm', 'shapes.geometric'),
	shape('star', 'Star', 'star, star points=5, star point ratio=2.2, minimum size=2.5cm', 'shapes.geometric'),
	shape('cloud', 'Cloud', 'cloud, cloud puffs=10, aspect=2, minimum width=3cm, minimum height=1.6cm', 'shapes.symbols'),
	shape('block-arrow', 'Block arrow', 'single arrow, minimum width=1.2cm, minimum height=2.5cm', 'shapes.arrows'),
	shape('double-block-arrow', 'Double block arrow', 'double arrow, minimum width=1.2cm, minimum height=2.5cm', 'shapes.arrows'),
	element(
		'Shapes',
		'callout',
		'Speech bubble',
		'\\node[draw, rectangle callout, callout relative pointer={(0.4,-0.7)}, minimum width=2.5cm, minimum height=1cm] at (0,0) {Text};',
		['shapes.callouts']
	),
	shape('octagon', 'Octagon', 'regular polygon, regular polygon sides=8, minimum size=2.5cm', 'shapes.geometric'),
	shape(
		'isosceles-triangle',
		'Isosceles triangle',
		'isosceles triangle, shape border rotate=90, minimum width=2cm, minimum height=2.2cm',
		'shapes.geometric'
	),
	shape(
		'parallelogram',
		'Parallelogram',
		'trapezium, trapezium left angle=60, trapezium right angle=120, minimum width=2.5cm, minimum height=1.2cm',
		'shapes.geometric'
	),
	shape('trapezoid', 'Trapezoid', 'trapezium, minimum width=2.5cm, minimum height=1.2cm', 'shapes.geometric'),
	shape('semicircle', 'Semicircle', 'semicircle, minimum width=2.5cm', 'shapes.geometric'),
	shape('sector', 'Sector', 'circular sector, circular sector angle=60, shape border rotate=270, minimum size=2.2cm', 'shapes.geometric'),
	shape('kite', 'Kite', 'kite, minimum width=1.6cm, minimum height=2.4cm', 'shapes.geometric'),
	shape('starburst', 'Starburst', 'starburst, minimum width=2.6cm, minimum height=1.8cm', 'shapes.symbols'),
	shape('signal', 'Signal', 'signal, signal to=east, minimum width=2.5cm, minimum height=1cm', 'shapes.symbols'),
	shape('tape', 'Tape', 'tape, minimum width=2.5cm, minimum height=1.2cm', 'shapes.symbols'),
	shape('chamfered', 'Chamfered box', 'chamfered rectangle, minimum width=2.5cm, minimum height=1.2cm', 'shapes.misc'),
	shape('no-sign', 'No sign', 'forbidden sign, minimum size=2cm', 'shapes.symbols'),
	element(
		'Shapes',
		'split-box',
		'Two-part box',
		'\\node[draw, rectangle split, rectangle split parts=2, minimum width=2.5cm] at (0,0) {Top \\nodepart{two} Bottom};',
		['shapes.multipart']
	),
	element(
		'Shapes',
		'heart',
		'Heart',
		'\\draw (0,-1) .. controls (-1.8,0.3) and (-0.9,1.6) .. (0,0.7) .. controls (0.9,1.6) and (1.8,0.3) .. (0,-1) -- cycle;'
	)
];

export const LINES = [
	line('double-arrow', 'Double arrow', '\\draw[<->] (-1.5,0) -- (1.5,0);'),
	line('dimension', 'Dimension', '\\draw[|<->|] (-1.5,0) -- (1.5,0) node[midway, above] {$d$};'),
	line('arc', 'Arc', '\\draw[->] (1,0) arc[start angle=0, end angle=270, radius=1];'),
	line('brace', 'Brace', '\\draw[decorate, decoration={brace, amplitude=6pt}] (-1.5,0) -- (1.5,0) node[midway, above=6pt] {$a$};', [
		'decorations.pathreplacing'
	]),
	line('spring', 'Spring', '\\draw[decorate, decoration={coil, aspect=0.4, segment length=2mm, amplitude=2mm}] (-1.5,0) -- (1.5,0);', [
		'decorations.pathmorphing'
	]),
	line('zigzag', 'Zigzag', '\\draw[decorate, decoration={zigzag, segment length=3mm, amplitude=1.5mm}] (-1.5,0) -- (1.5,0);', [
		'decorations.pathmorphing'
	]),
	line('wave', 'Wave', '\\draw[decorate, decoration={snake, segment length=6mm, amplitude=1.5mm}] (-1.5,0) -- (1.5,0);', [
		'decorations.pathmorphing'
	]),
	line('curved-arrow', 'Curved arrow', '\\draw[->] (-1.5,0) to[bend left=40] (1.5,0);'),
	line('elbow-arrow', 'Elbow arrow', '\\draw[->] (-1.5,-0.8) -| (1.5,0.8);'),
	line('dashed-arrow', 'Dashed arrow', '\\draw[->, dashed] (-1.5,0) -- (1.5,0);'),
	line('bold-arrow', 'Bold arrow', '\\draw[-Latex, line width=1.5pt] (-1.5,0) -- (1.5,0);', ['arrows.meta']),
	line('double-line', 'Double line', '\\draw[double, double distance=2pt] (-1.5,0) -- (1.5,0);')
];
