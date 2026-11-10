-- Images in a served process. graphics reads a file once and keeps it in three macros ("<file> image<hash>" holding
-- \useimageresource <object>, and its width and height); an image rule holds the image's place in the order files
-- were read. A served process holds the compile's images at the compile's object numbers, in the same order, so the
-- records' macros and nodes mean the same files there.
return function(T)
	-- graphics names its cache for the file it found, extension and all
	local function cache_of(name)
		local file, kind, hash = name:match("^(.-%.%w+) (%a+)(.*)$")
		if file and (hash == "" or hash:sub(1, 1) == ":") then return file, kind, hash end
	end

	local function kept_object(name)
		local file, kind, hash = cache_of(name)
		if kind ~= "image" then return nil end
		local n = tonumber((token.get_macro(name) or ""):match("^\\useimageresource%s*(%d+)"))
		return n and file, n, hash
	end

	-- graphics' cache of a file it read: whether it is there decides only whether the file is read again
	function T.is_image_cache(name)
		local _, kind = cache_of(name)
		return kind == "image" or kind == "width" or kind == "height"
	end

	-- at the end of the compile: every image graphics kept, for the served processes to hold
	function T.write_images(path)
		local at = texpile_image_objects() or {}
		local list = {}
		for k, v in pairs(tex.hashtokens()) do
			local nm = type(k) == "string" and k or v
			local file, n, hash = kept_object(nm)
			if file and at[n] then
				list[#list + 1] = { n = n, file = file, hash = hash, path = at[n],
					w = token.get_macro(file .. " width" .. hash), h = token.get_macro(file .. " height" .. hash) }
			end
		end
		table.sort(list, function(a, b) return a.n < b.n end)
		local f = io.open(path, "w")
		if not f then return end
		f:write("return ", T.dump(list), "\n")
		f:close()
	end

	function T.adopt_images(path)
		T.images = {}
		for _, e in ipairs(path and T.read_record(path) or {}) do T.images[e.n] = e end
	end

	-- every image read since the base sits at the compile's object number, the file the compile read there
	function T.images_like_compile()
		local at = texpile_image_objects()
		if not at then return false end
		for n, p in pairs(at) do
			local e = T.images and T.images[n]
			if n > T.base.maxobj and not (e and e.path == p) then return false end
		end
		return true
	end

	-- the apply reads again only what graphics keeps: an image the compile read any other way (pgf's
	-- \pgfdeclareimage) would be missing, and every index after it would shift
	function T.image_refusal(rec)
		if T.serving then return not T.images_like_compile() and "an image is not at the compile's object" or nil end
		local kept = {}
		for _, m in ipairs(rec.macros) do
			local file, n = kept_object(m.n)
			if file then kept[n] = true end
		end
		for n = T.base.maxobj + 1, rec.maxobj do
			if pdf.getobjtype(n) == "ximage" and not kept[n] then return "image " .. n .. " is not one graphics keeps" end
		end
	end

	-- each at its object, in object order: the ones below what this process already took are left out, and a needed
	-- one among them fails the apply
	local function read_at_objects(load)
		local list = {}
		for _, im in pairs(load) do list[#list + 1] = im end
		table.sort(list, function(a, b) return a.n < b.n end)
		local top = pdf.getmaxobjnum()
		for _, im in ipairs(list) do
			if im.n > top then
				local box, page, decode = im.hash:match("^:(%a+)"), im.hash:match(":P(%d+)"), im.hash:match(":D(%b[])")
				local interp = im.hash:find(":I", 1, true)
				local cmd = "\\saveimageresource "
				if decode or interp then cmd = cmd .. "attr{" .. (decode and ("/Decode" .. decode) or "") .. (interp and "/Interpolate true" or "") .. "}" end
				if page then cmd = cmd .. " page " .. page end
				if box then cmd = cmd .. " " .. box end
				tex.sprint("\\directlua{texpile_tele_reserve(" .. (im.n - 1) .. ")}")
				tex.sprint(cmd .. "{")
				tex.sprint(-2, im.file)
				tex.sprint("}\\directlua{texpile_tele_imgcheck(" .. im.n .. ")}")
				im.read = true
			elseif im.needed then
				T.setfail["object " .. im.n .. " is taken, not the image " .. im.file] = true
			end
		end
	end

	local function compile_images_missing(at, load)
		for n, e in pairs(T.images or {}) do
			if not at[n] and not load[n] then load[n] = { n = n, file = e.file, hash = e.hash } end
		end
		return load
	end

	-- a spare reads the compile's images while it waits at the base
	function T.preload_images(path)
		T.adopt_images(path)
		read_at_objects(compile_images_missing(texpile_image_objects() or {}, {}))
	end

	-- the images a record's macros name and every later one the compile read, each at its object unless this process
	-- holds it there already, and graphics' cache of those the record does not name: no file is read again in the run.
	-- Returns the names of that cache
	function T.apply_images(r)
		local at = texpile_image_objects() or {}
		local load, named = {}, {}
		for _, m in ipairs(r.macros) do
			local file, n, hash = kept_object(m.n)
			if file then
				named[n] = true
				if not at[n] then load[n] = { n = n, file = file, hash = hash, needed = true } end
			end
		end
		read_at_objects(compile_images_missing(at, load))
		local cache = {}
		for n, e in pairs(T.images or {}) do
			if not named[n] and (at[n] == e.path or (load[n] and load[n].read)) and e.w and e.h then
				for kind, body in pairs({ image = "\\useimageresource " .. n, width = e.w, height = e.h }) do
					local name = e.file .. " " .. kind .. e.hash
					token.set_macro(name, body, "global")
					cache[#cache + 1] = name
				end
			end
		end
		return cache
	end
end
