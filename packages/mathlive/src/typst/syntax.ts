/** a node of Typst's syntax tree: typst-syntax's SyntaxKind name, UTF-16 offsets into the source */
export type TypstSyntaxNode = {
  kind: string;
  from: number;
  to: number;
  children: TypstSyntaxNode[];
};

/** parses what sits between `$` and `$` and returns its `Math` node, Error nodes included */
export type TypstMathParser = (source: string) => TypstSyntaxNode;

let parser: TypstMathParser | undefined;

/**
 * Typst math is read with Typst's own parser, which the host supplies: it is typst-syntax built
 * to wasm and has no place in this bundle.
 *
 * @category Typst
 */
export function configureTypst(options: { parse: TypstMathParser }): void {
  parser = options.parse;
}

export function parseTypstSyntax(source: string): TypstSyntaxNode {
  if (!parser)
    throw new Error(
      'MathLive {{SDK_VERSION}}: call configureTypst() before reading Typst'
    );
  return parser(source);
}

export function hasTypstError(node: TypstSyntaxNode): boolean {
  return node.kind === 'Error' || node.children.some(hasTypstError);
}
