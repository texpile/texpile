-- the figure engine's loop: one picture per request on stdin, its result in work/result.json, a marker when written
local DONE = "@@TEXPILE_DRAW_DONE"
local WARM = "@@TEXPILE_DRAW_WARM"
local warm = false

function draw_step()
	if not warm then
		warm = true
		io.stdout:write("\n" .. WARM .. "\n")
		io.stdout:flush()
	end
	local line = io.stdin:read("*l")
	if not line or line == "quit" then
		tex.print("\\global\\drawrun=0 ")
		return
	end
	os.remove("work/result.json")
	tex.print("\\webtexpicture{work/picture}\\directlua{draw_done()}")
end

function draw_done()
	io.stdout:write("\n" .. DONE .. "\n")
	io.stdout:flush()
end
