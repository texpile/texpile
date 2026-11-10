-- A plan going in, and a served run winding down to the main file, where the process parks at its base again.
return function(T)
	-- inside a file, the run ends that file early; in the main file the process parks
	function T.settle()
		if #T.stack == 1 then T.park() else T.stack[#T.stack].drain = true end
	end

	-- a process serves this many teleports, then exits and a fresh one takes its place
	local MAX_SERVES = 40

	-- back at the base, verified, waiting for the next command
	function T.park()
		local b = T.base
		local why = T.no_park or (T.wrote_objects() and "the run wrote PDF objects") or (T.serves >= MAX_SERVES and "served " .. T.serves)
			or (not T.images_like_compile() and "an image is not at the compile's object")
			or (#T.stack ~= 1 and "inside a file")
			or ((tex.nest.ptr ~= 0 or tex.currentgrouplevel ~= b.level or tex.currentiflevel ~= b.iflevel) and "not at a clean point")
		if why then
			T.say("UNPARKED " .. why)
			os.exit(0)
		end
		T.wind_down()
		T.applying = true
		T.reset(function(ok, err)
			if not ok then
				T.say("UNPARKED " .. err)
				os.exit(0)
			end
			T.rearm()
			T.say("PARKED")
			texpile_tele_next()
		end)
	end

	function T.rearm()
		T.serving, TEXPILE_TELE_SERVING = false, false
		T.overrides, T.entries = {}, {}
		T.stops, T.stage, T.chain, T.files, T.selfcheck, T.report_from = nil, nil, nil, nil, nil, nil
		T.stop_after_page, T.stop_dumped, T.cutting, T.silent, T.ended, T.no_park, T.cut_path = nil, nil, nil, nil, nil, nil, nil
		T.staging = nil
		T.selected = {}
		T.rearm_writes()
		T.at_base = true
		T.want_point = TEXPILE_TELE_DENSE or false
		T.snapshot_dir = T.OUT .. "src/"
		T.restart_clock()
		T.close_index()
		local main = T.stack[1]
		main.lines, main.injected, main.jump, main.drain, main.end_tried = T.base_lines, {}, T.base_line, nil, nil
		T.reading = main
	end

	function texpile_tele_settle_end()
		local b = T.base
		if tex.nest.ptr == 0 and tex.currentgrouplevel == b.level and tex.currentiflevel == b.iflevel and #T.stack == 1 then T.park() end
	end

	-- the end of the document with its pages out: \@@end would end the process, and the group is the one \end closes
	-- after \enddocument
	function texpile_tele_end()
		if not T.serving then return end
		if not T.silent then T.say("END") end
		T.wind_down()
		T.ended = true
		tex.sprint({ token.create("global"), token.create("let"), token.create("@@end"), token.create("relax"), token.create("begingroup") })
	end
	-- pgf writes the objects it reserved before the base at the end of the document, and a process writes one once; a
	-- served run's PDF is thrown away, so it keeps only the \clearpage pgf puts before them
	function texpile_tele_bye()
		if not (T.serving and token.is_defined("pgfutil@everybye")) or tex.gettoks("pgfutil@everybye") == "" then return end
		tex.sprint({ token.create("global"), token.create("pgfutil@everybye"), token.create(123, 1), token.create("relax"), token.create(125, 2) })
	end
	-- what the main file reads after \end{document}: the .aux \enddocument closed opens again, as at the base
	function texpile_tele_park()
		tex.sprint({ token.create("if@filesw"), token.create("immediate"), token.create("openout"), token.create("@mainaux"), token.create("jobname") })
		tex.sprint(-2, ".aux")
		tex.sprint({ token.create("relax"), token.create("fi") })
		T.park()
	end

	-- the old points after the edit, at their new lines: where the run may find it already matches
	local function stops_of(plan)
		local stops = {}
		local e = plan.edit
		for _, s in ipairs(plan.stops or {}) do
			local ok, st = true, {}
			for i, x in ipairs(s.stack) do
				local l = x.l
				if e and x.f == e.f then
					if l > e.oldTo then l = l + e.newTo - e.oldTo
					elseif l >= e.from then ok = false end
				end
				st[i] = { f = x.f, l = l }
			end
			if ok then stops[T.key_of(st)] = s end
		end
		return stops
	end

	local function selfcheck(c)
		local rec, grabs = T.diff(T.reading.open_keys)
		T.capture(grabs, function()
			local a, b = T.canon(c.rec), T.canon(rec)
			if a ~= b then
				local f = io.open(T.OUT .. "self-ref.lua", "w"); f:write(a); f:close()
				f = io.open(T.OUT .. "self-got.lua", "w"); f:write(b); f:close()
			end
			local i = 1
			while i <= #a and a:sub(i, i) == b:sub(i, i) do i = i + 1 end
			T.say(a == b and "SELF same" or ("SELF differs at " .. i .. ": " .. a:sub(math.max(1, i - 200), i + 100):gsub("\n", " ") .. " | " .. b:sub(math.max(1, i - 200), i + 100):gsub("\n", " ")))
		end)
	end

	-- staged at the chain's last point, ahead of the edit: TELE goes on from here with its own plan, DROP goes back to
	-- the base. The chain is the next edit's only when the main process says so
	function T.await_edit(c)
		T.staging = nil
		local l
		repeat
			l = io.stdin:read("*l")
			if l then l = l:gsub("\r$", "") end
		until not (l and (l:match("^FONTS ") or l:match("^IMAGES ")))
		local plan = l and l:match("^TELE (.+)$")
		if l == "DROP" then
			T.wind_down()
			T.settle()
			return
		end
		if not plan then os.exit(101) end
		plan = T.read_plan(plan)
		T.cut_path = plan.cut
		for rel, path in pairs(plan.overrides or {}) do
			if T.overrides[rel] ~= path then
				T.overrides[rel] = path
				T.reload(rel)
			end
		end
		T.stops = stops_of(plan)
		T.selfcheck = plan.selfcheck
		T.stage = plan.stage
		T.files = plan.files
		T.adopt_files()
		T.say("APPLIED 0 staged")
		if T.selfcheck then selfcheck(c) end
	end

	-- a plan comes on stdin as one line of Lua: on Windows a file read right after the app wrote it waits for the virus
	-- scanner
	function T.read_plan(src)
		local f = load(src, "=plan")
		if not f then os.exit(101) end
		return f()
	end

	-- serving: apply the plan's chain of records, outer file to inner, then typeset on from the edit
	function T.serve(plan)
		T.serving = true
		TEXPILE_TELE_SERVING = true
		if plan.src then
			T.snapshot_dir = plan.src
			lfs.mkdir(plan.src:sub(1, -2))
		end
		T.reset_snapshots()
		T.mark_objects()
		T.adopt_images(plan.images)
		T.cut_path = plan.cut
		for rel, path in pairs(plan.overrides or {}) do
			T.overrides[rel] = path
			T.reload(rel)
		end
		T.stops = stops_of(plan)
		T.selfcheck = plan.selfcheck
		T.stage = plan.stage
		T.open_index()
		T.chain = {}
		for k, c in ipairs(plan.chain) do
			local rec = T.read_record(c.rec)
			if not rec then T.refuse("unreadable record " .. c.rec) end
			if rec.refuse then T.refuse(rec.refuse) end
			T.chain[k] = { rec = rec, stack = c.stack, moves = c.moves }
		end
		T.files = plan.files
		-- no point before the edit: the run goes on from the base it waits at
		if #T.chain == 0 then
			T.apply_images({ macros = {} })
			T.stack[1].jump = T.base_line
			T.report_from = T.shipped + 1
			T.adopt_files()
			T.applying = false
			T.say("APPLIED 0")
			return
		end
		T.report_from = T.chain[#T.chain].rec.shipped + 1
		texpile_tele_enter(1)
	end

	-- record k of the chain goes in; the reader then continues at its line, and the next file of the chain is entered
	-- at the next record's line when the line that opens it runs
	function texpile_tele_enter(k)
		local c = T.chain[k]
		-- what differed when the file opened is within what this record lists
		if k > 1 then T.stack[#T.stack].open_keys = T.keys_of(c.rec) end
		T.apply(c.rec, function(fails, ms)
			if #fails > 0 then T.refuse(table.concat(fails, "; ")) end
			local here = c.stack[#c.stack]
			-- the line the run enters at is the record's own point: no second one there
			if k == 1 then
				T.reading.jump = here.l
				T.reading.injected[here.l] = true
			end
			local nxt = T.chain[k + 1]
			if nxt then T.entries[nxt.stack[#nxt.stack].f] = { line = nxt.stack[#nxt.stack].l, k = k + 1 }
			else
				T.adopt_files()
				T.applying = false
				if T.staging then return T.await_edit(c) end
				T.say(string.format("APPLIED %.1f %s", ms, table.concat(T.apply_stages or {}, " ")))
				if T.selfcheck then selfcheck(c) end
			end
		end, c.moves)
	end
end
