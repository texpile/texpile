-- what a picture's box holds, written for the editor as JSON: pgf's PDF operators, glyphs, rules, the color stack,
-- shadings, images and statement marks, each in TeX pt from the box's reference point, y down
local pt = 65536
local GLYPH, KERN, GLUE, RULE, HLIST, VLIST, WHATSIT, MATH, DISC =
	node.id("glyph"), node.id("kern"), node.id("glue"), node.id("rule"), node.id("hlist"),
	node.id("vlist"), node.id("whatsit"), node.id("math"), node.id("disc")
local WHATSIT_KIND = {}
for k, v in pairs(node.whatsits()) do WHATSIT_KIND[v] = k end
local W_LITERAL = WHATSIT_KIND.pdf_literal
local W_COLORSTACK = WHATSIT_KIND.pdf_colorstack
local W_USER = WHATSIT_KIND.user_defined
local W_SAVE = WHATSIT_KIND.pdf_save
local W_RESTORE = WHATSIT_KIND.pdf_restore
local W_SETMATRIX = WHATSIT_KIND.pdf_setmatrix
local MARK_ID, GROUP_ID, IMAGE_ID = 7777, 7778, 7779
local function ruleSubtype(name, fallback)
	for k, v in pairs(node.subtypes("rule") or {}) do
		if v == name then return k end
	end
	return fallback
end
-- \useboxresource places a saved box (pgf's shadings) and \includegraphics an image, both as rules
local RULE_BOX = ruleSubtype("box", 1)
local RULE_IMAGE = ruleSubtype("image", 2)
local RUNNING = -1073741824
local PUA_START = 0xF0000

-- pgf declares a shading once and reuses it by resource index for the rest of the run, so these outlive a picture
local shadings, pendingShading = {}, nil
function tikzcap_pending(kind, domain, func)
	pendingShading = { kind = kind, domain = domain, func = func }
end
-- a radial shading's inner circle sits off center (ball color's highlight), in pt
function tikzcap_focus(x, y)
	if pendingShading then pendingShading.focus = string.format("[%s,%s]", x, y) end
end
function tikzcap_shading(index)
	if pendingShading then shadings[index] = pendingShading end
	pendingShading = nil
end

local marks, fonts, out, usedShadings, imageFile, level, nest

local function jstr(s)
	s = tostring(s):gsub('[%c"\\]', function(c)
		if c == '"' then return '\\"' elseif c == "\\" then return "\\\\" elseif c == "\n" then return "\\n" end
		return string.format("\\u%04x", c:byte())
	end)
	return '"' .. s .. '"'
end

-- a path the tree serves: kpathsea's finds start at its root
local function treePath(path)
	return (tostring(path):gsub("\\", "/"):gsub("^/", ""))
end

-- \pgfsys@invoke lands here, so operators arrive as plain strings instead of token lists
function tikzcap_lit(s)
	local n = node.new(WHATSIT, W_LITERAL)
	n.mode = 0
	n.data = s
	node.write(n)
end

-- a statement's transform; one marking where its drawing begins, or the key's, once its own options apply
function tikzcap_mark(i, starts, a, b, c, d, e, f, xx, xy, yx, yy)
	local dim = function(s) return (s:gsub("pt$", "")) end
	marks[#marks + 1] = string.format('{"i":%d,"m":[%s,%s,%s,%s,%s,%s,%s,%s,%s,%s]%s}', i, a, b, c, d,
		dim(e), dim(f), dim(xx), dim(xy), dim(yx), dim(yy), starts and "" or ',"own":true')
	if not starts then return end
	local n = node.new(WHATSIT, W_USER)
	n.user_id = MARK_ID
	n.type = 100
	n.value = i
	node.write(n)
end

-- the fonts a virtual font sets that TeX itself never loaded, by the ids given them here
local virtualSubfonts, nextSubfont = {}, 100000

-- format-loaded fonts (classic math) are only reachable through getcopy
local function fontOf(id)
	return virtualSubfonts[id] or font.getfont(id) or (font.getcopy and font.getcopy(id))
