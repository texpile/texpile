-- Points this process stood at, kept whole in memory. A run that goes back to one undoes what it changed since
-- (reset.lua), where an apply would put the whole record back from the base. A point inside a file is kept with the
-- points its files opened at: going back to it reads those lines again.
return function(T)
	local PREFIX = "texpiletele@"
	local MAXDIMEN = 1073741823
	-- each holds a page of nodes and an alias per changed name
	local STAGED = 3
	local get_command, get_mode = token.get_command, token.get_mode
	-- by record file; `recent`: the points edits went back to, oldest first
	local kept, recent = {}, {}
	local free_slots, slots = {}, 0

	-- a point stays while something holds it: the recent list, a point inside the file it opened, that file's reader
	local function release(k)
		k.holders = k.holders - 1
		if k.holders > 0 then return end
		if kept[k.file] == k then kept[k.file] = nil end
		if k.pagecopy then node.flush_list(k.pagecopy) end
		if k.contribcopy then node.flush_list(k.contribcopy) end
		for _, bx in pairs(k.boxcopy) do node.flush_list(bx) end
		free_slots[#free_slots + 1] = k.slot
		for _, o in ipairs(k.outer) do release(o) end
	end
	T.release_point = release

	local function unlist(k)
		for i, x in ipairs(recent) do
			if x == k then
				table.remove(recent, i)
				return true
			end
		end
		return false
	end

	-- a point that did not come back, and the points inside the file it opened, are no longer gone back to
	local function forget(k)
		if kept[k.file] == k then kept[k.file] = nil end
		local inner = {}
		for _, x in pairs(kept) do
			for _, o in ipairs(x.outer) do
				if o == k then inner[#inner + 1] = x end
			end
		end
		for _, x in ipairs(inner) do forget(x) end
		if unlist(k) then release(k) end
	end
	T.forget_point = forget

	function T.kept_point(file) return kept[file] end

	local function split_marks()
		local parts = {}
		for _, m in ipairs(T.marks_now({ "splitfirst", "splitbottom" })) do
			parts[#parts + 1] = m.c .. ":" .. tostring(m.texts[1]) .. ":" .. tostring(m.texts[2])
		end
		return table.concat(parts, "|")
	end
	function T.base_split_marks() T.base.split_marks = split_marks() end

	-- The state right now is `rec`'s, the record `file` holds: this process recorded it here, or applied it. `line`
	-- is where its file reads on. nil when the point cannot be kept
	local function keep(file, rec, line)
		if kept[file] then return kept[file] end
		-- a reset sets no split marks but the base's
		if rec.refuse or split_marks() ~= T.base.split_marks then return nil end
		local outer = {}
		for i = 2, #T.stack do
			local o = T.stack[i].opened_by
			if not o then return nil end
			outer[i - 1] = o
		end
		local slot = table.remove(free_slots)
		if not slot then
			slots = slots + 1
			slot = slots
		end
		local dumps = {}
		for _, bx in ipairs(rec.boxes) do dumps[bx.i] = T.dump(bx.list) end
		local k = T.values_now(dumps)
		k.slot, k.file, k.line, k.stack, k.outer, k.holders = slot, file, line, T.stack_now(line), outer, 0
		for _, o in ipairs(outer) do o.holders = o.holders + 1 end
		k.open_keys = T.reading.open_keys
		k.pagelen, k.contriblen = node.length(tex.lists.page_head), node.length(tex.lists.contrib_head)
		k.pagestate = { tex.pagegoal, tex.pagetotal, tex.pagedepth }
		k.vsize_start = tex.pagegoal ~= MAXDIMEN and T.vsize_start() or nil
		k.cstacks, k.carry = T.color_stacks(), T.carry_get()
		k.selected = {}
		for nm in pairs(T.selected) do k.selected[nm] = true end
		-- each changed name's meaning under an alias, which also holds a macro's token list at its address
		local pins, n = {}, 0
		local function pin(tk)
			n = n + 1
			local alias = PREFIX .. "k" .. slot .. "@" .. n
			token.set_macro(alias, "", "global")
			T.let_global(pins, token.create(alias), tk)
			return alias
		end
		k.over = {}
		local function name(nm, hash)
			local tk = token.create(nm)
			k.over[nm] = { nm, tk, get_command(tk), get_mode(tk), hash, pin(tk) }
		end
		for _, x in ipairs(rec.names) do name(x.n) end
		for _, m in ipairs(rec.macros) do name(m.n, m.h) end
		for _, nm in ipairs(rec.nfss) do if not k.over[nm] then name(nm) end end
		k.chars, k.char_pin = {}, {}
		for i, tk in ipairs(T.char_tokens()) do
			local e, b = { get_command(tk), get_mode(tk) }, T.base.chars[i]
			k.chars[i] = e
			k.char_pin[i] = (e[1] == b[1] and e[2] == b[2]) and T.char_pin[i] or pin(tk)
		end
		tex.sprint(pins)
		-- token lists as the record holds them, the base's where the record holds none
		k.tparam_toks, k.toks_toks = {}, {}
		for p, b in pairs(T.base.tparam_toks) do k.tparam_toks[p] = b end
		for _, g in ipairs(rec.tparams) do k.tparam_toks[g.n] = g.b end
		for i, b in pairs(T.base.toks_toks) do k.toks_toks[i] = b end
		for _, g in ipairs(rec.toks) do k.toks_toks[g.r] = g.b end
		local bot = T.base.marks_toks.botmarks
		if T.fires > T.base.fires then
			bot = {}
			for _, g in ipairs(rec.marks) do bot[g.c] = g.b end
		end
		k.marks_toks = { botmarks = bot, splitfirstmarks = T.base.marks_toks.splitfirstmarks, splitbotmarks = T.base.marks_toks.splitbotmarks }
		k.side = T.kept_side()
		kept[file] = k
		return k
	end

	-- a point an edit goes back to, or a chain ends at: the last few stay
	function T.keep_point(file, rec, line)
		local k = keep(file, rec, line)
		if not k then return nil end
		if not unlist(k) then k.holders = k.holders + 1 end
		recent[#recent + 1] = k
		if #recent > STAGED then release(table.remove(recent, 1)) end
		return k
	end

	-- A point at a line that opens a file, for the points inside that file: it waits for the file to open. `k`: a
	-- point already kept
	local opening
	function T.keep_opening(file, rec, line, k)
		if opening then release(opening) end
		opening = k or keep(file, rec, line)
		if opening then opening.holders = opening.holders + 1 end
	end
	-- the file `outer` just opened takes the point kept at that line; its reader lets go of it when it closes
	function T.opened_by(outer)
		local k = opening
		if not k or not outer or outer.pos ~= k.line then return nil end
		opening = nil
		return k
	end
	function T.drop_opening()
		if opening then release(opening) end
		opening = nil
	end
end
