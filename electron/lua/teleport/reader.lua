-- Every file TeX reads goes through here. Source files (the project's own .tex under the compile root, outside
-- _draft) keep a stack, so a point names its place as a chain of file and line, outer to inner.
return function(T)
	local OPENS = { "input", "include", "subfile", "import", "subimport", "includefrom", "inputfrom", "subincludefrom", "subinputfrom" }
	T.stack = {}
	-- the project's files read before the base: a warm process is only as current as these
	T.pre_files = {}
	local pre_seen = {}

	local function rel_of(name)
		local n = name:gsub("\\", "/")
		local cwd = ((lfs.currentdir() or ""):gsub("\\", "/")) .. "/"
		if n:sub(1, #cwd):lower() == cwd:lower() then n = n:sub(#cwd + 1) end
		n = n:gsub("^%./", "")
		return n
	end
	local function is_source(rel)
		if rel:match("^/") or rel:match("^%a:") or rel:match("^_draft/") or rel:match("^%.%./") then return false end
		local ext = rel:match("%.([%w]+)$")
		return ext == nil or ext == "tex" or ext == "ltx"
	end

	local function opens_file(line)
		local code = line:gsub("\\%%", ""):match("^[^%%]*") or ""
		for _, w in ipairs(OPENS) do
			if code:find("\\" .. w .. "%f[^%a@]") then return true end
		end
		return false
	end

	-- the stack as a key: every level a source file, the innermost at the line about to be read
	function T.stack_now(next_line)
		local st = {}
		for i, r in ipairs(T.stack) do
			if not r.source then return nil end
			st[i] = { f = r.rel, l = i == #T.stack and next_line or r.pos }
		end
		return st
	end
	function T.key_of(st)
		local parts = {}
		for i, e in ipairs(st) do parts[i] = e.f .. ":" .. e.l end
		return table.concat(parts, ">")
	end

	local function lines_of(path)
		local f = io.open(path, "rb")
		if not f then return nil end
		local lines = {}
		for l in f:lines() do lines[#lines + 1] = (l:gsub("\r$", "")) end
		f:close()
		return lines
	end

	-- every source file as TeX read it, for the edits that come later to be measured against; a served run writes
	-- its own folder, since the index still reads what earlier runs wrote
	local snapped = {}
	function T.reset_snapshots() snapped = {} end
	local function snapshot(rel, lines)
		if snapped[rel] or not T.snapshot_dir then return end
		snapped[rel] = true
		local dir = T.snapshot_dir
		for part in rel:gmatch("([^/]+)/") do
			dir = dir .. part .. "/"
			lfs.mkdir(dir:sub(1, -2))
		end
		local f = io.open(T.snapshot_dir .. rel, "wb")
		if f then
			-- each line ends: a joined list would lose an empty last line every time it is read back
			for _, l in ipairs(lines) do f:write(l, "\n") end
			f:close()
		end
	end

	-- what a line can change that the reset does not put back: hyphenation exceptions, font parameters, Lua state
	local LASTING = { "hyphenation", "patterns", "fontdimen", "hyphenchar", "skewchar", "directlua", "luaexec", "luadirect", "luacode" }
	local function lasting(line)
		local code = line:gsub("\\%%", ""):match("^[^%%]*") or ""
		for _, w in ipairs(LASTING) do
			if code:find("\\" .. w, 1, true) or (w == "luacode" and code:find("{luacode", 1, true)) then return "the body uses \\" .. w end
		end
		return nil
	end

	local function source_reader(name, rel)
		local lines = lines_of(T.overrides[rel] or name)
		if not lines then return nil end
		snapshot(rel, lines)
		local r = { rel = rel, path = name, source = true, pos = 0, injected = {}, lines = lines }
		local entry = T.entries[rel]
		if entry then T.entries[rel] = nil end
		function r.reader()
			if r.drain then return nil end
			-- past \end{document} a served run parks; a file still open there ends
			if T.ended then
				if r ~= T.stack[1] then return nil end
				if T.ended == true then
					T.ended = "parking"
					return "\\directlua{texpile_tele_park()}%"
				end
			end
			T.poll_cut()
			if r.jump then
				r.pos = r.jump - 1
				r.jump = nil
			end
			local nextl = r.pos + 1
			T.reading = r
			if not r.opened then
				r.opened = true
				-- a nested file's records also carry whatever already differed from the base when it opened: a
				-- teleport enters the file in that state
				-- a teleport entering the file takes these from the record it applies there
				if T.base and #T.stack > 1 and T.stack[#T.stack] == r and T.stack_now(1) and not entry then
					tex.inputlineno = 0
					return "\\directlua{texpile_tele_opened()}%"
				end
			end
			if entry then
				-- a nested teleport enters here: the record of this line goes in before it is read
				local e = entry
				entry = nil
				r.pos = e.line - 1
				nextl = e.line
				r.injected[nextl] = true
				tex.inputlineno = nextl - 1
				return "\\directlua{texpile_tele_enter(" .. e.k .. ")}%"
			end
			if T.want_base and #T.stack == 1 then
				T.want_base = false
				tex.inputlineno = nextl - 1
				return "\\directlua{texpile_tele_base()}%"
			end
			if T.base and not r.injected[nextl] then
				local l = r.lines[nextl]
				local opening = l ~= nil and opens_file(l)
				local staged = T.stage and r.rel == T.stage.f and nextl == T.stage.l
				if T.want_point or opening or staged or (T.stops and T.stops[T.key_of(T.stack_now(nextl) or {})]) then
					r.injected[nextl] = true
					tex.inputlineno = nextl - 1
					return "\\directlua{texpile_tele_point(" .. nextl .. "," .. (opening and "true" or "false") .. ")}%"
				end
			end
			local l = r.lines[nextl]
			-- a run whose result is out has no use for \end{document}, whose hooks can write to the PDF (pgf's
			-- resources): it ends its paragraph and parks there if it can
			if T.cutting and r == T.stack[1] and not r.end_tried and l and (l:match("^[^%%]*") or ""):find("\\end%s*{document}") then
				r.end_tried = true
				tex.inputlineno = nextl - 1
				return "\\par\\directlua{texpile_tele_settle_end()}%"
			end
			r.pos = nextl
			if l == nil then return nil end
			tex.inputlineno = nextl
			if T.serving and not T.no_park and l:find("\\", 1, true) then T.no_park = lasting(l) end
			return l
		end
		function r.close()
			for i = #T.stack, 1, -1 do
				if T.stack[i] == r then
					table.remove(T.stack, i)
					break
				end
			end
		end
		return r
	end

	-- a plan's text for a file already open (the main file opens before the plan arrives)
	function T.reload(rel)
		for _, r in ipairs(T.stack) do
			if r.source and r.rel == rel then
				local lines = lines_of(T.overrides[rel])
				if lines then
					r.lines = lines
					snapped[rel] = nil
					snapshot(rel, lines)
				end
			end
		end
	end

	-- a spare read the body when it started: a compile on it reads what disk holds now
	function T.reload_disk()
		for _, r in ipairs(T.stack) do
			local lines = r.source and lines_of(r.path)
			if lines then
				r.lines = lines
				snapped[r.rel] = nil
				snapshot(r.rel, lines)
			end
		end
	end

	local function plain_reader(name)
		local fh = io.open(name, "rb")
		if not fh then return nil end
		local r = { source = false }
		function r.reader()
			local l = fh:read("*l")
			if l then l = l:gsub("\r$", "") end
			return l
		end
		function r.close()
			fh:close()
			for i = #T.stack, 1, -1 do
				if T.stack[i] == r then
					table.remove(T.stack, i)
					break
				end
			end
		end
		return r
	end

	-- the seed files (the .toc, the .bbl) as the engine got them: a served run rewrites some (\tableofcontents opens
	-- the .toc for writing), and the next run reads what it was given
	local DRAFT = (TEXPILE_DRAFT_OUT or "") .. "/"
	local function seed_of(rel)
		local leaf = rel:sub(1, #DRAFT) == DRAFT and rel:sub(#DRAFT + 1)
		if not leaf or leaf:find("/", 1, true) then return nil end
		local copy = T.seed_dir .. leaf
		return lfs.attributes(copy, "mode") == "file" and copy or nil
	end

	-- the stream the next file opens on: 0 for \input, n + 1 for \openin n. A file opened for \read is never on the
	-- input stack, and graphics leaves each image's check open until its stream opens the next
	local stream = 0
	luatexbase.add_to_callback("find_read_file", function(id, name)
		stream = id
		return kpse.find_file(name, "tex", true)
	end, "texpile.tele.find")

	luatexbase.add_to_callback("open_read_file", function(name)
		local input = stream == 0
		stream = 0
		local rel = rel_of(name)
		if T.base then name = seed_of(rel) or name end
		if not T.base and not pre_seen[rel] and not rel:match("^/") and not rel:match("^%a:") and not rel:match("^_draft/") then
			pre_seen[rel] = true
			T.pre_files[#T.pre_files + 1] = rel
		end
		local r = is_source(rel) and source_reader(name, rel) or plain_reader(name)
		if not r then return nil end
		if T.base and r.source then T.entered(rel) end
		if input then T.stack[#T.stack + 1] = r end
		return { reader = r.reader, close = r.close }
	end, "texpile.tele.reader")
end
