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
local FONTKERN = subtypeByName("kern", "fontkern", 0)
local RULE_IMAGE = subtypeByName("rule", "image", 2)
local HL_LINE = subtypeByName("hlist", "line", 1)
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
local function glyphIndexSuffix(n)
	if n.char < PUA_START then return "" end
	local f = font.getfont(n.font)
	local ch = f and f.characters and f.characters[n.char]
	if ch and ch.index then return ',"gi":' .. ch.index end
	return ""
end

-- \includegraphics wraps its image rule in several nested explicit hboxes
-- (hlist "box" subtype -- generic, ALSO used by \mbox/\fbox/etc, so subtype
-- alone can't identify an image box). The reliable signal: does this
-- subtree contain an image-type rule anywhere inside? Bounded depth since
-- graphics-inclusion nesting is shallow (verified: 6 levels for a plain
-- \includegraphics; generous headroom below).
local function containsImageRule(head, depthLeft)
	if depthLeft <= 0 then return false end
	for n in node.traverse(head) do
		if n.id == RULE and n.subtype == RULE_IMAGE then return true end
		if n.id == HLIST or n.id == VLIST then
			if containsImageRule(n.head, depthLeft - 1) then return true end
		end
	end
	return false
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

-- walk one horizontal list; parent supplies glue_set/sign/order via effective_glue
local function walk(head, parent, x, y, emit, fonts, last_ef, colorStack)
	last_ef = last_ef or 0
	for n in node.traverse(head) do
		local id = n.id
		if id == GLYPH then
			local ef = n.expansion_factor or 0
			last_ef = ef
			local w = n.width * (1 + ef / 1000000.0)
			fonts[n.font] = true
			emit(string.format(
				'{"t":"g","c":%d,"f":%d,"x":%.4f,"y":%.4f,"w":%.4f,"ef":%d,"xo":%.4f,"yo":%.4f%s%s}',
				n.char, n.font, x / pt, y / pt, w / pt, ef, (n.xoffset or 0) / pt, (n.yoffset or 0) / pt,
				colSuffix(colorStack), glyphIndexSuffix(n)))
			x = x + w
		elseif id == KERN then
			local k = n.kern
			if n.subtype == FONTKERN then k = k * (1 + last_ef / 1000000.0) end
			x = x + k
		elseif id == GLUE then
			local eff = node.effective_glue(n, parent) or n.width
			if n.leader and n.leader.id == RULE and n.subtype >= LEADERS_MIN and n.subtype <= LEADERS_MAX then
				-- leaders glue (booktabs \cmidrule, colortbl \cellcolor, \hrulefill,
				-- ToC dot leaders, ...): the leader rule fills the glue's OWN
				-- effective width, not its own (often RUNNING) width.
				local h, d = resolveRuleHD(n.leader, parent)
				emit(string.format('{"t":"rule","x":%.4f,"y":%.4f,"w":%.4f,"h":%.4f,"d":%.4f%s}',
					x / pt, y / pt, eff / pt, h / pt, d / pt, colSuffix(colorStack)))
			end
			x = x + eff
		elseif id == DISC then
			x, last_ef = walk(n.replace, parent, x, y, emit, fonts, last_ef, colorStack)
		elseif id == MKERN then
			x = x + n.width
		elseif id == RULE then
			if n.width ~= RUNNING then
				local h, d = resolveRuleHD(n, parent)
				emit(string.format('{"t":"rule","x":%.4f,"y":%.4f,"w":%.4f,"h":%.4f,"d":%.4f%s}',
					x / pt, y / pt, n.width / pt, h / pt, d / pt, colSuffix(colorStack)))
				x = x + n.width
			end
		elseif id == HLIST then
			local yy = y + (n.shift or 0)
			-- area guard: a 0x0 picture box (tikz overlay/remember) draws outside its own
			-- bounds -- a crop of it is empty. Fall through to the normal walk (loose flag).
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
			elseif containsImageRule(n.head, 8) then
				-- this hlist's OWN w/h already reflect \includegraphics's
				-- requested display size (natural size lives deeper, on the
				-- inner rule -- verified empirically); no useful glyph content
				-- inside, so don't recurse. Filename resolution happens at the
				-- JS layer (regex over the known block source), not here --
				-- rule nodes carry no filename field.
				emit(string.format('{"t":"image","x":%.4f,"y":%.4f,"w":%.4f,"h":%.4f,"d":%.4f}',
					x / pt, yy / pt, n.width / pt, n.height / pt, n.depth / pt))
			else
				walk(n.head, n, x, yy, emit, fonts, 0, colorStack)
			end
			x = x + n.width
		elseif id == VLIST then
			-- baseline-aligned in a line: contents start at y - height; shift is vertical here
			walk_vlist(n.head, n, x, y - n.height + (n.shift or 0), emit, fonts, colorStack)
			x = x + n.width
		elseif id == MATH then
			-- inline-math boundary: advance by \mathsurround, or (mathskip active) by
			-- the node's own glue against the parent. Zero at the default
			-- \mathsurround=0, which is why this was invisible until now.
			local w = n.surround or 0
			if w == 0 then
				local ok, eff = pcall(node.effective_glue, n, parent)
				if ok and eff then w = eff end
			end
			x = x + w
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
			-- drawing box sitting directly in vertical material (\vbox{\hbox{tikz}}).
			-- Paragraph LINES are exempt: walk() captures just the inner drawing box,
			-- so an inline picture doesn't turn the whole line into pixels.
			if n.subtype ~= HL_LINE and n.width > pt and (n.height + n.depth) > pt and containsLiteral(n.head, 3) then
				flags.literal = true
				emit(string.format('{"t":"lit","x":%.4f,"y":%.4f,"w":%.4f,"h":%.4f,"d":%.4f}',
					(x + (n.shift or 0)) / pt, cy / pt, n.width / pt, n.height / pt, n.depth / pt))
			else
				walk(n.head, n, x + (n.shift or 0), cy, emit, fonts, 0, colorStack)
			end
			cy = cy + n.depth
		elseif id == VLIST then
			walk_vlist(n.head, n, x + (n.shift or 0), cy, emit, fonts, colorStack)
			cy = cy + n.height + n.depth
		elseif id == GLUE then
			local eff = node.effective_glue(n, parent) or n.width
			if n.leader and n.leader.id == RULE and n.subtype >= LEADERS_MIN and n.subtype <= LEADERS_MAX then
				local h, d = resolveRuleHD(n.leader, parent)
				-- parent can be an ins node (no width field) when walking a footnote body
				emit(string.format('{"t":"rule","x":%.4f,"y":%.4f,"w":%.4f,"h":%.4f,"d":%.4f%s}',
					x / pt, (cy + h) / pt, (parent.width or 0) / pt, h / pt, d / pt, colSuffix(colorStack)))
			end
			cy = cy + eff
		elseif id == KERN then
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
			local endx = line.head and walk(line.head, line, x0, y, emit, fonts, 0, colorStack) or x0
			local dev = math.abs(endx - x0 - line.width) / pt
			-- gsign==0 (no stretch/shrink applied) means TeX never tried to fill
			-- this line to the box width -- headings, ragged text, a short final
			-- line. "Falls short of target" is then EXPECTED, not a walker bug;
			-- only count dev toward maxdev when TeX itself attempted justification.
			if line.glue_sign ~= 0 and dev > maxdev then maxdev = dev end
			emit(string.format('{"t":"endx","n":%d,"x":%.4f,"target":%.4f,"dev":%.4f,"justified":%s}',
				lineno, (endx - x0) / pt, line.width / pt, dev, tostring(line.glue_sign ~= 0)))
			y = y + line.depth
		elseif line.id == VLIST then
			-- e.g. an [H]-forced float's own \vbox sitting directly in the
			-- block's top-level list (not nested inside a paragraph line).
			walk_vlist(line.head, line, line.shift or 0, y, emit, fonts, colorStack)
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
			y = y + line.width
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
			local file = tostring(f.filename or ""):gsub("\\", "/")
			-- subfont: which face of a TrueType Collection (.ttc) this is; the renderer
			-- must extract that face before parsing (opentype.js can't read collections)
			local coll = file:lower():match("%.ttc$") or file:lower():match("%.otc$")
			local sub = (coll and type(f.subfont) == "number" and f.subfont >= 1)
				and string.format(',"sub":%d', f.subfont) or ""
			records[#records + 1] = string.format('{"t":"font","id":%d,"size":%.4f,"name":"%s","file":"%s"%s}',
				id, (f.size or 0) / pt, tostring(f.name or f.fullname or ""), file, sub)
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
