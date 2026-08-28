-- Turns a typeset TeX box's node list into flat JSON drawing records -- nothing else.
-- (glyphs, lines, rules, images, colors, fonts, footnote groups; coords in TeX pt.)
-- Semantics per scratch/luatex-manual: disc.replace renders mid-line, marginkern
-- advances x, font kerns scale with expansion (adjustspacing=2), box shift is
-- vertical inside a line, xoffset/yoffset displace drawing but not the advance.

local GLYPH = node.id("glyph")
local HLIST = node.id("hlist")
local VLIST = node.id("vlist")
local GLUE  = node.id("glue")
local KERN  = node.id("kern")
local RULE  = node.id("rule")
local DISC  = node.id("disc")
local MATH  = node.id("math")
local INS   = node.id("ins")
local PENALTY = node.id("penalty")
local WHATSIT = node.id("whatsit")
local ok_mk, MKERN = pcall(node.id, "margin_kern")
if not ok_mk then MKERN = -1 end
local ok_dir, DIR = pcall(node.id, "dir")
if not ok_dir then DIR = -1 end

-- Resolve subtype numbers by NAME, never hardcode them: whatsit subtype numbers
-- in particular are renumbered across LuaTeX versions, so a stock-engine build we
-- don't control could differ. Numeric fallback covers engines predating the query
-- API. Rule/glue/kern subtypes come from node.subtypes; whatsit from node.whatsits
-- (node.subtypes("whatsit") returns nil -- whatsit subtypes are registered
-- dynamically).
local function subtypeByName(kind, name, fallback)
	local ok, tbl = pcall(node.subtypes, kind)
	if ok and type(tbl) == "table" then
		for k, v in pairs(tbl) do if v == name then return k end end
	end
	return fallback
end
local function whatsitByName(name, fallback)
	if node.whatsits then
		local ok, tbl = pcall(node.whatsits)
		if ok and type(tbl) == "table" then
			for k, v in pairs(tbl) do if v == name then return k end end
		end
	end
	return fallback
end

local pt = 65536.0
local RUNNING = -1073741824 -- max_dimen sentinel; a fixed TeX constant, not an enum

-- JSON string escaping. Font names and paths are the ONLY engine-supplied strings that
-- reach a record, and both can carry characters JSON forbids raw: luaotfload sets f.name
-- to the fontspec request and QUOTES it whenever the family has a space
-- (\setmainfont{Times New Roman} -> `"name:Times New Roman:mode=harf;..."`). Interpolating
-- that with %s produced an unparseable line, and the renderer parses a page's records with
-- one JSON.parse per line -- so a single font record blanked the entire page.
local JESC = { ['"'] = '\\"', ['\\'] = '\\\\', ['\b'] = '\\b', ['\f'] = '\\f', ['\n'] = '\\n', ['\r'] = '\\r', ['\t'] = '\\t' }
local function jstr(s)
	return (tostring(s or ""):gsub('[%c"\\]', function(c) return JESC[c] or string.format('\\u%04x', c:byte()) end))
end
local FONTKERN = subtypeByName("kern", "fontkern", 0)
local RULE_IMAGE = subtypeByName("rule", "image", 2)
local HL_LINE = subtypeByName("hlist", "line", 1)
local HL_EQ = subtypeByName("hlist", "equation", 6)
local HL_EQNO = subtypeByName("hlist", "equationnumber", 7)
local LEADERS_MIN = subtypeByName("glue", "leaders", 100)
local LEADERS_MAX = subtypeByName("glue", "gleaders", 103)

-- pdf_colorstack whatsit: command 1=push (data=PDF color op string), 2=pop (data
-- empty). \textcolor pushes then pops within the same group; \color pushes with no
-- matching pop in the same block (extends to end of enclosing TeX group), so this
-- must be a real stack, not a single "current color" variable. (CS_PUSH/POP are
-- pdfTeX action codes, stable across versions.)
local COLORSTACK_SUBTYPE = whatsitByName("pdf_colorstack", 29)
local CS_PUSH, CS_POP = 1, 2

-- Uncertifying whatsit subtypes: content we deliberately do NOT live-render, so a
-- block containing any of these routes to reconcile-PDF pixels instead (see
-- ARCHITECTURE 6.1/7). pdf_literal = raw PDF drawing (tikz/pgf); setmatrix/save/
-- restore = graphics-state transforms (\rotatebox); special/late_lua = escape
-- hatches that can emit arbitrary drawing at shipout. The walker only FLAGS these;
-- routing is the caller's decision.
local W_LITERAL = whatsitByName("pdf_literal", 16)
local W_LATE_LITERAL = whatsitByName("pdf_late_literal", 17)
local W_SETMATRIX = whatsitByName("pdf_setmatrix", 30)
local W_SAVE = whatsitByName("pdf_save", 31)
local W_RESTORE = whatsitByName("pdf_restore", 32)
local W_SPECIAL = whatsitByName("special", 3)
local W_LATE_SPECIAL = whatsitByName("late_special", 4)
local W_LATE_LUA = whatsitByName("late_lua", 8)

-- per-M.lines certification flags; walk/walk_vlist set fields on this shared local,
-- M.lines resets it each call and folds it into stats. Reassignment (not mutation
-- of a captured table) so the upvalue in walk/walk_vlist tracks the new table.
local flags = {}

