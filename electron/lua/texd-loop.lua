-- The warm daemon's request loop: read one block from stdin, typeset it into \box0,
-- answer with walker records -- nothing else. The engine stays alive with the preamble/
-- fonts loaded, so a keystroke costs ~1-2ms of TeX work instead of a full compile.
-- (Walking the finished box, not post_linebreak_filter, so display math is captured too.)
-- Engine dir comes from the TEXPILE_ENGINE_DIR global set in the injecting job string.
local walker = dofile((TEXPILE_ENGINE_DIR or ".") .. "/walker.lua")

local current, announced

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
	end
	-- hsize has NO invented default: the client sends it every request (falling back to
	-- the READY-announced engine \columnwidth); a TEXT frame without one is refused
	local hsize, want_glyphs, lines, badframe = nil, false, {}, nil
	while true do
		local l = readline()
		if l == nil or l == "QUIT" then
			-- nil = stdin EOF = the app died; exiting here IS the orphan protection
			-- (verified: hard-killed parent reaps the daemon in <1s). Never loop on nil.
			tex.print("\\texdrun=0")
			return
		elseif l:match("^HSIZE ") then
			hsize = l:match("^HSIZE (%S+)")
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
	tex.print("\\setbox0\\vbox\\bgroup\\hsize=" .. hsize .. "pt\\noindent\\input{_draft/texd-para.tex}\\par\\egroup\\directlua{texd_emit()}")
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
