#!/usr/bin/env python3
"""Genera los íconos PNG de la PWA sin dependencias externas.

Diseño: fondo oscuro y tres barras — verde (hecho), celeste (en curso) y roja
(la que no era tuya). Es literalmente la pantalla de las 3 prioridades.

Uso: python3 tools/make-icons.py
"""
import struct, zlib, os

FONDO   = (23, 26, 35)
PLACA   = (17, 19, 26)
VERDE   = (158, 206, 106)
ACENTO  = (125, 207, 255)
ROJO    = (247, 118, 142)

def png(path, w, h, px):
    def chunk(tipo, datos):
        c = struct.pack('>I', len(datos)) + tipo + datos
        return c + struct.pack('>I', zlib.crc32(tipo + datos) & 0xffffffff)
    raw = b''.join(b'\x00' + bytes(px[y * w * 4:(y + 1) * w * 4]) for y in range(h))
    data = (b'\x89PNG\r\n\x1a\n'
            + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0))
            + chunk(b'IDAT', zlib.compress(raw, 9))
            + chunk(b'IEND', b''))
    open(path, 'wb').write(data)

def lienzo(size, color):
    px = bytearray(size * size * 4)
    for i in range(size * size):
        px[i*4:i*4+4] = bytes(color) + b'\xff'
    return px

def rect(px, size, x0, y0, x1, y1, color, radio=0):
    for y in range(max(0, int(y0)), min(size, int(y1))):
        for x in range(max(0, int(x0)), min(size, int(x1))):
            if radio:
                cx = min(max(x, x0 + radio), x1 - radio)
                cy = min(max(y, y0 + radio), y1 - radio)
                if (x - cx) ** 2 + (y - cy) ** 2 > radio ** 2:
                    continue
            i = (y * size + x) * 4
            px[i:i+3] = bytes(color)

def icono(size, maskable=False):
    px = lienzo(size, PLACA if not maskable else FONDO)
    u = size / 100.0
    if not maskable:
        rect(px, size, 6*u, 6*u, 94*u, 94*u, FONDO, radio=20*u)
        m = 20   # márgenes internos en unidades de 1%
    else:
        m = 28   # zona segura del maskable (círculo interior)
    ancho = 100 - 2*m
    alto = 9
    hueco = 7
    total = 3*alto + 2*hueco
    y = (100 - total) / 2
    for color, largo in ((VERDE, 1.0), (ACENTO, 0.78), (ROJO, 0.55)):
        rect(px, size, m*u, y*u, (m + ancho*largo)*u, (y + alto)*u, color, radio=(alto/2)*u)
        y += alto + hueco
    return px

raiz = os.path.join(os.path.dirname(__file__), '..', 'icons')
os.makedirs(raiz, exist_ok=True)
for size in (192, 512):
    png(os.path.join(raiz, f'icon-{size}.png'), size, size, icono(size))
png(os.path.join(raiz, 'icon-maskable-512.png'), 512, 512, icono(512, maskable=True))
print('íconos generados en', os.path.normpath(raiz))