-- Direction lives on the BOX, not in the node list. LuaTeX gives every hlist/vlist a `dir`
-- field ("TLT" is ordinary left-to-right text) and reverses TRT material in the BACKEND, at
-- shipout, after this hook has already run. So an RTL page reaches the walker in LOGICAL
-- order while the PDF shows it visually reversed, and walk()'s left-to-right x accumulation
-- paints the line mirrored.
--
-- There is a dir NODE type as well, and the DIR branches below used to be the whole of this
-- check -- but probing a bidi=default Hebrew page finds not one dir node on it, only TRT box
-- fields, so that check never once fired and RTL has been silently uncertifiable since.
--
-- Everything but TLT is refused: TRT is right-to-left, LTL/RTT are vertical writing modes,
-- and none of the three survives a left-to-right walk. Guarded on the string type because
-- pre-1.10 LuaTeX reported dir as a number, and a number is never equal to "TLT" -- that
-- would flag every box on every page.
-- Is this box right-to-left? Also flags the modes we still cannot draw.
--
-- LuaTeX has four: TLT (ordinary), TRT (right-to-left text), and LTL/RTT, which are vertical
-- writing modes and have no meaning for a walk that only tracks a horizontal pen. Those two
-- keep uncertifying the block; TRT is drawn properly below.
--
-- Guarded on the string type because pre-1.10 LuaTeX reported dir as a number, and a number
-- equals none of these -- treating it as vertical would uncertify every box on every page.
local function dirOf(n)
	local d = n.dir
	if type(d) ~= "string" or d == "TLT" then return false end
	if d == "TRT" then return true end
	flags.dir = true
	return false
end

-- Where the pen starts inside a box, given the box's left edge. A TRT box holds its children
-- in LOGICAL order and the engine draws them from the box's RIGHT edge leftward, so the pen
-- starts at the right and runs backwards.
local function penIn(n, left, rtl)
	return rtl and (left + n.width) or left
end

-- Parse a raw PDF color-setting operator string ("1 0 0 rg 1 0 0 RG", CMYK "k/K",
-- gray "g/G") into a "#rrggbb" string. Returns nil if unparseable (caller should
-- then keep whatever color was previously on top of stack, not clobber it).
-- %x requires a true Lua integer subtype, not merely an integer-valued float
-- (Lua 5.3+ distinguishes them) -- math.floor forces the conversion.
local function byte(v) return math.floor(v * 255 + 0.5) end

local function parseColorOp(data)
	if not data or data == "" then return nil end
	local c, m, y2, k = data:match("([%d.]+)%s+([%d.]+)%s+([%d.]+)%s+([%d.]+)%s+[kK]")
	if c then
		c, m, y2, k = tonumber(c), tonumber(m), tonumber(y2), tonumber(k)
		local r = (1 - c) * (1 - k)
		local g = (1 - m) * (1 - k)
		local b = (1 - y2) * (1 - k)
		return string.format("#%02x%02x%02x", byte(r), byte(g), byte(b))
	end
	local r, g, b = data:match("([%d.]+)%s+([%d.]+)%s+([%d.]+)%s+[rR][gG]")
	if r then
		return string.format("#%02x%02x%02x", byte(tonumber(r)), byte(tonumber(g)), byte(tonumber(b)))
	end
	local gr = data:match("([%d.]+)%s+[gG]")
	if gr then
		local v = byte(tonumber(gr))
		return string.format("#%02x%02x%02x", v, v, v)
	end
	return nil
end

