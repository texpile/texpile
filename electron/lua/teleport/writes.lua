-- The files TeX opens for writing after the base. A record holds no file's text, so a served run that reads back a
-- file it did not open itself would read what an earlier serve or no one wrote (endfloat's .fff): it refuses.
return function(T)
	local DRAFT = (TEXPILE_DRAFT_OUT or "") .. "/"
	-- opened since the base as the state goes (the record carries it), by an earlier serve of this process, by this serve
	local since_base, earlier, this_run = {}, {}, {}

	local function leaf(name)
		local n = name:gsub("\\", "/"):gsub("^%./", "")
		if n:sub(1, #DRAFT) == DRAFT then n = n:sub(#DRAFT + 1) end
		return n
	end

	-- LuaTeX leaves -output-directory to this callback once one is registered
	luatexbase.add_to_callback("find_write_file", function(_, name)
		if T.base then
			local n = leaf(name)
			since_base[n], this_run[n] = true, true
		end
		if TEXPILE_DRAFT_OUT and not name:match("^/") and not name:match("^%a:") then return DRAFT .. name end
		return name
	end, "texpile.tele.write")

	function T.rearm_writes()
		for n in pairs(this_run) do earlier[n] = true end
		this_run = {}
	end

	-- the name under the output folder when a read of it would see text this run did not write
	function T.stale_read(name)
		local n = leaf(name)
		if (since_base[n] or earlier[n]) and not this_run[n] then return n end
		return nil
	end

	TEXPILE_TELE_CARRY.writes = {
		get = function()
			local list = {}
			for n in pairs(since_base) do list[#list + 1] = n end
			table.sort(list)
			return list
		end,
		set = function(list)
			since_base = {}
			for _, n in ipairs(list) do
				since_base[n] = true
				-- \IfFileExists asks no callback: the file is there as in a fresh run, so the read that follows is seen
				if not lfs.attributes(DRAFT .. n, "mode") then
					local f = io.open(DRAFT .. n, "w")
					if f then f:close() end
				end
			end
		end,
	}
end