end

-- a classic font names a TFM; the map file names the .pfb and .enc its outlines are in
local fontMap
local function mapEntry(name)
	if not fontMap then
		fontMap = {}
		local path = kpse.find_file("pdftex.map", "map")
		local f = path and io.open(path, "r")
		if f then
			for line in f:lines() do
				local first = line:sub(1, 1)
				if first ~= "" and first ~= "%" and first ~= "#" then
					local pfb, enc
					for tok in line:gmatch("<+%[?(%S+)") do
						local lower = tok:lower()
						if lower:match("%.enc$") then enc = tok elseif lower:match("%.pfb$") then pfb = tok end
					end
					if pfb then fontMap[line:match("^(%S+)")] = { pfb = pfb, enc = enc } end
				end
			end
			f:close()
		end
	end
	return fontMap[name]
end

local function type1Files(name, file)
	if file:lower():match("%.[ot]tf$") or file:lower():match("%.ttc$") then return "" end
	local e = mapEntry(name)
	local pfb = e and kpse.find_file(e.pfb, "type1 fonts")
	if not pfb then return "" end
	local enc = e.enc and kpse.find_file(e.enc, "enc files")
	return string.format(',"t1":{"pfb":%s,"enc":%s}', jstr(treePath(pfb)), enc and jstr(treePath(enc)) or "null")
end

local function noteFont(id)
	if fonts[id] then return end
	local f = fontOf(id) or {}
	local file = treePath(f.filename or ""):gsub("^harfloaded:", "")
	local name = f.name or f.fullname or ""
	fonts[id] = string.format('{"id":%d,"name":%s,"file":%s,"size":%.4f,"harf":%s%s}', id,
		jstr(name), jstr(file), (f.size or 10 * pt) / pt, tostring(f.hb ~= nil), type1Files(name, file))
end

-- a font set from TFM alone whose VF says what it is made of (Times is ptmr8t over ptmr8r); LuaTeX reads it only to
-- write a PDF, so the walker reads it here, each font it names given an id with its TFM's widths
local virtualFonts = {}
local function virtualOf(f)
	local key = (f.name or "") .. "@" .. (f.size or 0)
	if virtualFonts[key] == nil then
		virtualFonts[key] = false
		local vf = f.name and font.read_vf and font.read_vf(f.name, f.size)
		if vf and vf.characters then
			local subs = {}
			for k, sub in ipairs(vf.fonts or {}) do
				local tfm = sub.name and font.read_tfm(sub.name, sub.size or f.size)
				if tfm then
					nextSubfont = nextSubfont + 1
					virtualSubfonts[nextSubfont] = tfm
					subs[k] = { id = nextSubfont }
				end
			end
			virtualFonts[key] = { characters = vf.characters, fonts = subs }
		end
	end
	return virtualFonts[key] or nil
end

-- luaotfload's private-use glyphs exist only by glyph index
local function glyphIndex(n)
	local f = fontOf(n.font)
	if not f then return "" end
	if f.hb == nil and n.char < PUA_START then return "" end
	local ch = f.characters and f.characters[n.char]
	if ch and ch.index then return ',"gi":' .. ch.index end
	return ""
end

-- pgf keeps a transparency group as a saved box the walker cannot see into; the job keeps it in line, between these
function tikzcap_group(on)
	local n = node.new(WHATSIT, W_USER)
	n.user_id = GROUP_ID
	n.type = 100
	n.value = on
	node.write(n)
end

-- graphicx places an image right after this, so the walker knows which file the next image rule shows
function tikzcap_imagefile(name)
	local n = node.new(WHATSIT, W_USER)
	n.user_id = IMAGE_ID
	n.type = 115
	n.value = (kpse.find_file(name, "graphic/figure") or name):gsub("^%./", "")
	node.write(n)
end

local walkV

