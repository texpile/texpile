# electron/icon.png -> electron/icon.icns. macOS scrambles PNG data in the icp4/icp5/icp6 slots
# on non-Retina paths (the noise in the dmg title bar), so 32px goes in as legacy RGB+mask and
# 16px is left out on purpose: the thin glyph is haze at that size, a downscaled 32 reads better.
import struct
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'electron' / 'icon.png'
OUT = ROOT / 'electron' / 'icon.icns'

PNG_SLOTS = [('ic11', 32), ('ic12', 64), ('ic07', 128), ('ic08', 256), ('ic09', 512), ('ic10', 1024), ('ic13', 512), ('ic14', 1024)]


def rle(channel: bytes) -> bytes:
    out = bytearray()
    i, n = 0, len(channel)
    while i < n:
        run = 1
        while i + run < n and run < 130 and channel[i + run] == channel[i]:
            run += 1
        if run >= 3:
            out += bytes([0x80 + run - 3, channel[i]])
            i += run
            continue
        j = i
        while j < n and j - i < 128:
            nxt = 1
            while j + nxt < n and nxt < 3 and channel[j + nxt] == channel[j]:
                nxt += 1
            if nxt >= 3:
                break
            j += 1
        out += bytes([j - i - 1]) + channel[i:j]
        i = j
    return bytes(out)


def legacy_rgb(im: Image.Image) -> tuple[bytes, bytes]:
    px = im.convert('RGBA').load()
    w, h = im.size
    chans = [bytearray() for _ in range(3)]
    mask = bytearray()
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a == 0:
                r = g = b = 0
            chans[0].append(r)
            chans[1].append(g)
            chans[2].append(b)
            mask.append(a)
    return rle(chans[0]) + rle(chans[1]) + rle(chans[2]), bytes(mask)


def png_bytes(im: Image.Image, size: int) -> bytes:
    from io import BytesIO

    buf = BytesIO()
    im.resize((size, size), Image.LANCZOS).save(buf, 'PNG', optimize=True)
    return buf.getvalue()


def main() -> None:
    src = Image.open(SRC).convert('RGBA')
    if src.size != (1024, 1024):
        sys.exit(f'{SRC} must be 1024x1024, got {src.size}')
    entries: list[tuple[str, bytes]] = []
    rgb, mask = legacy_rgb(src.resize((32, 32), Image.LANCZOS))
    entries.append(('il32', rgb))
    entries.append(('l8mk', mask))
    cache: dict[int, bytes] = {}
    for slot, size in PNG_SLOTS:
        cache.setdefault(size, png_bytes(src, size))
        entries.append((slot, cache[size]))
    body = b''.join(struct.pack('>4sI', t.encode('ascii'), 8 + len(d)) + d for t, d in entries)
    OUT.write_bytes(b'icns' + struct.pack('>I', 8 + len(body)) + body)
    print(f'wrote {OUT} ({8 + len(body)} bytes): ' + ' '.join(t for t, _ in entries))


if __name__ == '__main__':
    main()