local function applyColorstack(n, colorStack)
	if n.command == CS_PUSH then
		local col = parseColorOp(n.data)
		colorStack[#colorStack + 1] = col or colorStack[#colorStack]
	elseif n.command == CS_POP then
		colorStack[#colorStack] = nil
	end
end

local function colSuffix(colorStack)
	local top = colorStack[#colorStack]
	if top then return ',"col":"' .. top .. '"' end
	return ""
end

-- luaotfload remaps extensible/variant-selected math glyphs (big braces,
-- large radicals, stacked delimiter parts) to synthetic codepoints in the
-- Supplementary Private Use Area-A (U+F0000-FFFFD) -- these exist ONLY in
-- luaotfload's own Lua-side font tables, never in the physical font's own
-- cmap, so a cmap-based lookup (charToGlyph in opentype.js) always misses
-- and draws nothing (the cases-environment big brace, char=984789/0xF06D5,
-- opentype.js charToGlyph -> .notdef). The font's OWN characters table still resolves it by
-- OpenType glyph index (same fixture: characters[984789].index == 2515) --
-- emit that index too so a renderer can look up by GID instead of codepoint
-- specifically for this range; every other glyph keeps the proven cmap path
-- unchanged (no regression risk on the 26 already-passing constructs).
local PUA_START = 0xF0000

-- HarfBuzz-shaped fonts need the SAME treatment for their ordinary text. luaotfload picks
-- the harf renderer automatically for complex scripts (Hebrew, Arabic, Indic), and a shaped
-- run's glyphs no longer stand for the codepoints that produced them: Arabic comes out as
-- presentation forms (U+FEDF for a medial lam), Indic conjuncts as glyphs with no Unicode at
-- all. A cmap lookup then finds the wrong glyph or none. The font's own characters table
-- still holds the true OpenType index for every one of them (probed: harf-shaped Arial gives
-- index 1020/971/941 for exactly those chars), so emit it and let the renderer look up by GID.
--
-- Deliberately scoped to harf fonts + the PUA range rather than every glyph: node-mode text
-- (all Latin, Greek, Cyrillic, CJK) resolves correctly through the cmap today, and its records
-- stay byte-identical -- 9 bytes per glyph on every page is not worth spending to re-prove a
-- path that already works.
local fontInfo = {} -- per font id; ids are unique per definition, so this never goes stale
local function infoFor(id)
	local i = fontInfo[id]
	if i == nil then
		local f = font.getfont(id)
		i = { chars = f and f.characters, harf = f ~= nil and f.hb ~= nil }
		fontInfo[id] = i
	end
	return i
end
local function glyphIndexSuffix(n)
	local i = infoFor(n.font)
	if not i.harf and n.char < PUA_START then return "" end
	local ch = i.chars and i.chars[n.char]
	if ch and ch.index then return ',"gi":' .. ch.index end
	return ""
end

-- \includegraphics wraps its image rule in several nested explicit hboxes
-- (hlist "box" subtype -- generic, ALSO used by \mbox/\fbox/etc, so subtype
-- alone can't identify an image box). The reliable signal: does this
-- subtree contain an image-type rule anywhere inside? Bounded depth since
-- graphics-inclusion nesting is shallow (verified: 6 levels for a plain
-- \includegraphics; generous headroom below).
-- Returns the image rule's INDEX when it finds one (true when the engine gave none), so the
-- record can name which image this is. The index is per distinct FILE -- probed: the same
-- file included twice carries one index, two different files carry two -- which is exactly
-- the distinction the renderer's dimension join could not make. It joined image boxes to the
-- log's inclusion lines by requested size, and two figures at identical sizes could swap.
local function containsImageRule(head, depthLeft)
	if depthLeft <= 0 then return nil end
	for n in node.traverse(head) do
		if n.id == RULE and n.subtype == RULE_IMAGE then return n.index or true end
		if n.id == HLIST or n.id == VLIST then
			local ix = containsImageRule(n.head, depthLeft - 1)
			if ix then return ix end
		end
	end
	return nil
end

-- pgf/tikz wrap their raw-PDF drawing (pdf_literal streams) in a box whose dims are
-- the picture's computed bounding box; \rotatebox likewise boxes save/setmatrix/
-- restore around the rotated material. Same signal pattern as images: does this
-- subtree contain drawing/transform whatsits? (colorstack/special excluded -- color
-- is handled live, specials don't draw in PDF mode.) Depth MUST stay shallow: probed
-- structure puts the whatsits at depth <=2 of the sized picture/rotate box, while a
-- page-structure wrapper (REVTeX's body hbox) holds them 4+ deep -- depth 8 captured
-- an entire journal page as one lit region (holdout/1905.02919 p9).
local function containsLiteral(head, depthLeft)
	if depthLeft <= 0 then return false end
	for n in node.traverse(head) do
		if n.id == WHATSIT then
			local st = n.subtype
			if st == W_LITERAL or st == W_LATE_LITERAL or st == W_SETMATRIX or st == W_SAVE or st == W_RESTORE then
				return true
			end
		end
		if n.id == HLIST or n.id == VLIST then
			if containsLiteral(n.head, depthLeft - 1) then return true end
		end
	end
	return false
end

local M = {}

-- Column identity. page-extract stamps every top-level node of the list becoming \box255
-- with the output firing that built it, so the box holding them at shipout IS a column:
-- the engine's own origin and width, where the renderer used to cluster glyph lefts and
-- synthesise the second origin as L0 + \columnwidth + \columnsep.
--
-- Only the OUTERMOST stamped box counts. A float carried into a column is itself a stamped
-- top-level node of \box255, so its own contents would otherwise read as a second column.
--
-- Dominant stamp rather than the head's: a column can hold material from more than one
-- firing (a float deferred from an earlier one), and the head is occasionally an unstamped
-- node the output routine prepended (measured: 4 of 30 columns on a float-heavy paper).
local in_column = false

local function columnStamp(head)
	if in_column or not (M.colattr and head) then return nil end
	local count, best, bestc = {}, nil, 0
	for n in node.traverse(head) do
		local a = node.has_attribute(n, M.colattr)
		if a then
			local c = (count[a] or 0) + 1
			count[a] = c
			if c > bestc then best, bestc = a, c end
		end
	end
	return best
end

-- Source identity for a typeset line: which line of which source file produced it.
--
-- The tag rides the GLYPHS, not the line box. hpack builds the line after the paragraph's
-- attribute scope has closed, so the box itself usually carries nothing (measured on a real
-- paper: 17 tagged line boxes against 1048 whose glyphs were tagged). Read the line's first
-- glyph instead, descending into nested boxes because a line can open with one (\mbox, a
-- math atom, an \includegraphics).
--
-- A line with no tagged glyph emits no source field at all: absent means UNKNOWN, never
-- guessed. That is what a float caption and a running head come back as.
local function firstGlyphSource(head, depth)
	if depth > 4 then return nil end
	for n in node.traverse(head) do
		if n.id == GLYPH then
			return node.has_attribute(n, M.srcline), node.has_attribute(n, M.srcfile)
		elseif n.id == HLIST or n.id == VLIST then
			local l, f = firstGlyphSource(n.head, depth + 1)
			if l then return l, f end
		end
	end
	return nil
end

local function sourceSuffix(head)
	if not (M.srcline and head) then return "" end
	local l, f = firstGlyphSource(head, 0)
	-- the unset sentinel comes back as a large negative rather than nil on some builds
	if not l or l < 1 then return "" end
	return string.format(',"s":%d%s', l, (f and f > 0) and (',"sf":' .. f) or "")
end

-- y is the box's BASELINE, matching every other box-like record (pl, vbox, line).
-- A zero-width column (an empty trailing column: probed on a paper ending mid-page) has no
-- horizontal extent to own records with, so it is not a column for placement purposes.
-- Returns whether it emitted, so the caller can close the run. The walk is depth-first in
-- reading order, so every record between a col and its colend is IN that column -- which is
-- more accurate than testing x against a padded window, and costs nothing: measured on a
-- float-heavy two-column paper, 1 glyph of 39,335 fell outside the column its position
-- implies, and that one is real overhang the x-window also gets wrong. Without an explicit
-- close, page furniture emitted after the last column would read as part of it.
local function emitColumn(emit, stamp, left, top, box)
	if box.width <= pt then return false end
	emit(string.format('{"t":"col","i":%d,"x":%.4f,"y":%.4f,"w":%.4f,"h":%.4f,"d":%.4f}',
		stamp, left / pt, (top + box.height) / pt, box.width / pt, box.height / pt, box.depth / pt))
	return true
end

local walk_vlist

-- resolve a rule's RUNNING (fill-to-enclosing-dimension) height/depth against
-- the enclosing line/box, which carries the real value. Mirrors the existing
-- RUNNING-width resolution pattern already used for leaders/vlist rules below.
local function resolveRuleHD(n, parent)
	local h = n.height
	if h == RUNNING then h = parent.height end
	local d = n.depth
	if d == RUNNING then d = parent.depth end
	return h, d
end

-- Find the dir node closing the run that starts at `start`, honouring nesting. nil if the list
-- ends first, which is malformed and the caller treats as undrawable rather than guessing.
local function dirClose(start)
	local depth, n = 1, start
	while n do
		if n.id == DIR then
			if tostring(n.dir or ""):sub(1, 1) == "+" then
				depth = depth + 1
			else
				depth = depth - 1
				if depth == 0 then return n end
			end
		end
		n = n.next
	end
	return nil
end

-- Walk one horizontal list; parent supplies glue_set/sign/order via effective_glue.
--
-- `x` is the PEN, not the left edge: running right-to-left it starts at the right end of the
-- material and counts down. Every branch therefore moves the pen BEFORE emitting when rtl and
-- after when not, so `x` always names the item's left edge at the moment its record is written.
-- Records stay in one left-edge coordinate space whichever direction produced them, and the
-- renderer needs to know nothing about any of this.
--
-- `stopAt` ends the walk just before that node, which is how a direction run is delimited.
--
-- LuaTeX marks direction TWO ways and a document can use either:
--
--   dir NODES -- `+TRT` ... `-TRT` bracketing material inline in an otherwise left-to-right
--   line. This is what a Hebrew phrase inside an English sentence compiles to, and it is the
--   reported case. The bracketed material sits in logical order and the engine draws it from
--   the right end of the span it occupies, so the span has to be measured before it can be
--   placed -- hence dirClose + rangedimensions below.
--
--   box dir FIELDS -- a whole hlist marked TRT, which is what a Hebrew-MAIN document produces
--   (babel sets \bodydir and no dir node appears anywhere on the page). Handled by dirOf at
--   each box the walk enters.
local function walk(head, parent, x, y, emit, fonts, last_ef, colorStack, rtl, stopAt)
	last_ef = last_ef or 0
	local n = head
	while n and n ~= stopAt do
		local id = n.id
		if id == GLYPH then
			local ef = n.expansion_factor or 0
			last_ef = ef
			local w = n.width * (1 + ef / 1000000.0)
			fonts[n.font] = true
			if rtl then x = x - w end
			emit(string.format(
				'{"t":"g","c":%d,"f":%d,"x":%.4f,"y":%.4f,"w":%.4f,"ef":%d,"xo":%.4f,"yo":%.4f%s%s}',
				n.char, n.font, x / pt, y / pt, w / pt, ef, (n.xoffset or 0) / pt, (n.yoffset or 0) / pt,
				colSuffix(colorStack), glyphIndexSuffix(n)))
			if not rtl then x = x + w end
		elseif id == KERN then
			local k = n.kern
			if n.subtype == FONTKERN then k = k * (1 + last_ef / 1000000.0) end
			x = rtl and (x - k) or (x + k)
		elseif id == GLUE then
			local eff = node.effective_glue(n, parent) or n.width
			if rtl then x = x - eff end
			if n.leader and n.leader.id == RULE and n.subtype >= LEADERS_MIN and n.subtype <= LEADERS_MAX then
				-- leaders glue (booktabs \cmidrule, colortbl \cellcolor, \hrulefill,
				-- ToC dot leaders, ...): the leader rule fills the glue's OWN
				-- effective width, not its own (often RUNNING) width.
				local h, d = resolveRuleHD(n.leader, parent)
				emit(string.format('{"t":"rule","x":%.4f,"y":%.4f,"w":%.4f,"h":%.4f,"d":%.4f%s}',
					x / pt, y / pt, eff / pt, h / pt, d / pt, colSuffix(colorStack)))
			end
			if not rtl then x = x + eff end
		elseif id == DISC then
			x, last_ef = walk(n.replace, parent, x, y, emit, fonts, last_ef, colorStack, rtl)
		elseif id == MKERN then
			x = rtl and (x - n.width) or (x + n.width)
		elseif id == RULE then
			if n.width ~= RUNNING then
				local h, d = resolveRuleHD(n, parent)
				if rtl then x = x - n.width end
				emit(string.format('{"t":"rule","x":%.4f,"y":%.4f,"w":%.4f,"h":%.4f,"d":%.4f%s}',
					x / pt, y / pt, n.width / pt, h / pt, d / pt, colSuffix(colorStack)))
				if not rtl then x = x + n.width end
			end
		elseif id == HLIST then
			if rtl then x = x - n.width end
			local yy = y + (n.shift or 0)
			-- area guard: a 0x0 picture box (tikz overlay/remember) draws outside its own
			-- bounds -- a crop of it is empty. Fall through to the normal walk (loose flag).
			local imgIndex = containsImageRule(n.head, 8)
			if n.width > pt and (n.height + n.depth) > pt and containsLiteral(n.head, 3) then
				-- raw PDF drawing (tikz/pgfplots, \rotatebox): emit the region and don't
				-- recurse -- the renderer shows it as pixels cropped from the reconcile
				-- PDF (tier-2), which covers everything inside, axis-label glyphs
				-- included. Checked BEFORE the image rule: a rotated/tikz-embedded
				-- \includegraphics must crop (correct transform), not paint unrotated.
				-- Still uncertifies the block (daemon edits route to full pass; a
				-- provisional crop from the stale PDF would be garbage).
				flags.literal = true
				emit(string.format('{"t":"lit","x":%.4f,"y":%.4f,"w":%.4f,"h":%.4f,"d":%.4f}',
					x / pt, yy / pt, n.width / pt, n.height / pt, n.depth / pt))
			elseif imgIndex ~= nil then
				-- this hlist's OWN w/h already reflect \includegraphics's
				-- requested display size (natural size lives deeper, on the
				-- inner rule -- verified empirically); no useful glyph content
				-- inside, so don't recurse. The rule carries no filename, but its
				-- index names the file: the renderer maps index N to the Nth
				-- distinct inclusion the log records.
				emit(string.format('{"t":"image","x":%.4f,"y":%.4f,"w":%.4f,"h":%.4f,"d":%.4f%s}',
					x / pt, yy / pt, n.width / pt, n.height / pt, n.depth / pt,
					type(imgIndex) == "number" and (',"ix":' .. imgIndex) or ""))
			else
				local r = dirOf(n)
				walk(n.head, n, penIn(n, x, r), yy, emit, fonts, 0, colorStack, r)
			end
			if not rtl then x = x + n.width end
		elseif id == VLIST then
			if rtl then x = x - n.width end
			dirOf(n) -- vertical writing modes still uncertify; a vlist has no pen to reverse
			-- baseline-aligned in a line: contents start at y - height; shift is vertical here
			local top = y - n.height + (n.shift or 0)
			-- how a TWO-COLUMN page reaches its columns: the output routine packs both into one
			-- hbox, so the column vlist hangs off a horizontal walk rather than a vertical one
			local cs = columnStamp(n.head)
			local opened = cs ~= nil and emitColumn(emit, cs, x, top, n)
			local wasCol = in_column
			in_column = in_column or cs ~= nil
			walk_vlist(n.head, n, x, top, emit, fonts, colorStack)
			in_column = wasCol
			if opened then emit('{"t":"colend"}') end
			if not rtl then x = x + n.width end
		elseif id == MATH then
			-- inline-math boundary: advance by \mathsurround, or (mathskip active) by
			-- the node's own glue against the parent. Zero at the default
			-- \mathsurround=0, which is why this was invisible until now.
			local w = n.surround or 0
			if w == 0 then
				local ok, eff = pcall(node.effective_glue, n, parent)
				if ok and eff then w = eff end
			end
			x = rtl and (x - w) or (x + w)
		elseif id == DIR then
			local d = tostring(n.dir or "")
			local mode = d:sub(2)
			-- only an OPENING marker starts a run; the matching close is consumed below, so a
			-- '-' reaching here is unpaired and simply advances nothing
			if d:sub(1, 1) == "+" and (mode == "TRT" or mode == "TLT") then
				local close = dirClose(n.next)
				-- rangedimensions measures [first, last) with the PARENT's glue set, i.e. the same
				-- arithmetic the engine used to break this line -- so the span is the engine's own
				-- number rather than a re-derived sum of the pieces
				local W = close and node.rangedimensions(parent, n.next, close) or nil
				if W then
					local inner = mode == "TRT"
					-- the run occupies [left, left+W] no matter which way it reads inside
					if rtl then x = x - W end
					local _, ef2 = walk(n.next, parent, inner and (x + W) or x, y, emit, fonts, last_ef, colorStack, inner, close)
					last_ef = ef2
					if not rtl then x = x + W end
					n = close -- resume after the close: the loop's own advance steps past it
				else
					flags.dir = true -- unterminated run: no span to place it in
				end
			elseif d:sub(1, 1) == "+" then
				flags.dir = true -- LTL/RTT: vertical writing, no horizontal pen to reverse
			end
		elseif id == WHATSIT then
			local st = n.subtype
			if st == COLORSTACK_SUBTYPE then applyColorstack(n, colorStack)
			elseif st == W_LITERAL or st == W_LATE_LITERAL then flags.literal = true
			elseif st == W_SETMATRIX or st == W_SAVE or st == W_RESTORE then flags.transform = true
			elseif st == W_SPECIAL or st == W_LATE_SPECIAL or st == W_LATE_LUA then flags.escape = true
			end
		end
		n = n.next
	end
	return x, last_ef
end

-- walk vertical material (fractions, radical stacks, nested vboxes);
-- y is the TOP of the content, shift displaces horizontally here
walk_vlist = function(head, parent, x, y, emit, fonts, colorStack)
	local cy = y
	for n in node.traverse(head) do
		local id = n.id
		if id == HLIST then
			cy = cy + n.height
			-- pl: each paragraph line's engine \hsize -- narrowed environments (an
			-- abstract, a quote: LaTeX lists parshape their lines) announce their true
			-- width here, so calibration variants read it instead of guessing. h/d ride
			-- along so a page skeleton (the re-split certificate) rebuilds the line as a
			-- box. Display-math lines (equation subtypes) are galley boxes the same way --
			-- without them a display reads as a gap full of stray fraction rules.
			if n.subtype == HL_LINE or n.subtype == HL_EQ or n.subtype == HL_EQNO then
				emit(string.format('{"t":"pl","x":%.4f,"y":%.4f,"w":%.4f,"h":%.4f,"d":%.4f%s}',
					(x + (n.shift or 0)) / pt, cy / pt, n.width / pt, n.height / pt, n.depth / pt,
					sourceSuffix(n.head)))
			end
			-- drawing box sitting directly in vertical material (\vbox{\hbox{tikz}}).
			-- Paragraph LINES are exempt: walk() captures just the inner drawing box,
			-- so an inline picture doesn't turn the whole line into pixels.
			if n.subtype ~= HL_LINE and n.width > pt and (n.height + n.depth) > pt and containsLiteral(n.head, 3) then
				flags.literal = true
				emit(string.format('{"t":"lit","x":%.4f,"y":%.4f,"w":%.4f,"h":%.4f,"d":%.4f}',
					(x + (n.shift or 0)) / pt, cy / pt, n.width / pt, n.height / pt, n.depth / pt))
			else
				local left = x + (n.shift or 0)
				local r = dirOf(n)
				walk(n.head, n, penIn(n, left, r), cy, emit, fonts, 0, colorStack, r)
			end
			cy = cy + n.depth
		elseif id == VLIST then
			dirOf(n)
			-- how a ONE-COLUMN page reaches its column: straight down the page's vertical list.
			-- Emitted alongside the vbox marker below, never instead of it: the skeleton still
			-- needs to see this box as the container holding ALL of the column's lines.
			local cs = columnStamp(n.head)
			local opened = cs ~= nil and emitColumn(emit, cs, x + (n.shift or 0), cy, n)
			-- vbox: vertical material grouped into its own box (a float, a vmode \parbox).
			-- Its inner paragraph lines emit pl records indistinguishable from galley text,
			-- so the page skeleton needs this marker to know that run is not flowing content
			-- it may re-break. (The page's own container box carries one too; the skeleton
			-- tells them apart by whether the box holds only PART of the column.)
			if n.width > pt and (n.height + n.depth) > pt then
				emit(string.format('{"t":"vbox","x":%.4f,"y":%.4f,"w":%.4f,"h":%.4f,"d":%.4f}',
					(x + (n.shift or 0)) / pt, (cy + n.height) / pt, n.width / pt, n.height / pt, n.depth / pt))
			end
			local wasCol = in_column
			in_column = in_column or cs ~= nil
			walk_vlist(n.head, n, x + (n.shift or 0), cy, emit, fonts, colorStack)
			in_column = wasCol
			if opened then emit('{"t":"colend"}') end
			cy = cy + n.height + n.depth
		elseif id == GLUE then
			local eff = node.effective_glue(n, parent) or n.width
			if n.leader and n.leader.id == RULE and n.subtype >= LEADERS_MIN and n.subtype <= LEADERS_MAX then
				local h, d = resolveRuleHD(n.leader, parent)
				-- parent can be an ins node (no width field) when walking a footnote body
				emit(string.format('{"t":"rule","x":%.4f,"y":%.4f,"w":%.4f,"h":%.4f,"d":%.4f%s}',
					x / pt, (cy + h) / pt, (parent.width or 0) / pt, h / pt, d / pt, colSuffix(colorStack)))
			end
			-- EVERY vertical glue, rigid included. The stretchables say where the engine would
			-- absorb a height change (vpack distributes linearly over them); the rigid ones --
			-- \baselineskip above all -- are what a page skeleton would otherwise DERIVE by
			-- subtracting the stretchables from the observed gap, which was the one invented
			-- number inside the break certificate. nw = the NATURAL width (w is the effective,
			-- post-stretch value): the skeleton rebuilds each glue at its natural size and lets
			-- the engine re-stretch it.
			emit(string.format('{"t":"vg","x":%.4f,"y":%.4f,"w":%.4f,"nw":%.4f,"st":%.4f,"sto":%d,"sh":%.4f,"sho":%d}',
				x / pt, cy / pt, eff / pt, (n.width or 0) / pt, (n.stretch or 0) / pt, n.stretch_order or 0, (n.shrink or 0) / pt, n.shrink_order or 0))
			cy = cy + eff
		elseif id == PENALTY then
			-- pen: vertical break penalties (interline, club/widow, section \nobreak) --
			-- invisible ink, but the page skeleton needs them to re-ask the engine where
			-- a page breaks after an edit
			emit(string.format('{"t":"pen","y":%.4f,"p":%d}', cy / pt, n.penalty or 0))
		elseif id == KERN then
			-- vk: an interline kern carries real height the skeleton has to place, exactly
			-- like a rigid glue; carries no x, so consumers take it positionally (like pen)
			if (n.kern or 0) ~= 0 then emit(string.format('{"t":"vk","y":%.4f,"w":%.4f}', cy / pt, n.kern / pt)) end
			cy = cy + n.kern
		elseif id == RULE then
			local w, h, d = n.width, resolveRuleHD(n, parent)
			if w == RUNNING then w = parent.width or 0 end
			emit(string.format('{"t":"rule","x":%.4f,"y":%.4f,"w":%.4f,"h":%.4f,"d":%.4f%s}',
				x / pt, (cy + h) / pt, w / pt, h / pt, d / pt, colSuffix(colorStack)))
			cy = cy + h + d
		elseif id == DIR then
			flags.dir = true
		elseif id == WHATSIT then
			local st = n.subtype
			if st == COLORSTACK_SUBTYPE then applyColorstack(n, colorStack)
			elseif st == W_LITERAL or st == W_LATE_LITERAL then flags.literal = true
			elseif st == W_SETMATRIX or st == W_SAVE or st == W_RESTORE then flags.transform = true
			elseif st == W_SPECIAL or st == W_LATE_SPECIAL or st == W_LATE_LUA then flags.escape = true
			end
		end
	end
	return cy
end

-- Walk a post_linebreak head list (lines + interline glue + penalties), OR a
-- whole finished box's top-level list (which may also contain top-level
-- VLISTs -- e.g. an [H]-forced float's own \vbox -- not just paragraph
-- HLIST lines; confirmed via probe: without this branch, floats/figures
-- silently produce zero output). Returns records (array of JSON strings),
-- stats { lines, glyphs, maxdev }.
function M.lines(head, y0)
	local records, fonts = {}, {}
	flags = {} -- reset certification flags for this walk
	in_column = false
	local nglyphs = 0
	local function emit(s)
		records[#records + 1] = s
		if s:find('"t":"g"', 1, true) then nglyphs = nglyphs + 1 end
	end
	local colorStack = {}
	local lineno, y, maxdev = 0, y0 or 0, 0
	for line in node.traverse(head) do
		if line.id == HLIST then
			lineno = lineno + 1
			y = y + line.height
			-- a degenerate/empty top-level line (e.g. article.cls's \@maketitle,
			-- which starts \newpage\null -- confirmed via probe) can have a nil
			-- head; node.rangedimensions rejects nil outright and would abort
			-- the whole compile.
			local rdw = line.head and node.rangedimensions(line, line.head) or 0
			emit(string.format(
				'{"t":"line","n":%d,"y":%.4f,"w":%.4f,"h":%.4f,"d":%.4f,"gset":%.5f,"gsign":%d,"gord":%d,"rdw":%.4f}',
				lineno, y / pt, line.width / pt, line.height / pt, line.depth / pt,
				line.glue_set, line.glue_sign, line.glue_order, rdw / pt))
			-- display math lines arrive centered via shift
			local x0 = line.shift or 0
			-- a WHOLLY right-to-left line (a Hebrew-main document, not just a run inside an
			-- English one): the pen starts at the line's right edge and should finish at its
			-- left, so the target the deviation is measured against flips with it
			local lineRtl = dirOf(line)
			local pen0 = penIn(line, x0, lineRtl)
			local endx = line.head and walk(line.head, line, pen0, y, emit, fonts, 0, colorStack, lineRtl) or pen0
			local dev = math.abs(endx - (lineRtl and x0 or (x0 + line.width))) / pt
			-- gsign==0 (no stretch/shrink applied) means TeX never tried to fill
			-- this line to the box width -- headings, ragged text, a short final
			-- line. "Falls short of target" is then EXPECTED, not a walker bug;
			-- only count dev toward maxdev when TeX itself attempted justification.
			if line.glue_sign ~= 0 and dev > maxdev then maxdev = dev end
			-- how much width the walk accounted for; the pen runs backwards in an RTL line, so
			-- take the distance travelled rather than the signed difference
			emit(string.format('{"t":"endx","n":%d,"x":%.4f,"target":%.4f,"dev":%.4f,"justified":%s}',
				lineno, math.abs(endx - pen0) / pt, line.width / pt, dev, tostring(line.glue_sign ~= 0)))
			y = y + line.depth
		elseif line.id == VLIST then
			dirOf(line)
			-- e.g. an [H]-forced float's own \vbox sitting directly in the
			-- block's top-level list (not nested inside a paragraph line).
			local cs = columnStamp(line.head)
			local opened = cs ~= nil and emitColumn(emit, cs, line.shift or 0, y, line)
			local wasCol = in_column
			in_column = in_column or cs ~= nil
			walk_vlist(line.head, line, line.shift or 0, y, emit, fonts, colorStack)
			in_column = wasCol
			if opened then emit('{"t":"colend"}') end
			y = y + line.height + line.depth
		elseif line.id == INS then
			-- footnote body: \insert material migrated out of the paragraph into this list.
			-- Emitted as a note group with n-prefixed record types and LOCAL y from 0, so
			-- the body rows never pollute the block's own line/glyph records (every locate
			-- tier filters t=="g"/"line"). Inserts occupy no space here -> y unchanged.
			emit(string.format('{"t":"note","cls":%d,"h":%.4f}', line.subtype or 0, (line.height or 0) / pt))
			if line.head then
				local nemit = function(s) emit((s:gsub('^{"t":"', '{"t":"n'))) end
				walk_vlist(line.head, line, 0, 0, nemit, fonts, colorStack)
			end
			emit('{"t":"noteend"}')
		elseif line.id == GLUE then
			emit(string.format('{"t":"vg","x":0,"y":%.4f,"w":%.4f,"nw":%.4f,"st":%.4f,"sto":%d,"sh":%.4f,"sho":%d}',
				y / pt, line.width / pt, (line.width or 0) / pt, (line.stretch or 0) / pt, line.stretch_order or 0, (line.shrink or 0) / pt, line.shrink_order or 0))
			y = y + line.width
		elseif line.id == PENALTY then
			emit(string.format('{"t":"pen","y":%.4f,"p":%d}', y / pt, line.penalty or 0))
		elseif line.id == DIR then
			flags.dir = true
		end
	end
	for id in pairs(fonts) do
		-- getfont only knows Lua-defined fonts; format/TeX-loaded ones (classic math:
		-- cmex10 and friends -- where \int lives) need getcopy, which reads them all.
		-- Without this their glyph records had no font record and silently drew nothing.
		local f = font.getfont(id) or (font.getcopy and font.getcopy(id))
		if f then
			-- "harfloaded:" prefixes filename whenever luaotfload shaped through HarfBuzz. It is a
			-- loader tag, not part of the path: passing it through made the renderer fetch a file
			-- that cannot exist, so every glyph of a Hebrew/Arabic/Indic page silently drew nothing.
			local file = tostring(f.filename or ""):gsub("\\", "/"):gsub("^harfloaded:", "")
			-- subfont: which face of a TrueType Collection (.ttc) this is; the renderer
			-- must extract that face before parsing (opentype.js can't read collections)
			local coll = file:lower():match("%.ttc$") or file:lower():match("%.otc$")
			local sub = (coll and type(f.subfont) == "number" and f.subfont >= 1)
				and string.format(',"sub":%d', f.subfont) or ""
			records[#records + 1] = string.format('{"t":"font","id":%d,"size":%.4f,"name":"%s","file":"%s"%s}',
				id, (f.size or 0) / pt, jstr(f.name or f.fullname or ""), jstr(file), sub)
		end
	end
	-- certification: a block is live-renderable only if it contains no feature we
	-- route to reconcile pixels (raw PDF drawing, transforms, escape hatches, RTL).
	-- The caller uses `uncertified` (a reason string, or nil) to decide routing.
	local reasons = {}
	if flags.literal then reasons[#reasons + 1] = "literal" end
	if flags.transform then reasons[#reasons + 1] = "transform" end
	if flags.escape then reasons[#reasons + 1] = "escape" end
	if flags.dir then reasons[#reasons + 1] = "dir" end
	local uncertified = #reasons > 0 and table.concat(reasons, ",") or nil
	return records, {
		lines = lineno, glyphs = nglyphs, maxdev = maxdev, yend = y / pt,
		certified = uncertified == nil, uncertified = uncertified,
	}
end

-- Warm-up capability probe (ARCHITECTURE 9): the daemon reports this so the app can
-- decide whether live preview is possible on the user's stock engine, and surface
-- the version. resolved subtype numbers are included so a mismatch is diagnosable.
function M.capabilities()
	local subtypes_ok = pcall(node.subtypes, "rule") and node.whatsits ~= nil
	return {
		luatex = status and status.luatex_version, rev = status and status.luatex_revision,
		effective_glue = node.effective_glue ~= nil,
		rangedimensions = node.rangedimensions ~= nil,
		subtypes_api = subtypes_ok,
		colorstack = COLORSTACK_SUBTYPE, rule_image = RULE_IMAGE, fontkern = FONTKERN,
		leaders = LEADERS_MIN .. "-" .. LEADERS_MAX,
	}
end

return M