local function glyphRecord(x, y, c, id, gi)
	noteFont(id)
	out[#out + 1] = string.format('{"t":"g","x":%.4f,"y":%.4f,"c":%d,"f":%d%s}', x / pt, y / pt, c, id, gi or "")
end

-- a virtual font's glyph is the glyphs, rules and moves its commands set, in the fonts it names
local function virtualGlyph(f, commands, x, y)
	local stack, current = {}, f.fonts and f.fonts[1] and f.fonts[1].id
	for _, cmd in ipairs(commands) do
		local op = cmd[1]
		if op == "font" then
			current = f.fonts[cmd[2]] and f.fonts[cmd[2]].id
		elseif op == "char" or op == "slot" then
			local id, c = current, cmd[2]
			if op == "slot" then id, c = f.fonts[cmd[2]] and f.fonts[cmd[2]].id, cmd[3] end
			local real = id and fontOf(id)
			local ch = real and real.characters and real.characters[c]
			if ch and ch.commands then
				virtualGlyph(real, ch.commands, x, y)
			elseif real then
				glyphRecord(x, y, c, id)
			end
			x = x + (ch and ch.width or 0)
		elseif op == "right" then
			x = x + cmd[2]
		elseif op == "down" then
			y = y + cmd[2]
		elseif op == "push" then
			stack[#stack + 1] = { x, y }
		elseif op == "pop" and #stack > 0 then
			local at = table.remove(stack)
			x, y = at[1], at[2]
		elseif op == "rule" then
			if cmd[2] > 0 and cmd[3] > 0 then
				out[#out + 1] = string.format('{"t":"r","x":%.4f,"y":%.4f,"w":%.4f,"h":%.4f,"d":0}', x / pt, y / pt, cmd[3] / pt, cmd[2] / pt)
			end
			x = x + cmd[3]
		end
	end
end

local function whatsit(n, x, y)
	local st = n.subtype
	if st == W_LITERAL then
		out[#out + 1] = string.format('{"t":"l","x":%.4f,"y":%.4f,"d":%s}', x / pt, y / pt, jstr(n.data))
	elseif st == W_COLORSTACK then
		out[#out + 1] = string.format('{"t":"c","cmd":%d,"d":%s}', n.command, jstr(n.data or ""))
	elseif st == W_USER and n.user_id == MARK_ID then
		out[#out + 1] = string.format('{"t":"m","i":%d}', n.value)
	elseif st == W_USER and n.user_id == IMAGE_ID then
		imageFile = n.value
	elseif st == W_SAVE or st == W_RESTORE or st == W_SETMATRIX then
		-- graphicx scales and rotates a box around where it sits: q, a b c d 0 0 cm, Q at that point
		local d = st == W_SAVE and "q" or st == W_RESTORE and "Q" or (n.data .. " 0 0 cm")
		out[#out + 1] = string.format('{"t":"l","x":%.4f,"y":%.4f,"d":%s}', x / pt, y / pt, jstr(d))
	elseif st == W_USER and n.user_id == GROUP_ID then
		out[#out + 1] = string.format('{"t":"G","on":%d}', n.value)
	end
end

local function walkH(head, parent, x, y)
	for n in node.traverse(head) do
		local id = n.id
		if id == GLYPH then
			local f = fontOf(n.font)
			local ch = f and f.characters and f.characters[n.char]
			local vf = f and not (ch and ch.commands) and (f.filename or "") == "" and not mapEntry(f.name or "") and virtualOf(f)
			local vch = vf and vf.characters[n.char]
			if ch and ch.commands then
				virtualGlyph(f, ch.commands, x + n.xoffset, y - n.yoffset)
			elseif vch and vch.commands then
				virtualGlyph(vf, vch.commands, x + n.xoffset, y - n.yoffset)
			else
				glyphRecord(x + n.xoffset, y - n.yoffset, n.char, n.font, glyphIndex(n))
			end
			x = x + n.width
		elseif id == KERN then
			x = x + n.kern
		elseif id == GLUE then
			x = x + node.effective_glue(n, parent)
		elseif id == DISC then
			-- luaotfload keeps ligatures and explicit hyphens as the text that replaces a break
			if n.replace then
				walkH(n.replace, parent, x, y)
				x = x + node.dimensions(n.replace)
			end
		elseif id == RULE and (n.subtype == RULE_BOX or n.subtype == RULE_IMAGE) then
			local kind = n.subtype == RULE_BOX and "x" or "i"
			local file = ""
			if kind == "x" then
				usedShadings[n.index] = true
			elseif imageFile then
				file = ',"p":' .. jstr(imageFile)
				imageFile = nil
			end
			out[#out + 1] = string.format('{"t":"%s","n":%d,"x":%.4f,"y":%.4f,"w":%.4f,"h":%.4f,"d":%.4f%s}',
				kind, n.index or 0, x / pt, y / pt, n.width / pt, n.height / pt, n.depth / pt, file)
			x = x + n.width
		elseif id == RULE then
			local h = n.height == RUNNING and parent.height or n.height
			local d = n.depth == RUNNING and parent.depth or n.depth
			if n.width > 0 and h + d > 0 then
				out[#out + 1] = string.format('{"t":"r","x":%.4f,"y":%.4f,"w":%.4f,"h":%.4f,"d":%.4f}',
					x / pt, y / pt, n.width / pt, h / pt, d / pt)
			end
			x = x + n.width
		elseif id == MATH then
			x = x + (n.surround or 0)
		elseif id == HLIST then
			walkH(n.head, n, x, y + n.shift)
			x = x + n.width
		elseif id == VLIST then
			walkV(n, x, y + n.shift)
			x = x + n.width
		elseif id == WHATSIT then
			whatsit(n, x, y)
		end
	end
end

-- a vertical box whose baseline is at y: its rows top to bottom
walkV = function(n, x, y)
	local yy = y - n.height
	for c in node.traverse(n.head) do
		if c.id == HLIST then
			yy = yy + c.height
			walkH(c.head, c, x + c.shift, yy)
			yy = yy + c.depth
		elseif c.id == VLIST then
			yy = yy + c.height
			walkV(c, x + c.shift, yy)
			yy = yy + c.depth
		elseif c.id == KERN then
			yy = yy + c.kern
		elseif c.id == GLUE then
			yy = yy + node.effective_glue(c, n)
		elseif c.id == RULE then
			local w = c.width == RUNNING and n.width or c.width
			yy = yy + c.height
			out[#out + 1] = string.format('{"t":"r","x":%.4f,"y":%.4f,"w":%.4f,"h":%.4f,"d":%.4f}',
				x / pt, yy / pt, w / pt, c.height / pt, c.depth / pt)
			yy = yy + c.depth
		elseif c.id == WHATSIT then
			whatsit(c, x, yy)
		end
	end
end

function tikzcap_begin()
	marks, fonts, usedShadings, imageFile = {}, {}, {}, nil
	level, nest = tex.currentgrouplevel, tex.nest.ptr
end

-- box 0 holds the picture; a brace or environment it left open keeps TeX inside it, and nothing is read from it
function tikzcap_finish()
	local open = tex.currentgrouplevel ~= level + 1 or tex.nest.ptr ~= nest
	local box = not open and tex.box[0] or nil
	out = {}
	if open then marks = {} end
	if box then walkH(box.head, box, 0, 0) end
	local fl = {}
	for _, v in pairs(fonts) do fl[#fl + 1] = v end
	local sh = {}
	for index in pairs(usedShadings) do
		local s = shadings[index]
		if s then
			sh[#sh + 1] = string.format('"%d":{"kind":%s,"domain":%s,"func":%s,"focus":%s}', index, jstr(s.kind),
				jstr(s.domain), jstr(s.func), s.focus or "null")
		end
	end
	local f = io.open("work/result.json", "w")
	f:write(string.format('{"open":%s,"w":%.4f,"h":%.4f,"d":%.4f,"marks":[%s],"recs":[%s],"fonts":[%s],"shadings":{%s}}',
		tostring(open), box and box.width / pt or 0, box and box.height / pt or 0, box and box.depth / pt or 0,
		table.concat(marks, ","), table.concat(out, ","), table.concat(fl, ","), table.concat(sh, ",")))
	f:close()
end
