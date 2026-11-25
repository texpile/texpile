import { EditorState, Transaction, Selection, Plugin } from 'prosemirror-state';
import { Node, Mark, Slice, ResolvedPos, DOMParser, DOMSerializer } from 'prosemirror-model';
import { Mapping } from 'prosemirror-transform';
import type { VisualView } from '../viewTypes';

type DOMNode = InstanceType<typeof window.Node>;

type WidgetConstructor = ((view: EditorView, getPos: () => number | undefined) => DOMNode) | DOMNode;
/**
Decoration objects can be provided to the view through the
[`decorations` prop](https://prosemirror.net/docs/ref/#view.EditorProps.decorations). They come in
several variants—see the static members of this class for details.
*/
declare class Decoration {
    /**
    The start position of the decoration.
    */
    readonly from: number;
    /**
    The end position. Will be the same as `from` for [widget
    decorations](https://prosemirror.net/docs/ref/#view.Decoration^widget).
    */
    readonly to: number;
    /**
    Creates a widget decoration, which is a DOM node that's shown in
    the document at the given position. It is recommended that you
    delay rendering the widget by passing a function that will be
    called when the widget is actually drawn in a view, but you can
    also directly pass a DOM node. `getPos` can be used to find the
    widget's current document position.
    */
    static widget(pos: number, toDOM: WidgetConstructor, spec?: {
        /**
        Controls which side of the document position this widget is
        associated with. When negative, it is drawn before a cursor
        at its position, and content inserted at that position ends
        up after the widget. When zero (the default) or positive, the
        widget is drawn after the cursor and content inserted there
        ends up before the widget.
        
        When there are multiple widgets at a given position, their
        `side` values determine the order in which they appear. Those
        with lower values appear first. The ordering of widgets with
        the same `side` value is unspecified.
        
        When `marks` is null, `side` also determines the marks that
        the widget is wrapped in—those of the node before when
        negative, those of the node after when positive.
        */
        side?: number;
        /**
        By default, the cursor, when at the position of the widget,
        will be strictly kept on the side indicated by
        [`side`](https://prosemirror.net/docs/ref/#view.Decoration^widget^spec.side). Set this to true
        to allow the DOM selection to stay on the other side if the
        client sets it there.
        
        **Note**: Mapping of this decoration, which decides on which
        side insertions at its position appear, will still happen
        according to `side`, and keyboard cursor motion will not,
        without further custom handling, visit both sides of the
        widget.
        */
        relaxedSide?: boolean;
        /**
        The precise set of marks to draw around the widget.
        */
        marks?: readonly Mark[];
        /**
        Can be used to control which DOM events, when they bubble out
        of this widget, the editor view should ignore.
        */
        stopEvent?: (event: Event) => boolean;
        /**
        When set (defaults to false), selection changes inside the
        widget are ignored, and don't cause ProseMirror to try and
        re-sync the selection with its selection state.
        */
        ignoreSelection?: boolean;
        /**
        When comparing decorations of this type (in order to decide
        whether it needs to be redrawn), ProseMirror will by default
        compare the widget DOM node by identity. If you pass a key,
        that key will be compared instead, which can be useful when
        you generate decorations on the fly and don't want to store
        and reuse DOM nodes. Make sure that any widgets with the same
        key are interchangeable—if widgets differ in, for example,
        the behavior of some event handler, they should get
        different keys.
        */
        key?: string;
        /**
        Called when the widget decoration is removed or the editor is
        destroyed.
        */
        destroy?: (node: DOMNode) => void;
        /**
        Specs allow arbitrary additional properties.
        */
        [key: string]: any;
    }): Decoration;
    /**
    Creates an inline decoration, which adds the given attributes to
    each inline node between `from` and `to`.
    */
    static inline(from: number, to: number, attrs: DecorationAttrs, spec?: {
        /**
        Determines how the left side of the decoration is
        [mapped](https://prosemirror.net/docs/ref/#transform.Position_Mapping) when content is
        inserted directly at that position. By default, the decoration
        won't include the new content, but you can set this to `true`
        to make it inclusive.
        */
        inclusiveStart?: boolean;
        /**
        Determines how the right side of the decoration is mapped.
        See
        [`inclusiveStart`](https://prosemirror.net/docs/ref/#view.Decoration^inline^spec.inclusiveStart).
        */
        inclusiveEnd?: boolean;
        /**
        Specs may have arbitrary additional properties.
        */
        [key: string]: any;
    }): Decoration;
    /**
    Creates a node decoration. `from` and `to` should point precisely
    before and after a node in the document. That node, and only that
    node, will receive the given attributes.
    */
    static node(from: number, to: number, attrs: DecorationAttrs, spec?: any): Decoration;
    /**
    The spec provided when creating this decoration. Can be useful
    if you've stored extra information in that object.
    */
    get spec(): any;
}
/**
A set of attributes to add to a decorated node. Most properties
simply directly correspond to DOM attributes of the same name,
which will be set to the property's value. These are exceptions:
*/
type DecorationAttrs = {
    /**
    When non-null, the target node is wrapped in a DOM element of
    this type (and the other attributes are applied to this element).
    */
    nodeName?: string;
    /**
    A CSS class name or a space-separated set of class names to be
    _added_ to the classes that the node already had.
    */
    class?: string;
    /**
    A string of CSS to be _added_ to the node's existing `style` property.
    */
    style?: string;
    /**
    Any other properties are treated as regular DOM attributes.
    */
    [attribute: string]: string | undefined;
};
/**
An object that can [provide](https://prosemirror.net/docs/ref/#view.EditorProps.decorations)
decorations. Implemented by [`DecorationSet`](https://prosemirror.net/docs/ref/#view.DecorationSet),
and passed to [node views](https://prosemirror.net/docs/ref/#view.EditorProps.nodeViews).
*/
interface DecorationSource {
    /**
    Map the set of decorations in response to a change in the
    document.
    */
    map: (mapping: Mapping, node: Node) => DecorationSource;
    /**
    Extract a DecorationSource containing decorations for the given child node at the given offset.
    */
    forChild(offset: number, child: Node): DecorationSource;
    /**
    Call the given function for each decoration set in the group.
    */
    forEachSet(f: (set: DecorationSet) => void): void;
}
/**
A collection of [decorations](https://prosemirror.net/docs/ref/#view.Decoration), organized in such
a way that the drawing algorithm can efficiently use and compare
them. This is a persistent data structure—it is not modified,
updates create a new value.
*/
declare class DecorationSet implements DecorationSource {
    /**
    Create a set of decorations, using the structure of the given
    document. This will consume (modify) the `decorations` array, so
    you must make a copy if you want need to preserve that.
    */
    static create(doc: Node, decorations: Decoration[]): DecorationSet;
    /**
    Find all decorations in this set which touch the given range
    (including decorations that start or end directly at the
    boundaries) and match the given predicate on their spec. When
    `start` and `end` are omitted, all decorations in the set are
    considered. When `predicate` isn't given, all decorations are
    assumed to match.
    */
    find(start?: number, end?: number, predicate?: (spec: any) => boolean): Decoration[];
    private findInner;
    /**
    Map the set of decorations in response to a change in the
    document.
    */
    map(mapping: Mapping, doc: Node, options?: {
        /**
        When given, this function will be called for each decoration
        that gets dropped as a result of the mapping, passing the
        spec of that decoration.
        */
        onRemove?: (decorationSpec: any) => void;
    }): DecorationSet;
    /**
    Add the given array of decorations to the ones in the set,
    producing a new set. Consumes the `decorations` array. Needs
    access to the current document to create the appropriate tree
    structure.
    */
    add(doc: Node, decorations: Decoration[]): DecorationSet;
    private addInner;
    /**
    Create a new set that contains the decorations in this set, minus
    the ones in the given array.
    */
    remove(decorations: Decoration[]): DecorationSet;
    private removeInner;
    forChild(offset: number, node: Node): DecorationSet | DecorationGroup;
    /**
    The empty set of decorations.
    */
    static empty: DecorationSet;
    forEachSet(f: (set: DecorationSet) => void): void;
}
declare class DecorationGroup implements DecorationSource {
    readonly members: readonly DecorationSet[];
    constructor(members: readonly DecorationSet[]);
    map(mapping: Mapping, doc: Node): DecorationSource;
    forChild(offset: number, child: Node): DecorationSource | DecorationSet;
    eq(other: DecorationGroup): boolean;
    locals(node: Node): readonly any[];
    static from(members: readonly DecorationSource[]): DecorationSource;
    forEachSet(f: (set: DecorationSet) => void): void;
}

