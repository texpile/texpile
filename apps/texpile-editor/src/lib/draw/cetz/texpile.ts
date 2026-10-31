// what the editor writes that CeTZ has no call for, defined once in the document, each named texpile-
export const TEXPILE = `// texpile: what the editor draws that CeTZ has no call for
#import "@preview/cetz:0.4.2"
// a dimension as CAD draws one: extension lines off the shape, filled arrowheads, its size above its line, measured where
// Typst draws its points, so it follows them; an angle between lines that do not meet goes to CeTZ's own angle
#let texpile-dimension(kind: "aligned", offset: 0.5, radius: 1, length: 1, angle: 0deg, value: none, label: none, at: none, ..args) = cetz.draw.get-ctx(ctx => {
  import cetz: draw, coordinate, vector
  let (style, pts) = (args.named(), args.pos())
  let given = stroke(style.at("stroke", default: black))
  let paint = if given.paint == auto { black } else { given.paint }
  let pen = (paint: paint, thickness: if given.thickness == auto { 0.4pt } else { given.thickness }, dash: if given.dash == auto { none } else { given.dash })
  let tip = (symbol: ">", fill: paint, length: 0.22, width: 0.09)
  let tag(at, body, ..a) = draw.content(at, text(size: 8pt, fill: paint, body), padding: 0.05, ..a)
  let (ctx, ..p) = coordinate.resolve(ctx, ..pts)
  let p = p.map(q => q.slice(0, 2))
  let shown(size, digits) = if label == none [#calc.round(size * ctx.length / 1cm, digits: digits)] else { label }
  if kind == "angle" {
    let (ctx, v) = coordinate.resolve(ctx, at)
    let along(a, b) = vector.add(v.slice(0, 2), vector.sub(b, a))
    let degrees(a) = text(size: 8pt, fill: paint)[#calc.round(a.deg(), digits: 1)°]
    cetz.angle.angle(v, along(p.at(0), p.at(1)), along(p.at(2), p.at(3)), radius: radius, label: if label == none { degrees } else { label }, label-radius: radius + 0.35, mark: (symbol: ">", fill: paint), stroke: pen)
  } else if kind == "radius" {
    let c = p.at(0)
    let toward = (calc.cos(angle), calc.sin(angle))
    let end = vector.add(c, vector.scale(toward, length))
    draw.line(c, end, stroke: pen, mark: (end: tip))
    tag(vector.add(end, vector.scale(toward, 0.1)), if label == none [R #value] else { label }, anchor: if toward.at(0) >= 0 { "west" } else { "east" })
  } else {
    let (a, b) = (p.at(0), p.at(1))
    let (ea, eb, size) = if kind == "x" {
      ((a.at(0), a.at(1) + offset), (b.at(0), a.at(1) + offset), calc.abs(b.at(0) - a.at(0)))
    } else if kind == "y" {
      ((a.at(0) + offset, a.at(1)), (a.at(0) + offset, b.at(1)), calc.abs(b.at(1) - a.at(1)))
    } else {
      let len = calc.max(vector.dist(a, b), 1e-9)
      let n = ((a.at(1) - b.at(1)) / len, (b.at(0) - a.at(0)) / len)
      (vector.add(a, vector.scale(n, offset)), vector.add(b, vector.scale(n, offset)), len)
    }
    // each extension line from just off its point to just past the dimension line
    for (from, to) in ((a, ea), (b, eb)) {
      let reach = vector.dist(from, to)
      if reach > 0.1 {
        let u = vector.scale(vector.sub(to, from), 1 / reach)
        draw.line(vector.add(from, vector.scale(u, 0.08)), vector.add(to, vector.scale(u, 0.12)), stroke: pen)
      }
    }
    let span = calc.max(vector.dist(ea, eb), 1e-9)
    let u = vector.scale(vector.sub(eb, ea), 1 / span)
    // too short for its arrowheads between the lines, they point in from outside
    if span >= 0.6 { draw.line(ea, eb, stroke: pen, mark: (start: tip, end: tip)) } else {
      draw.line(ea, eb, stroke: pen)
      draw.line(vector.sub(ea, vector.scale(u, 0.4)), ea, stroke: pen, mark: (end: tip))
      draw.line(vector.add(eb, vector.scale(u, 0.4)), eb, stroke: pen, mark: (end: tip))
    }
    let t = calc.atan2(u.at(0), u.at(1))
    let turn = if t > 90deg { t - 180deg } else if t <= -90deg { t + 180deg } else { t }
    tag(vector.lerp(ea, eb, 0.5), shown(size, 2), anchor: "south", angle: turn)
  }
})`;

/** the document with the texpile- calls defined, after the import of CeTZ */
export function withTexpile(source: string) {
	if (/^#let texpile-dimension\(/m.test(source)) return source;
	const line = /^#import\s+"@preview\/cetz:[^\n]*\n/m.exec(source);
	const at = line ? line.index + line[0].length : 0;
	return `${source.slice(0, at)}${TEXPILE}\n${source.slice(at)}`;
}
