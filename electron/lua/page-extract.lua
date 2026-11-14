-- Writes every shipped page's walker records and the pages.json manifest.
-- Records go to <outdir>/page-NNN.jsonl. Registered from the job string through the kernel's shipout hook:
-- \AddToHook{shipout/before}{\directlua{page_extract(\the\ShipoutBox)}}
-- Globals set by the job string before dofile:
--   TEXPILE_ENGINE_DIR  absolute folder holding walker.lua (reads are not sandboxed)
--   TEXPILE_DRAFT_OUT   relative folder for the records (writes are sandboxed to the compile root)
local ENGINE_DIR = TEXPILE_ENGINE_DIR or "."
local OUT = TEXPILE_DRAFT_OUT and (TEXPILE_DRAFT_OUT .. "/") or ""
local walker = dofile(ENGINE_DIR .. "/walker.lua")
local pageno = 0
local pages = {}
-- \AtEndDocument has run: from here every shipout rewrites the manifest (see page_extract)
local doc_ended = false
-- TeX was still inside a box or math once the last page was out: the document's tail reached no page
local doc_open = false

local src_line_attr, src_file_attr
local src_files, src_filen = {}, 0
pcall(function()
	src_line_attr = luatexbase.new_attribute("texpilesrcline")
	src_file_attr = luatexbase.new_attribute("texpilesrcfile")
	walker.srcline, walker.srcfile = src_line_attr, src_file_attr
end)
-- teleport compares states without these: they only label the source, and every line an edit adds shifts them
TEXPILE_TELE_IGNORE_ATTRS = { src_line_attr, src_file_attr }

-- an image rule's index counts the image files read so far; \lastsavedimageresourceindex is the PDF object number,
-- and the two part as soon as anything takes an object first (hyperref does)
local image_files = {}
luatexbase.add_to_callback("find_image_file", function(name)
	local found = kpse.find_file(name, "tex") or name
	image_files[#image_files + 1] = found
	return found
end, "texpile.imagefile")
walker.imageFile = function(ix)
	return image_files[ix]
end
function texpile_images_read()
	return #image_files
end

-- each read takes the next image object, so the k-th of them holds the k-th file; nil once a read took none (an image
-- made from Lua)
local image_objs, scanned = {}, 0
function texpile_image_objects()
	local top = pdf.getmaxobjnum()
	for n = scanned + 1, top do
		if pdf.getobjtype(n) == "ximage" then image_objs[#image_objs + 1] = n end
	end
	scanned = top
	if #image_objs ~= #image_files then return nil end
	local at = {}
	for k, n in ipairs(image_objs) do at[n] = image_files[k] end
	return at
end

-- the page count and file table go into teleport records, so a teleported run numbers and labels the same way
TEXPILE_TELE_CARRY = TEXPILE_TELE_CARRY or {}
TEXPILE_TELE_CARRY.pageextract = {
	get = function()
		local files = {}
		for f, i in pairs(src_files) do files[i] = f end
		return { pageno = pageno, files = files }
	end,
	set = function(v)
		pageno = v.pageno
		src_files, src_filen = {}, #v.files
		for i, f in ipairs(v.files) do src_files[f] = i end
	end,
}

-- Each paragraph stamps its first source line and file onto the nodes it produces, so the walker can say which
-- line of the document a line of the page came from. Line numbers are file-local, hence the file id. Not covered:
-- \item, whose paragraph starts after \inputlineno has moved on.
function texpile_para()
	if not src_line_attr then return end
	local at, line
	if TEXPILE_SRC_AT then at, line = TEXPILE_SRC_AT() end
	local f = ((at or status and status.filename or ""):gsub("\\", "/"):match("[^/]+$") or ""):lower()
	local id = src_files[f]
	if not id then
		src_filen = src_filen + 1
		src_files[f] = src_filen
		id = src_filen
	end
	tex.setattribute(src_line_attr, line or tex.inputlineno)
	tex.setattribute(src_file_attr, id)
end

-- content outside any paragraph (a float caption, a running head) reads as unknown
function texpile_para_end()
	if not src_line_attr then return end
	tex.setattribute(src_line_attr, -2147483647)
	tex.setattribute(src_file_attr, -2147483647)
end

local function src_files_json()
	local inv = {}
	for f, i in pairs(src_files) do inv[i] = f end
	local t = {}
	for i = 1, src_filen do t[i] = '"' .. tostring(inv[i] or ""):gsub('[%c"\\]', "") .. '"' end
	return "[" .. table.concat(t, ",") .. "]"
end

local body_line
function texpile_begindoc(line) body_line = line end

local function write_manifest()
	local f = io.open(OUT .. "pages.json", "w")
	if not f then return end
	local pw = (tex.dimen and tex.dimen["paperwidth"] or 0) / 65536.0
	local ph = (tex.dimen and tex.dimen["paperheight"] or 0) / 65536.0
	-- \hoffset/\voffset move the page's reference point from TeX's 1in default
	local hoff, voff = 0, 0
	pcall(function() hoff = tex.dimen["hoffset"] / 65536.0 end)
	pcall(function() voff = tex.dimen["voffset"] / 65536.0 end)
	local t = {}
	for i = 1, pageno do
		local p = pages[i] or { w = 0, h = 0 }
		local unc = p.unc and string.format(',"unc":"%s"', p.unc) or ""
		t[#t + 1] = string.format('{"n":%d,"w":%.4f,"h":%.4f%s}', i, p.w, p.h, unc)
	end
	f:write(string.format('{"count":%d,"paperW":%.4f,"paperH":%.4f,"hOffset":%.4f,"vOffset":%.4f,"srcFiles":%s%s%s,"pages":[%s]}',
		pageno, pw, ph, hoff, voff, src_files_json(), body_line and string.format(',"bodyLine":%d', body_line) or "",
		doc_open and ',"open":true' or "", table.concat(t, ",")))
	f:close()
end

function page_extract(boxnum)
	local b = tex.box[boxnum]
	if not b then return end
	pageno = pageno + 1
	-- the PDF color stack carries over page breaks: the walker starts from what it held when this page began
	walker.skipAttr = TEXPILE_TELE_SKIP_ATTR
	local seed = TEXPILE_TELE_PREPAGE and TEXPILE_TELE_PREPAGE(b) or nil
	local ok, records, stats = pcall(walker.lines, b.head, nil, seed)
	pages[pageno] = { w = (b.width or 0) / 65536, h = ((b.height or 0) + (b.depth or 0)) / 65536, unc = ok and stats and stats.uncertified or nil }
	-- a served page goes to the app on stdout: on Windows a file the app reads right after it was written waits for
	-- the virus scanner
	local served = TEXPILE_TELE_SERVING
	if ok and not served then
		local f = io.open(string.format("%spage-%03d.jsonl", OUT, pageno), "w")
		if f then
			f:write(table.concat(records, "\n"))
			f:close()
		end
	end
	-- \AtEndDocument fires before the final \clearpage ships the last pages, so every shipout after it rewrites
	-- the manifest and the last one leaves it complete
	if doc_ended or TEXPILE_TELE_SERVING then write_manifest() end
	if TEXPILE_TELE_PAGE then TEXPILE_TELE_PAGE(b, pageno, pages[pageno], served and ok and records or {}) end
end

function page_extract_finish()
	doc_ended = true
	write_manifest()
end

function page_extract_last()
	doc_open = tex.nest.ptr > 0
	if doc_open then write_manifest() end
end
