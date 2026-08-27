// "Nothing below 300ms."
//
// A wait shorter than this is not worth announcing: the note appears and is gone again before it can
// be read, which registers as a flicker rather than as information. Past it, silence starts to read
// as a hang. One threshold, in one place, so the same spinner cannot appear at two different moments
// depending on which view happens to be rendering it.
//
// Most of this rule is the CSS class `reveal-late` in app.css rather than this constant, and that is
// a decision rather than an omission. An animation delay is kept by the animation timeline, so it
// survives the synchronous ProseMirror mount that holds the main thread; a timer armed beforehand
// would not fire until the block ended, which is exactly when the note has stopped being worth
// showing. The delay also assumes nothing about how fast the machine is - a slow CPU crosses the
// threshold on a smaller document and gets its note, a fast one shows nothing at all.
//
// Not a component, for the same reason: a component would have to bring its own element, and these
// sit inside flex rows that a wrapper would disturb. The class goes on markup that already exists.

/** the threshold itself, for the escalations that genuinely need JS rather than an animation delay */
export const LATE_MS = 300;
