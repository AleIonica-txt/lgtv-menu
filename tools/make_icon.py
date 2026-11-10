# Genera un icono PNG 80x80 (requisito de webOS) sin dependencias externas.
import struct
import sys
import zlib

SIZE = 80
BG = (230, 57, 70)
FG = (255, 255, 255)


def pixel(x, y):
    # Triángulo de "play" blanco sobre fondo rojo.
    if 26 <= x <= 58 and abs(y - 40) <= (x - 26) * 0.55 and abs(y - 40) <= (58 - x) * 1.2:
        return FG
    return BG


rows = b"".join(
    b"\x00" + bytes(c for x in range(SIZE) for c in pixel(x, y)) for y in range(SIZE)
)


def chunk(kind, data):
    return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))


png = (
    b"\x89PNG\r\n\x1a\n"
    + chunk(b"IHDR", struct.pack(">IIBBBBB", SIZE, SIZE, 8, 2, 0, 0, 0))
    + chunk(b"IDAT", zlib.compress(rows))
    + chunk(b"IEND", b"")
)
open(sys.argv[1], "wb").write(png)
