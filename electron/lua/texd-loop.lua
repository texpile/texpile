-- The warm daemon's request loop: read one block from stdin, typeset it into \box0,
-- answer with walker records -- nothing else. The engine stays alive with the preamble/
-- fonts loaded, so a keystroke costs ~1-2ms of TeX work instead of a full compile.
-- (Walking the finished box, not post_linebreak_filter, so display math is captured too.)
-- Engine dir comes from the TEXPILE_ENGINE_DIR global set in the injecting job string.
local walker = dofile((TEXPILE_ENGINE_DIR or ".") .. "/walker.lua")

local current, announced

-- Counter determinism: LaTeX counters step GLOBALLY, so they accumulate across requests
-- (\begin{theorem} rendered 1, then 2, ...) and a repeat typeset could accidentally match
-- the page's number and certify a splice with a soon-wrong digit. Snapshot EVERY count
-- register after the preamble (no counter is known by name -- redefinitions and
-- user-defined counters included) and restore before each typeset.
local count_snap
local function snap_counts()
	count_snap = {}
	for i = 0, 65535 do count_snap[i] = tex.count[i] end
end
local function restore_counts()
	for i = 0, 65535 do
		if tex.count[i] ~= count_snap[i] then tex.count[i] = count_snap[i] end
	end
end

local function readline()
	local l = io.stdin:read("*l")
	if l then l = l:gsub("\r$", "") end
	return l
end

local function respond(s)
	io.stdout:write("\n", s, "\n")
	io.stdout:flush()
end