declare global {
    interface Node {
    }
}
/**
A ViewMutationRecord represents a DOM
[mutation](https://developer.mozilla.org/en-US/docs/Web/API/MutationObserver)
or a selection change happens within the view. When the change is
a selection change, the record will have a `type` property of
`"selection"` (which doesn't occur for native mutation records).
*/
type ViewMutationRecord = MutationRecord | {
    type: "selection";
    target: DOMNode;
};
/**
By default, document nodes are rendered using the result of the
[`toDOM`](https://prosemirror.net/docs/ref/#model.NodeSpec.toDOM) method of their spec, and managed
entirely by the editor. For some use cases, such as embedded
node-specific editing interfaces, you want more control over
the behavior of a node's in-editor representation, and need to
[define](https://prosemirror.net/docs/ref/#view.EditorProps.nodeViews) a custom node view.

Objects returned as node views must conform to this interface.
*/
interface NodeView {
    /**
    The outer DOM node that represents the document node.
    */
    dom: HTMLElement;
    /**
    The DOM node that should hold the node's content. Only meaningful
    if the node view also defines a `dom` property and if its node
    type is not a leaf node type. When this is present, ProseMirror
    will take care of rendering the node's children into it. When it
    is not present, the node view itself is responsible for rendering
    (or deciding not to render) its child nodes.
    */
    contentDOM?: HTMLElement | null;
    /**
    When given, this will be called when the view is updating
    itself. It will be given a node, an array of active decorations
    around the node (which are automatically drawn, and the node
    view may ignore if it isn't interested in them), and a
    [decoration source](https://prosemirror.net/docs/ref/#view.DecorationSource) that represents any
    decorations that apply to the content of the node (which again
    may be ignored). It should return true if it was able to update
    to that node, and false otherwise. If the node view has a
    `contentDOM` property (or no `dom` property), updating its child
    nodes will be handled by ProseMirror.
    */
    update?: (node: Node, decorations: readonly Decoration[], innerDecorations: DecorationSource) => boolean;
    /**
    By default, `update` will only be called when a node of the same
    node type appears in this view's position. When you set this to
    true, it will be called for any node, making it possible to have
    a node view that representsmultiple types of nodes. You will
    need to check the type of the nodes you get in `update` and
    return `false` for types you cannot handle.
    */
    multiType?: boolean;
    /**
    Can be used to override the way the node's selected status (as a
    node selection) is displayed.
    */
    selectNode?: () => void;
    /**
    When defining a `selectNode` method, you should also provide a
    `deselectNode` method to remove the effect again.
    */
    deselectNode?: () => void;
    /**
    This will be called to handle setting the selection inside the
    node. The `anchor` and `head` positions are relative to the start
    of the node. By default, a DOM selection will be created between
    the DOM positions corresponding to those positions, but if you
    override it you can do something else.
    */
    setSelection?: (anchor: number, head: number, root: Document | ShadowRoot) => void;
    /**
    Can be used to prevent the editor view from trying to handle some
    or all DOM events that bubble up from the node view. Events for
    which this returns true are not handled by the editor.
    */
    stopEvent?: (event: Event) => boolean;
    /**
    Called when a [mutation](https://prosemirror.net/docs/ref/#view.ViewMutationRecord) happens within the
    view. Return false if the editor should re-read the selection or re-parse
    the range around the mutation, true if it can safely be ignored.
    */
    ignoreMutation?: (mutation: ViewMutationRecord) => boolean;
    /**
    Called when the node view is removed from the editor or the whole
    editor is destroyed.
    */
    destroy?: () => void;
}
/**
By default, document marks are rendered using the result of the
[`toDOM`](https://prosemirror.net/docs/ref/#model.MarkSpec.toDOM) method of their spec, and managed entirely
by the editor. For some use cases, you want more control over the behavior
of a mark's in-editor representation, and need to
[define](https://prosemirror.net/docs/ref/#view.EditorProps.markViews) a custom mark view.

Objects returned as mark views must conform to this interface.
*/
interface MarkView {
    /**
    The outer DOM node that represents the document node.
    */
    dom: HTMLElement;
    /**
    The DOM node that should hold the mark's content. When this is not
    present, the `dom` property is used as the content DOM.
    */
    contentDOM?: HTMLElement | null;
    /**
    When given, this is called when the view is updating itself. It
    will be given a mark (of the same type as the current one). When it
    returns true, the existing DOM is kept and reused (its content is
    still managed by ProseMirror); when it returns false, the mark view
    is rebuilt.
    */
    update?: (mark: Mark) => boolean;
    /**
    Called when a [mutation](https://prosemirror.net/docs/ref/#view.ViewMutationRecord) happens within the
    view. Return false if the editor should re-read the selection or re-parse
    the range around the mutation, true if it can safely be ignored.
    */
    ignoreMutation?: (mutation: ViewMutationRecord) => boolean;
    /**
    Called when the mark view is removed from the editor or the whole
    editor is destroyed.
    */
    destroy?: () => void;
}

