// the entry tinymist compiles in memory to report the numbers Typst prints, written up in texpile-tools/typst-numbering
export const NUMBERS_PROBE_FILE = '__texpile_numbers.typ';
export const NUMBERS_PROBE_LABEL = '__texpile_numbers';

const PROBE_BODY = `#let __tx-plain(c) = {
  if type(c) == str { c }
  else if type(c) != content { "" }
  else if c.has("text") { c.text }
  else if c.has("children") { c.children.map(__tx-plain).join("") }
  else if c.has("body") { __tx-plain(c.body) }
  else if c.has("child") { __tx-plain(c.child) }
  else if c == [ ] { " " }
  else { "" }
}
#let __tx-printed(counter, pattern, loc) = if pattern == none { none } else {
  let printed = numbering(pattern, ..counter.at(loc))
  if type(printed) == str { printed } else { __tx-plain(printed) }
}
#let __tx-describe(it) = {
  let loc = it.location()
  let label = it.at("label", default: none)
  let base = (label: if label == none { none } else { str(label) }, page: loc.page())
  let fields = if it.func() == heading {
    (kind: "heading", number: __tx-printed(counter(heading), it.numbering, loc), text: __tx-plain(it.body), level: it.level)
  } else if it.func() == math.equation {
    (kind: "equation", number: __tx-printed(counter(math.equation), it.numbering, loc), text: "")
  } else if it.func() == figure {
    (
      kind: "figure",
      number: __tx-printed(it.counter, it.numbering, loc),
      text: if it.caption == none { "" } else { __tx-plain(it.caption.body) },
      figureKind: if type(it.kind) == str { it.kind } else { repr(it.kind) },
      supplement: if type(it.supplement) == content { __tx-plain(it.supplement) } else { none },
    )
  } else {
    let own = type(it.body) == content
    let target = if own { it } else { query(it.body).first() }
    (
      kind: "footnote",
      number: __tx-printed(counter(footnote), it.numbering, target.location()),
      text: __tx-plain(target.body),
      repeats: if own { none } else { str(it.body) },
    )
  }
  fields + base
}
#let __tx-mark(it) = [#metadata((loc: it.location(), item: __tx-describe(it))) <__texpile_exact>]

#show heading: it => { it; context __tx-mark(it) }
#show math.equation.where(block: true): it => { it; context __tx-mark(it) }
#show figure: it => { it; context __tx-mark(it) }
#show footnote: it => { it; context __tx-mark(it) }
`;

const PROBE_TAIL = `
#context {
  let exact = query(<__texpile_exact>).map(m => m.value)
  let next = 0
  let items = ()
  for it in query(selector(heading).or(math.equation.where(block: true), figure, footnote)) {
    let found = none
    for j in range(next, exact.len()) { if exact.at(j).loc == it.location() { found = j; break } }
    if found == none { for j in range(0, next) { if exact.at(j).loc == it.location() { found = j; break } } }
    if found == none {
      items.push((..__tx-describe(it), exact: false))
    } else {
      if found >= next { next = found + 1 }
      items.push((..exact.at(found).item, exact: true))
    }
  }
  [#metadata(items) <__texpile_numbers>]
}
`;

/** the entry's Typst source for a main file given relative to the folder root, with forward slashes */
export function numbersProbeText(mainFile: string): string {
	const path = mainFile.replace(/\\/g, '/').replace(/^\.?\//, '');
	return `${PROBE_BODY}#include ${JSON.stringify(path)}\n${PROBE_TAIL}`;
}
