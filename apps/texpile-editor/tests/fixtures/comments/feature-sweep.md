---
title: A Test Document for Texpile
author: Texpile QA
date: 2026-08-10
tags: [markdown, commonmark, test]
---

# Markdown feature sweep

This file is here to be opened in both the visual and source editors, and to survive the trip
between them unchanged. The frontmatter above is YAML and is edited in source mode.

## Headings

# H1 (ATX)

## H2 (ATX)

### H3 (ATX)

#### H4 (ATX)

##### H5 (ATX)

###### H6 (ATX)

### A closed ATX heading ###

Setext H1
=========

Setext H2
---------

## Inline formatting

Text can be *emphasised*, _also emphasised_, **strong**, __also strong__, ***both at once***,
`inline code`, and ~~struck through~~ where the renderer supports it.

Escapes matter: \*not emphasis\*, \_not emphasis\_, \# not a heading, and a literal backslash \\.

A hard line break follows this sentence with two trailing spaces  
and continues on the next line. A backslash break works too\
like this.

Entities: &amp; &lt; &gt; &copy; &mdash; &hellip;

Non-ASCII prose for the spell checker: naïve, café, Gödel, Erdős, Straße, ¿por qué?, 日本語,
العربية, עברית, and an emoji 🚀.

## Lists

- A bullet.
- Another bullet.
  - Nested.
    - Deeper.
- A bullet with a paragraph underneath:

  This paragraph belongs to the item above, indented by two spaces.

* A different bullet marker.
+ And a third.

1. Ordered.
2. Second.
3. Third.

Numbers need not be sequential:

1. All ones.
1. Still renders correctly.
1. As one, two, three.

A list may start at any number:

5. Five.
6. Six.
7. Seven.

Parentheses are a valid delimiter:

1) First.
2) Second.

Mixed nesting:

1. Ordered parent.
   - Unordered child.
     1. Ordered grandchild.

A loose list, which has blank lines between items:

- First item.
- Second item.

Task lists, where supported:

- [ ] An unchecked task.
- [x] A completed task.

## Links and images

An [inline link](https://texpile.com), an [inline link with a title](https://texpile.com "The
Texpile site"), a [reference link][ref], a [collapsed reference][], and a bare autolink:
<https://typst.app>.

[ref]: https://github.com/typst/typst
[collapsed reference]: https://commonmark.org

A relative link to a sibling file: [the guide](guide.md), and one into another project:
[the LaTeX document](../latex/main.tex).

An image, which the editor should render inline and let you resize:

![A generated plate](images/plate.png)

An image with a title: ![plate](images/plate.png "Hover text")

## Blockquotes

> A single-level quote.
>
> With a second paragraph.
>
> > And a nested quote inside it.
> >
> > - Containing a list.

## Code

Inline `code`, and code containing a backtick: `` a ` b ``.

An indented code block:

    def indented():
        return "four spaces"

A fenced block with a language:

```python
def fib(n: int) -> int:
    """Docstring, not prose - the spell checker should leave this alone."""
    a, b = 0, 1
    for _ in range(n):
        a, b = b, a + b
    return a
```

```json
{
  "name": "texpile-test",
  "nested": { "array": [1, 2, 3], "flag": true, "nothing": null }
}
```

A fence using tildes, containing backticks:

~~~
```
not a nested fence
```
~~~

## Math

Inline math renders with `$`: $E = mc^2$, and $\sum_{k=1}^{n} k = \frac{n(n+1)}{2}$.

Display math uses a double dollar:

$$
\int_{0}^{\infty} e^{-x^2} \, dx = \frac{\sqrt{\pi}}{2}
$$

$$
A = \begin{pmatrix} 1 & 2 \\ 3 & 4 \end{pmatrix}
\qquad
\det A = -2
$$

## Tables

| Method   | Variant |  Mean |  Std |
| :------- | :-----: | ----: | ---: |
| Baseline | none    | 61.30 | 2.41 |
| Ours     | small   | 74.05 | 1.98 |
| Ours     | large   | 81.77 | 1.12 |

A table with inline formatting and a pipe escape:

| Syntax | Renders as | Note |
| ------ | ---------- | ---- |
| `*x*`  | *x*        | a \| literal pipe |
| `[l](u)` | [l](https://texpile.com) | a link |

## Horizontal rules

---

***

___

## Footnotes

A sentence with a footnote.[^1] And a second.[^note]

[^1]: The first footnote body.
[^note]: A named footnote, which can span
    multiple lines when indented.

## HTML passthrough

<div align="center">
  <strong>Raw HTML</strong>, which CommonMark passes through untouched.
</div>

Inline <em>HTML</em> too.

## Edge cases

A line ending in a backslash inside a paragraph, a URL with parentheses
<https://en.wikipedia.org/wiki/Bracket_(disambiguation)>, an underscore in snake_case_words
that must not become emphasis, an asterisk in 2 * 3 * 4, and a heading-like line that is not a
heading because it is escaped: \## not a heading.

A very long line that should wrap in the editor without ever being rewrapped in the file, so
that the source stays exactly as written no matter how narrow the window gets, which is the
whole point of soft wrapping as opposed to hard wrapping.
