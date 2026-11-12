-- A plan going in, and a served run winding down to the main file, where the process parks at its base again.
return function(T)
	-- inside a file, the run ends that file early; in the main file the process parks
	function T.settle()
		if #T.stack == 1 then T.park() else T.stack[#T.stack].drain = true end
	end

	-- a process serves this many teleports, then exits and a fresh one takes its place. Two engines started together
	-- stand apart by their folders' numbers, so one still serves while the other's place is filled
	local MAX_SERVES = 40 + 25 * ((tonumber(T.OUT:match("(%d)/tele/$")) or 0) % 2)

	-- Verified and waiting for the next command: at the point the run's plan staged at when this process kept it,
	-- where the next edit of the paragraph goes on, else at the base. `T.then_serve`: a plan to serve from the base
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
		-- with no point at the edited paragraph (it sits in an environment), the one the run started from
		local plan, staging, back = T.then_serve, T.then_stage, T.back_to or T.started_at
		T.then_serve, T.then_stage, T.back_to, T.started_at = nil, nil, nil, nil
		T.drop_opening()
		if plan or not back then
			T.reset(function(ok, err)
				if not ok then
					T.say("UNPARKED " .. err)
					os.exit(0)
				end
				T.rearm()
				if plan then
					T.serves = T.serves + 1
					T.staging = staging
					return T.serve(plan)
				end
				T.say("PARKED " .. (T.reset_laps or ""))
				T.wait = { base = true }
			end)
			return
		end
		-- back to the edited paragraph, by way of the lines that opened its file, with the texts the run read
		local texts, lines = T.overrides, T.stack[1].lines
		T.rearm()
		T.overrides, T.stack[1].lines = texts, lines
		T.chain = {}
		for i, o in ipairs(back.outer) do T.chain[i] = { kept = o, file = o.file, stack = o.stack } end
		T.chain[#T.chain + 1] = { kept = back, file = back.file, stack = back.stack }
		T.restaging = true
		texpile_tele_enter(1)
	end

	function T.rearm()
		T.serving, TEXPILE_TELE_SERVING = false, false
		T.overrides, T.entries = {}, {}
		T.stops, T.stage, T.chain, T.files, T.selfcheck, T.report_from = nil, nil, nil, nil, nil, nil
		T.edit, T.edit_read, T.edit_page, T.reached, T.edit_out, T.lingered = nil, nil, nil, nil, nil, nil
		T.back_to, T.started_at, T.plan, T.restaging, T.to_stage = nil, nil, nil, nil, nil
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
			local a, b = T.canon(c.rec or T.read_record(c.file)), T.canon(rec)
			if a ~= b then
				local f = io.open(T.OUT .. "self-ref.lua", "w"); f:write(a); f:close()
				f = io.open(T.OUT .. "self-got.lua", "w"); f:write(b); f:close()
			end
			local i = 1
			while i <= #a and a:sub(i, i) == b:sub(i, i) do i = i + 1 end
			T.say(a == b and "SELF same" or ("SELF differs at " .. i .. ": " .. a:sub(math.max(1, i - 200), i + 100):gsub("\n", " ") .. " | " .. b:sub(math.max(1, i - 200), i + 100):gsub("\n", " ")))
		end)
	end

	-- A point can sit pages before the edit: the pages up to the edited paragraph are the ones on screen, so the run
	-- reports from the page under way when that paragraph is first read. A cut waits for the page under way when the
	-- paragraph ends (`edit_page`, set by the reader), which is the one a word typed at its end lands on. `start`: the
	-- page after the point, for a plan that names no paragraph. `reship`: the first page a cut run left on screen
	local function report_pages(plan, start)
		local named = plan.stage and plan.edit
		T.edit, T.edit_read, T.reached = plan.edit, nil, nil
		T.edit_page = not named and start or nil
		T.report_from = named and (plan.reship or math.huge) or start
	end
	function T.reach_edit()
		T.reached = true
		T.report_from = math.min(T.report_from, T.shipped + 1)
	end

	-- what every serve starts with: its own folders, the texts it reads and where it may stop
	local function open_serve(plan)
		T.serving, TEXPILE_TELE_SERVING = true, true
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
		T.files = plan.files
	end

	-- the run goes back to the point it stands at when that is the edited paragraph's first line
	local function back_to(c)
		local k, st = c.kept, T.stage
		return k and st and st.l == k.line and st.f == T.stack[#T.stack].rel and k or nil
	end

	-- The process waits for its next command where TeX asks for the next line of the file it stands in (reader.lua).
	-- Every level a reset or an apply printed has closed by then, where a wait inside them kept each one open until
	-- TeX had no more to give. `T.wait`: at the base, or at a point (`at`) with a stage's serve open (`open`)
	function T.await_edit(c, open)
		T.staging = nil
		if open then T.say("AT " .. c.file) end
		T.wait = { at = c, open = open }
	end

	local LEAVE = "\\directlua{texpile_tele_leave()}%"
	function texpile_tele_leave()
		T.wind_down()
		T.settle()
	end
	function texpile_tele_selfcheck()
		local c = T.checking
		T.checking = nil
		selfcheck(c)
	end

	-- Waiting at the chain's last point, ahead of the edit: TELE goes on from here with its own plan, DROP goes back to
	-- the base. The chain is the next edit's only when the main process says so, and a plan that starts anywhere else
	-- is served from the base. The line TeX runs for the command, or nil to read on
	local function edit_command(c, open)
		while true do
			local l
			repeat
				l = io.stdin:read("*l")
				if l then l = l:gsub("\r$", "") end
			until not (l and (l:match("^FONTS ") or l:match("^IMAGES ")))
			if l == "DROP" then return LEAVE end
			local kind, plan
			if l then kind, plan = l:match("^(%u+) (.+)$") end
			if kind ~= "TELE" and kind ~= "PRE" then os.exit(101) end
			plan = T.read_plan(plan)
			local last = plan.chain[#plan.chain]
			if not last or last.rec ~= c.file or (last.moves and #last.moves > 0) then
				T.then_serve, T.then_stage = plan, kind == "PRE"
				return LEAVE
			end
			-- a stage for the point the process already waits at
			if kind == "PRE" then T.say("AT " .. c.file)
			else
				-- the edit's own serve: a stage's is the same one, opened again with the texts as they are now
				if not open then T.serves = T.serves + 1 end
				open_serve(plan)
				-- the files the process stands in, as a serve lists them on its way in
				for i = 2, #T.stack do T.entered(T.stack[i].rel) end
				T.plan = plan
				report_pages(plan, (c.rec or c.kept).shipped + 1)
				T.back_to, T.started_at = back_to(c), c.kept
				T.adopt_files()
				T.applying = false
				T.say("APPLIED 0 staged")
				if not T.selfcheck then return nil end
				T.checking = c
				return "\\directlua{texpile_tele_selfcheck()}%"
			end
		end
	end

	function T.take_command(w)
		if w.base then return T.next_command() end
		return edit_command(w.at, w.open)
	end

	-- a plan comes on stdin as one line of Lua: on Windows a file read right after the app wrote it waits for the virus
	-- scanner
	function T.read_plan(src)
		local f = load(src, "=plan")
		if not f then os.exit(101) end
		return f()
	end

	-- serving: the plan's chain of points goes in, outer file to inner, then the run typesets on from the edit. A
	-- point this process kept goes in from memory, any other from its record
	function T.serve(plan)
		T.plan = plan
		open_serve(plan)
		T.chain = {}
		for k, c in ipairs(plan.chain) do
			local moved = c.moves and #c.moves > 0
			local kept = not moved and T.kept_point(c.rec)
			local rec = not kept and T.read_record(c.rec)
			if not kept and not rec then
				-- a stage read late, after the index let this record go, has no point to wait at but the base
				if T.staging then
					T.rearm()
					T.wait = { base = true }
					return
				end
				T.refuse("unreadable record " .. c.rec)
			end
			if rec and rec.refuse then T.refuse(rec.refuse) end
			T.chain[k] = { kept = kept or nil, rec = rec or nil, file = c.rec, stack = c.stack, moves = c.moves, moved = moved }
		end
		-- no point before the edit: the run goes on from the base it waits at
		if #T.chain == 0 then
			T.apply_images({ macros = {} })
			T.stack[1].jump = T.base_line
			report_pages(plan, T.shipped + 1)
			T.adopt_files()
			T.applying = false
			-- a stage with no point before its paragraph reads on from the base
			if T.staging then
				if not (plan.ahead and T.stage) then os.exit(101) end
				T.staging, T.to_stage = nil, true
				return
			end
			T.say("APPLIED 0")
			return
		end
		local last = T.chain[#T.chain]
		report_pages(plan, (last.kept or last.rec).shipped + 1)
		texpile_tele_enter(1)
	end

	-- point k of the chain is in; the reader then continues at its line, and the next file of the chain is entered
	-- at the next point's line when the line that opens it runs
	local function entered(k, ms, stages)
		local c = T.chain[k]
		local here = c.stack[#c.stack]
		-- the line the run enters at is the point's own: no second one there
		if k == 1 then
			T.reading.jump = here.l
			T.reading.injected[here.l] = true
		end
		T.at_base = false
		local nxt = T.chain[k + 1]
		if not nxt and not c.moved then c.kept = T.keep_point(c.file, c.rec, here.l) end
		-- when this line opens a file, the points inside that file are kept by way of this one
		if not c.moved then T.keep_opening(c.file, c.rec, here.l, c.kept) end
		if nxt then
			T.entries[nxt.stack[#nxt.stack].f] = { line = nxt.stack[#nxt.stack].l, k = k + 1 }
			return
		end
		T.back_to, T.started_at = back_to(c), c.kept
		T.adopt_files()
		T.applying = false
		if T.restaging then
			T.restaging = nil
			T.say("STAGED " .. c.file .. " " .. stages)
			return T.await_edit(c)
		end
		if T.staging then
			-- a stage sent ahead of any edit reads on to its paragraph, and waits at the point it records there
			local st = T.stage
			if T.plan.ahead and st and not (st.l == here.l and st.f == here.f) then
				T.staging, T.to_stage = nil, true
				return
			end
			return T.await_edit(c, true)
		end
		T.say(string.format("APPLIED %.1f %s", ms, stages))
		if T.selfcheck then selfcheck(c) end
	end

	function texpile_tele_enter(k)
		local c = T.chain[k]
		if c.kept then
			local t0 = os.gettimeofday()
			if k > 1 then T.stack[#T.stack].open_keys = c.kept.open_keys end
			T.reset(function(ok, err)
				if ok then return entered(k, (os.gettimeofday() - t0) * 1000, "kept " .. (T.reset_laps or "")) end
				-- a point that does not come back is no longer kept: the plan is served again from the base, and with
				-- no plan the base is where the process waits
				T.say("FORGOT " .. err)
				T.forget_point(c.kept)
				T.then_serve, T.restaging = T.plan, nil
				T.wind_down()
				T.settle()
			end, c.kept)
			return
		end
		-- what differed when the file opened is within what this record lists
		if k > 1 then T.stack[#T.stack].open_keys = T.keys_of(c.rec) end
		T.apply(c.rec, function(fails, ms)
			if #fails > 0 then T.refuse(table.concat(fails, "; ")) end
			entered(k, ms, table.concat(T.apply_stages or {}, " "))
		end, c.moves)
	end
end