// canvas: the narrowed EditorView (design D2), the rest of this file is prosemirror-view 1.42.9's dist/index.d.ts
/**
Exactly the canvas view's members (VisualView, whose transitional members package Z deletes). The constructor stays for
the DOM editor's mounts and the tests that build one; lint bans `new EditorView(`.
*/
interface EditorView extends VisualView {
}
declare class EditorView {
    constructor(place: null | DOMNode | ((editor: HTMLElement) => void) | {
        mount: HTMLElement;
    }, props: DirectEditorProps);
}
// canvas: end
/**
The type of function [provided](https://prosemirror.net/docs/ref/#view.EditorProps.nodeViews) to
create [node views](https://prosemirror.net/docs/ref/#view.NodeView).
*/
type NodeViewConstructor = (node: Node, view: EditorView, getPos: () => number | undefined, decorations: readonly Decoration[], innerDecorations: DecorationSource) => NodeView;
/**
The function types [used](https://prosemirror.net/docs/ref/#view.EditorProps.markViews) to create
mark views.
*/
type MarkViewConstructor = (mark: Mark, view: EditorView, inline: boolean) => MarkView;
/**
Helper type that maps event names to event object types, but
includes events that TypeScript's HTMLElementEventMap doesn't know
about.
*/
interface DOMEventMap extends HTMLElementEventMap {
    [event: string]: any;
}
/**
Props are configuration values that can be passed to an editor view
or included in a plugin. This interface lists the supported props.

The various event-handling functions may all return `true` to
indicate that they handled the given event. The view will then take
care to call `preventDefault` on the event, except with
`handleDOMEvents`, where the handler itself is responsible for that.

How a prop is resolved depends on the prop. Handler functions are
called one at a time, starting with the base props and then
searching through the plugins (in order of appearance) until one of
them returns true. For some props, the first plugin that yields a
value gets precedence.

The optional type parameter refers to the type of `this` in prop
functions, and is used to pass in the plugin type when defining a
[plugin](https://prosemirror.net/docs/ref/#state.Plugin).
*/
interface EditorProps<P = any> {
    /**
    Can be an object mapping DOM event type names to functions that
    handle them. Such functions will be called before any handling
    ProseMirror does of events fired on the editable DOM element.
    Contrary to the other event handling props, when returning true
    from such a function, you are responsible for calling
    `preventDefault` yourself (or not, if you want to allow the
    default behavior).
    */
    handleDOMEvents?: {
        [event in keyof DOMEventMap]?: (this: P, view: EditorView, event: DOMEventMap[event]) => boolean | void;
    };
    /**
    Called when the editor receives a `keydown` event.
    */
    handleKeyDown?: (this: P, view: EditorView, event: KeyboardEvent) => boolean | void;
    /**
    Handler for `keypress` events.
    */
    handleKeyPress?: (this: P, view: EditorView, event: KeyboardEvent) => boolean | void;
    /**
    Whenever the user directly input text, this handler is called
    before the input is applied. If it returns `true`, the default
    behavior of actually inserting the text is suppressed.
    */
    handleTextInput?: (this: P, view: EditorView, from: number, to: number, text: string, deflt: () => Transaction) => boolean | void;
    /**
    Called for each node around a click, from the inside out. The
    `direct` flag will be true for the inner node.
    */
    handleClickOn?: (this: P, view: EditorView, pos: number, node: Node, nodePos: number, event: MouseEvent, direct: boolean) => boolean | void;
    /**
    Called when the editor is clicked, after `handleClickOn` handlers
    have been called.
    */
    handleClick?: (this: P, view: EditorView, pos: number, event: MouseEvent) => boolean | void;
    /**
    Called for each node around a double click.
    */
    handleDoubleClickOn?: (this: P, view: EditorView, pos: number, node: Node, nodePos: number, event: MouseEvent, direct: boolean) => boolean | void;
    /**
    Called when the editor is double-clicked, after `handleDoubleClickOn`.
    */
    handleDoubleClick?: (this: P, view: EditorView, pos: number, event: MouseEvent) => boolean | void;
    /**
    Called for each node around a triple click.
    */
    handleTripleClickOn?: (this: P, view: EditorView, pos: number, node: Node, nodePos: number, event: MouseEvent, direct: boolean) => boolean | void;
    /**
    Called when the editor is triple-clicked, after `handleTripleClickOn`.
    */
    handleTripleClick?: (this: P, view: EditorView, pos: number, event: MouseEvent) => boolean | void;
    /**
    Can be used to override the behavior of pasting. `slice` is the
    pasted content parsed by the editor, but you can directly access
    the event to get at the raw content.
    */
    handlePaste?: (this: P, view: EditorView, event: ClipboardEvent, slice: Slice) => boolean | void;
    /**
    Called when something is dropped on the editor. `moved` will be
    true if this drop moves from the current selection (which should
    thus be deleted).
    */
    handleDrop?: (this: P, view: EditorView, event: DragEvent, slice: Slice, moved: boolean) => boolean | void;
    /**
    Called when the view, after updating its state, tries to scroll
    the selection into view. A handler function may return false to
    indicate that it did not handle the scrolling and further
    handlers or the default behavior should be tried.
    */
    handleScrollToSelection?: (this: P, view: EditorView) => boolean;
    /**
    Determines whether an in-editor drag event should copy or move
    the selection. When not given, the event's `altKey` property is
    used on macOS, `ctrlKey` on other platforms.
    */
    dragCopies?: (event: DragEvent) => boolean;
    /**
    Can be used to override the way a selection is created when
    reading a DOM selection between the given anchor and head.
    */
    createSelectionBetween?: (this: P, view: EditorView, anchor: ResolvedPos, head: ResolvedPos) => Selection | null;
    /**
    The [parser](https://prosemirror.net/docs/ref/#model.DOMParser) to use when reading editor changes
    from the DOM. Defaults to calling
    [`DOMParser.fromSchema`](https://prosemirror.net/docs/ref/#model.DOMParser^fromSchema) on the
    editor's schema.
    */
    domParser?: DOMParser;
    /**
    Can be used to transform pasted HTML text, _before_ it is parsed,
    for example to clean it up.
    */
    transformPastedHTML?: (this: P, html: string, view: EditorView) => string;
    /**
    The [parser](https://prosemirror.net/docs/ref/#model.DOMParser) to use when reading content from
    the clipboard. When not given, the value of the
    [`domParser`](https://prosemirror.net/docs/ref/#view.EditorProps.domParser) prop is used.
    */
    clipboardParser?: DOMParser;
    /**
    Transform pasted plain text. The `plain` flag will be true when
    the text is pasted as plain text.
    */
    transformPastedText?: (this: P, text: string, plain: boolean, view: EditorView) => string;
    /**
    A function to parse text from the clipboard into a document
    slice. Called after
    [`transformPastedText`](https://prosemirror.net/docs/ref/#view.EditorProps.transformPastedText).
    The default behavior is to split the text into lines, wrap them
    in `<p>` tags, and call
    [`clipboardParser`](https://prosemirror.net/docs/ref/#view.EditorProps.clipboardParser) on it.
    The `plain` flag will be true when the text is pasted as plain text.
    */
    clipboardTextParser?: (this: P, text: string, $context: ResolvedPos, plain: boolean, view: EditorView) => Slice;
    /**
    Can be used to transform pasted or dragged-and-dropped content
    before it is applied to the document. The `plain` flag will be
    true when the text is pasted as plain text.
    */
    transformPasted?: (this: P, slice: Slice, view: EditorView, plain: boolean) => Slice;
    /**
    Can be used to transform copied or cut content before it is
    serialized to the clipboard.
    */
    transformCopied?: (this: P, slice: Slice, view: EditorView) => Slice;
    /**
    Allows you to pass custom rendering and behavior logic for
    nodes. Should map node names to constructor functions that
    produce a [`NodeView`](https://prosemirror.net/docs/ref/#view.NodeView) object implementing the
    node's display behavior. The third argument `getPos` is a
    function that can be called to get the node's current position,
    which can be useful when creating transactions to update it.
    Note that if the node is not in the document, the position
    returned by this function will be `undefined`.
    
    `decorations` is an array of node or inline decorations that are
    active around the node. They are automatically drawn in the
    normal way, and you will usually just want to ignore this, but
    they can also be used as a way to provide context information to
    the node view without adding it to the document itself.
    
    `innerDecorations` holds the decorations for the node's content.
    You can safely ignore this if your view has no content or a
    `contentDOM` property, since the editor will draw the decorations
    on the content. But if you, for example, want to create a nested
    editor with the content, it may make sense to provide it with the
    inner decorations.
    
    (For backwards compatibility reasons, [mark
    views](https://prosemirror.net/docs/ref/#view.EditorProps.markViews) can also be included in this
    object.)
    */
    nodeViews?: {
        [node: string]: NodeViewConstructor;
    };
    /**
    Pass custom mark rendering functions. Note that these cannot
    provide the kind of dynamic behavior that [node
    views](https://prosemirror.net/docs/ref/#view.NodeView) can—they just provide custom rendering
    logic. The third argument indicates whether the mark's content
    is inline.
    */
    markViews?: {
        [mark: string]: MarkViewConstructor;
    };
    /**
    The DOM serializer to use when putting content onto the
    clipboard. If not given, the result of
    [`DOMSerializer.fromSchema`](https://prosemirror.net/docs/ref/#model.DOMSerializer^fromSchema)
    will be used. This object will only have its
    [`serializeFragment`](https://prosemirror.net/docs/ref/#model.DOMSerializer.serializeFragment)
    method called, and you may provide an alternative object type
    implementing a compatible method.
    */
    clipboardSerializer?: DOMSerializer;
    /**
    A function that will be called to get the text for the current
    selection when copying text to the clipboard. By default, the
    editor will use [`textBetween`](https://prosemirror.net/docs/ref/#model.Node.textBetween) on the
    selected range.
    */
    clipboardTextSerializer?: (this: P, content: Slice, view: EditorView) => string;
    /**
    A set of [document decorations](https://prosemirror.net/docs/ref/#view.Decoration) to show in the
    view.
    */
    decorations?: (this: P, state: EditorState) => DecorationSource | null | undefined;
    /**
    When this returns false, the content of the view is not directly
    editable.
    */
    editable?: (this: P, state: EditorState) => boolean;
    /**
    Control the DOM attributes of the editable element. May be either
    an object or a function going from an editor state to an object.
    By default, the element will get a class `"ProseMirror"`, and
    will have its `contentEditable` attribute determined by the
    [`editable` prop](https://prosemirror.net/docs/ref/#view.EditorProps.editable). Additional classes
    provided here will be added to the class. For other attributes,
    the value provided first (as in
    [`someProp`](https://prosemirror.net/docs/ref/#view.EditorView.someProp)) will be used.
    */
    attributes?: {
        [name: string]: string;
    } | ((state: EditorState) => {
        [name: string]: string;
    });
    /**
    Determines the distance (in pixels) between the cursor and the
    end of the visible viewport at which point, when scrolling the
    cursor into view, scrolling takes place. Defaults to 0.
    */
    scrollThreshold?: number | {
        top: number;
        right: number;
        bottom: number;
        left: number;
    };
    /**
    Determines the extra space (in pixels) that is left above or
    below the cursor when it is scrolled into view. Defaults to 5.
    */
    scrollMargin?: number | {
        top: number;
        right: number;
        bottom: number;
        left: number;
    };
}
/**
The props object given directly to the editor view supports some
fields that can't be used in plugins:
*/
interface DirectEditorProps extends EditorProps {
    /**
    The current state of the editor.
    */
    state: EditorState;
    /**
    A set of plugins to use in the view, applying their [plugin
    view](https://prosemirror.net/docs/ref/#state.PluginSpec.view) and
    [props](https://prosemirror.net/docs/ref/#state.PluginSpec.props). Passing plugins with a state
    component (a [state field](https://prosemirror.net/docs/ref/#state.PluginSpec.state) field or a
    [transaction](https://prosemirror.net/docs/ref/#state.PluginSpec.filterTransaction) filter or
    appender) will result in an error, since such plugins must be
    present in the state to work.
    */
    plugins?: readonly Plugin[];
    /**
    The callback over which to send transactions (state updates)
    produced by the view. If you specify this, you probably want to
    make sure this ends up calling the view's
    [`updateState`](https://prosemirror.net/docs/ref/#view.EditorView.updateState) method with a new
    state that has the transaction
    [applied](https://prosemirror.net/docs/ref/#state.EditorState.apply). The callback will be bound to have
    the view instance as its `this` binding.
    */
    dispatchTransaction?: (tr: Transaction) => void;
}

export { Decoration, DecorationSet, EditorView };
export type { DOMEventMap, DecorationAttrs, DecorationSource, DirectEditorProps, EditorProps, MarkView, MarkViewConstructor, NodeView, NodeViewConstructor, ViewMutationRecord };