function texd_step()
	if not announced then
		announced = true
		-- report the REAL column width (columnwidth, halved under twocolumn -- what
		-- constrains line breaking) and textheight, plus a capability probe.
		local c = walker.capabilities()
		respond(string.format(
			'texpile-warm@@CAP {"luatex":%s,"rev":%q,"effective_glue":%s,"rangedimensions":%s,"subtypes_api":%s}',
			tostring(c.luatex), tostring(c.rev), tostring(c.effective_glue),
			tostring(c.rangedimensions), tostring(c.subtypes_api)))
		local cw = tex.dimen["columnwidth"] or tex.dimen["textwidth"] or (345 * 65536)
		local th = tex.dimen["textheight"] or (550 * 65536)
		respond(string.format("texpile-warm@@READY %.4f %.4f", cw / 65536.0, th / 65536.0))
		-- engine-truth announce: the float set THIS preamble registered (every real float
		-- carries an ftype@ csname -- \newfloat/algorithm included) and the document's
		-- live catcode table, so the renderer's lexers read the engine instead of assuming
		-- LaTeX defaults. hashtokens returns an array of names on some builds and a
		-- name-keyed map on others; pairs covers both. pcall-guarded: an engine without
		-- either API just leaves the renderer on its defaults.
		local ok_f, floats = pcall(function()
			local out = {}
			for k, v in pairs(tex.hashtokens()) do
				local nm = type(k) == "string" and k or (type(v) == "string" and v or nil)
				if nm and nm:sub(1, 6) == "ftype@" then out[#out + 1] = '"' .. nm:sub(7) .. '"' end
			end
			return out
		end)
		if ok_f and floats and #floats > 0 then respond("texpile-warm@@FLOATS [" .. table.concat(floats, ",") .. "]") end
		local ok_c, cats = pcall(function()
			local out = {}
			for c = 0, 127 do out[#out + 1] = tostring(tex.getcatcode(c)) end
			return out
		end)
		if ok_c and cats then respond("texpile-warm@@CATS [" .. table.concat(cats, ",") .. "]") end
		snap_counts()
	end
	-- hsize has NO invented default: the client sends it every request (falling back to
	-- the READY-announced engine \columnwidth); a TEXT frame without one is refused
	local hsize, want_glyphs, lines, badframe, split = nil, false, {}, nil, nil
	while true do
		local l = readline()
		if l == nil or l == "QUIT" then
			-- nil = stdin EOF = the app died; exiting here IS the orphan protection
			-- (verified: hard-killed parent reaps the daemon in <1s). Never loop on nil.
			tex.print("\\texdrun=0")
			return
		elseif l:match("^HSIZE ") then
			hsize = l:match("^HSIZE (%S+)")
		elseif l:match("^SPLIT ") then
			split = l:match("^SPLIT (%S+)")
		elseif l:match("^SKELETON ") then
			local starget, scnt, sflags = l:match("^SKELETON (%S+) (%d+)(.*)")
			texd_skeleton(tonumber(starget), tonumber(scnt), sflags and sflags:find("cap", 1, true) ~= nil)
			return
		elseif l == "GLYPHS" then
			want_glyphs = true
		elseif l:match("^TEXT ") then
			-- framed as <lineCount> <byteCount>: the payload ships LINE-FAITHFUL (the
			-- engine's catcodes decide what a newline, a blank line, or a % means -- no
			-- JS single-lining), and the byte count over the joined lines still makes a
			-- payload line equal to a protocol keyword harmless. A mismatch answers an
			-- error instead of typesetting junk.
			local nl, want = l:match("^TEXT (%d+) (%d+)")
			nl, want = tonumber(nl), tonumber(want)
			local got = 0
			for i = 1, nl or 0 do
				local t = readline()
				if t == nil then break end
				lines[i] = t
				got = got + #t + (i > 1 and 1 or 0)
			end
			if nl == nil or want == nil or #lines ~= nl or got ~= want then
				badframe = string.format("framing: want %s lines %s bytes, got %d/%d", tostring(nl), tostring(want), #lines, got)
			elseif hsize == nil then
				badframe = "framing: TEXT without HSIZE"
			end
			readline() -- the trailing END keeps the stream aligned either way
			break
		end
	end
	if badframe then
		respond(string.format('texpile-warm@@R {"ms":0,"lines":0,"glyphs":0,"error":%q}', badframe))
		return
	end
	restore_counts()
	current = { t0 = os.gettimeofday(), glyphs = want_glyphs }
	-- the block reaches TeX through a real file read, not tex.print: input-line callbacks
	-- (luatexja's CJK line-end handling under ctex) only run on file lines, and the document
	-- itself is a file -- same reader, same semantics, or the typeset drifts from the page.
	local pf = io.open("_draft/texd-para.tex", "wb")
	if not pf then
		respond('texpile-warm@@R {"ms":0,"lines":0,"glyphs":0,"error":"cannot write _draft/texd-para.tex"}')
		return
	end
	pf:write(table.concat(lines, "\n"))
	pf:close()
	-- \@nobreak is set GLOBALLY by \@startsection, so a heading in one request made the next
	-- request's heading skip its beforeskip (drawn ~15pt high). Kernel state, reset like the
	-- counters; a pinned heading's own \@nobreaktrue still applies after this.
	local build = "\\makeatletter\\global\\@nobreakfalse\\makeatother\\setbox0\\vbox\\bgroup\\hsize="
		.. hsize
		.. "pt\\noindent\\input{_draft/texd-para.tex}\\par\\egroup"
	if split then
		-- engine-decided break: \vsplit the typeset box to the column's remaining height,
		-- so vert_break with the REAL penalties (club/widow/display, the paragraph's own
		-- penalty nodes) picks the cut -- not JS pixel arithmetic. \global on both boxes:
		-- the \input's file-hook group pops at EOF and silently restores a LOCAL \setbox
		-- made after it on the same line (probed: box2 came back void). \splittopskip 0
		-- keeps the remainder unpadded so its records anchor like any fresh block;
		-- \splitmaxdepth mirrors the page builder's \maxdepth depth charge.
		tex.print(build .. "\\vbadness=10000 \\vfuzz=\\maxdimen \\splittopskip=0pt\\splitmaxdepth=\\maxdepth"
			.. "\\global\\setbox2\\vsplit0 to " .. split .. "pt\\global\\setbox0\\box0 \\directlua{texd_emit_split()}")
	else
		tex.print(build .. "\\directlua{texd_emit()}")
	end
end

-- Rebuild a page's vertical list as dimension-only nodes and let the ENGINE re-split it:
-- tex.splitbox runs the same vert_break as \vsplit and the page builder (penalties
-- included), so "did this edit move the page break" is answered by TeX, not JS
-- arithmetic. Items arrive one per line: `b h d` (box), `g w st sto sh sho` (glue,
-- natural width), `p n` (penalty); dims in pt. Answers one R with kA/kB (boxes that
-- fit / spilled), the packed A box's glue state, and every A box's baseline.
function texd_skeleton(target, cnt, cap)
	local t0 = os.gettimeofday()
	local HL, VL, GL, KN = node.id("hlist"), node.id("vlist"), node.id("glue"), node.id("kern")
	local head, tail, bad
	local function append(n)
		if tail then tail.next = n; n.prev = tail else head = n end
		tail = n
	end
	for _ = 1, cnt or 0 do
		local l = readline()
		if l == nil then bad = "eof"; break end
		local k = l:sub(1, 1)
		if k == "b" then
			local h, d = l:match("^b (%S+) (%S+)")
			local n = node.new(HL)
			n.height = math.floor((tonumber(h) or 0) * 65536)
			n.depth = math.floor((tonumber(d) or 0) * 65536)
			n.width = tex.dimen["hsize"] or 0
			append(n)
		elseif k == "g" then
			local w, st, sto, sh, sho = l:match("^g (%S+) (%S+) (%S+) (%S+) (%S+)")
			local n = node.new(GL)
			n.width = math.floor((tonumber(w) or 0) * 65536)
			n.stretch = math.floor((tonumber(st) or 0) * 65536)
			n.stretch_order = tonumber(sto) or 0
			n.shrink = math.floor((tonumber(sh) or 0) * 65536)
			n.shrink_order = tonumber(sho) or 0
			append(n)
		elseif k == "p" then
			local n = node.new("penalty")
			n.penalty = tonumber(l:match("^p (%S+)")) or 0
			append(n)
		else
			bad = "item: " .. l
		end
	end
	readline() -- END keeps the stream aligned either way
	if bad or not head then
		if head then node.flush_list(head) end
		respond(string.format('texpile-warm@@R {"skel":true,"ms":0,"error":%q}', tostring(bad or "empty")))
		return
	end
	local ok, err = pcall(function()
		-- quiet: badness complaints are meaningless for a dimension skeleton
		tex.vbadness = 10000
		tex.vfuzz = 16383 * 65536
		tex.setglue("splittopskip", 0)
		-- a CAPACITY split charges a last line's depth beyond \maxdepth against the goal,
		-- like the page builder deciding a fit; calibration and layout splits keep \vsplit's
		-- free allowance -- their targets were measured to the last BASELINE, and a charge
		-- there would refuse every column ending in a deep line the page already carries.
		-- Set both ways: the register persists across requests.
		tex.dimen.splitmaxdepth = cap and tex.dimen.maxdepth or 1073741823
		tex.box[254] = node.vpack(head)
		local a = tex.splitbox(254, math.floor(target * 65536), "exactly")
		local ys, kA = {}, 0
		if a then
			local cy = 0
			for n in node.traverse(a.head) do
				if n.id == HL or n.id == VL then
					cy = cy + n.height
					kA = kA + 1
					ys[#ys + 1] = string.format("%.4f", cy / 65536.0)
					cy = cy + n.depth
				elseif n.id == GL then
					cy = cy + (node.effective_glue(n, a) or n.width)
				elseif n.id == KN then
					cy = cy + n.kern
				end
			end
		end
		local kB = 0
		local rem = tex.box[254]
		if rem and rem.head then
			for n in node.traverse(rem.head) do
				if n.id == HL or n.id == VL then kB = kB + 1 end
			end
		end
		respond(string.format(
			'texpile-warm@@R {"skel":true,"ms":%.4f,"kA":%d,"kB":%d,"gs":%.6f,"gsn":%d,"go":%d,"ys":[%s]}',
			(os.gettimeofday() - t0) * 1000.0, kA, kB, a and a.glue_set or 0, a and a.glue_sign or 0,
			a and a.glue_order or 0, table.concat(ys, ",")))
		if a then node.flush_list(a) end
	end)
	if not ok then
		respond(string.format('texpile-warm@@R {"skel":true,"ms":0,"error":%q}', tostring(err)))
	end
end

-- both halves of a SPLIT request: box2 = what fits (the \vsplit result), box0 = the
-- remainder. Answered as one R with the A records, a GSPLIT marker, then the B records.
function texd_emit_split()
	local dt = (os.gettimeofday() - current.t0) * 1000.0
	local function walkbox(bn)
		local b = tex.box[bn]
		if not b or not b.head then return {}, { lines = 0, glyphs = 0, maxdev = 0, certified = true } end
		local ok, r, s = pcall(walker.lines, b.head)
		if not ok then return nil, r end
		return r, s
	end
	local recA, stA = walkbox(2)
	local recB, stB = walkbox(0)
	if recA and recB then
		local uncr = stA.uncertified or stB.uncertified
		local unc = uncr and string.format(',"uncertified":%q', uncr) or ''
		respond(string.format('texpile-warm@@R {"ms":%.4f,"lines":%d,"glyphs":%d,"maxdev":%.4f,"certified":%s%s}',
			dt, stA.lines + stB.lines, stA.glyphs + stB.glyphs, math.max(stA.maxdev, stB.maxdev),
			tostring(stA.certified and stB.certified), unc))
		if current.glyphs then
			for _, r in ipairs(recA) do respond("@@G " .. r) end
			respond("texpile-warm@@GSPLIT")
			for _, r in ipairs(recB) do respond("@@G " .. r) end
			respond("texpile-warm@@GEND")
		end
	else
		respond(string.format('texpile-warm@@R {"ms":%.4f,"lines":0,"glyphs":0,"error":%q}', dt, tostring(recA and stB or stA)))
	end
	current = nil
end

function texd_emit()
	local dt = (os.gettimeofday() - current.t0) * 1000.0
	local ok, records, stats = pcall(walker.lines, tex.box[0].head)
	if ok then
		local unc = stats.uncertified and string.format(',"uncertified":%q', stats.uncertified) or ''
		-- frame markers carry the app prefix so they can't be mistaken for engine/log
		-- chatter; the per-record @@G lines stay short (thousands per request) and are
		-- only read between R and GEND anyway
		respond(string.format('texpile-warm@@R {"ms":%.4f,"lines":%d,"glyphs":%d,"maxdev":%.4f,"certified":%s%s}',
			dt, stats.lines, stats.glyphs, stats.maxdev, tostring(stats.certified), unc))
		if current.glyphs then
			for _, r in ipairs(records) do respond("@@G " .. r) end
			respond("texpile-warm@@GEND")
		end
	else
		respond(string.format('texpile-warm@@R {"ms":%.4f,"lines":0,"glyphs":0,"error":%q}', dt, tostring(records)))
	end
	current = nil
end
