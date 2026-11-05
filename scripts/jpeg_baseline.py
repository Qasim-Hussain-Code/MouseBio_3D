"""Decode baseline sequential JPEG images using only the Python standard library.

The decoder supports the subset used by the coregistered Digimouse cryosection
slices: 8-bit samples, Huffman-coded baseline or extended sequential frames,
one interleaved scan, one to three components, integer sampling factors and
restart intervals. Progressive, arithmetic-coded, lossless and 12-bit images
are rejected rather than approximated.

The inverse DCT is computed in floating point and rounded, so decoded samples
can differ from other conforming decoders by small amounts. The output is used
for display colour sampling only, never for measurements.
"""
from __future__ import annotations

import math
import struct

ZIGZAG = (
    0, 1, 8, 16, 9, 2, 3, 10, 17, 24, 32, 25, 18, 11, 4, 5,
    12, 19, 26, 33, 40, 48, 41, 34, 27, 20, 13, 6, 7, 14, 21, 28,
    35, 42, 49, 56, 57, 50, 43, 36, 29, 22, 15, 23, 30, 37, 44, 51,
    58, 59, 52, 45, 38, 31, 39, 46, 53, 60, 61, 54, 47, 55, 62, 63,
)
# Separable inverse DCT basis: COSINES[x][u] = c(u) / 2 * cos((2x + 1) u pi / 16).
COSINES = tuple(tuple((math.sqrt(0.5) if u == 0 else 1.0) * 0.5 * math.cos((2 * x + 1) * u * math.pi / 16)
                      for u in range(8)) for x in range(8))
MAX_PIXELS = 64_000_000


class JpegError(ValueError):
    pass


def _huffman_table(counts, symbols):
    """Return a 16-bit lookahead table mapping a code prefix to (length, symbol)."""
    if sum(counts) != len(symbols) or len(symbols) > 256:
        raise JpegError("Malformed Huffman table")
    lengths = bytearray(65536)
    values = bytearray(65536)
    code = 0
    position = 0
    for length in range(1, 17):
        for _ in range(counts[length - 1]):
            if code >= 1 << length:
                raise JpegError("Overfull Huffman table")
            shift = 16 - length
            start, end = code << shift, (code + 1) << shift
            lengths[start:end] = bytes((length,)) * (end - start)
            values[start:end] = bytes((symbols[position],)) * (end - start)
            position += 1
            code += 1
        code <<= 1
    return lengths, values


def _unstuff(data):
    """Remove 0xFF00 byte stuffing and split entropy-coded data at restart markers."""
    segments = []
    current = bytearray()
    index = 0
    length = len(data)
    while index < length:
        found = data.find(b"\xff", index)
        if found < 0:
            current += data[index:]
            break
        current += data[index:found]
        if found + 1 >= length:
            raise JpegError("Truncated entropy-coded segment")
        marker = data[found + 1]
        if marker == 0x00:
            current.append(0xFF)
        elif 0xD0 <= marker <= 0xD7:
            segments.append(bytes(current))
            current = bytearray()
        elif marker == 0xFF:
            index = found + 1
            continue
        else:
            raise JpegError("Unexpected marker inside entropy-coded data")
        index = found + 2
    segments.append(bytes(current))
    return segments


def _idct(block, quant):
    """Dequantize a natural-order coefficient block and return 64 level-shifted samples."""
    coefficients = [block[index] * quant[index] for index in range(64)]
    rows = []
    for v in range(8):
        row = coefficients[v * 8:v * 8 + 8]
        if not any(row[1:]):
            dc = row[0] * COSINES[0][0]
            rows.append((dc,) * 8)
            continue
        rows.append(tuple(sum(cos[u] * row[u] for u in range(8) if row[u]) for cos in COSINES))
    output = [0] * 64
    for x in range(8):
        column = [rows[v][x] for v in range(8)]
        nonzero = [(v, column[v]) for v in range(8) if column[v]]
        for y in range(8):
            cos = COSINES[y]
            value = sum(cos[v] * amount for v, amount in nonzero) + 128
            output[y * 8 + x] = 0 if value < 0 else 255 if value > 255 else int(value + 0.5)
    return output


def decode(data: bytes):
    """Return (width, height, components, pixels) with interleaved 8-bit samples.

    Three-component images are converted from JFIF YCbCr to RGB with
    replicated chroma; one-component images are returned unchanged.
    """
    if data[:2] != b"\xff\xd8":
        raise JpegError("Not a JPEG stream")
    quant = {}
    tables = {}
    frame = None
    restart = 0
    index = 2
    scan = None
    while index < len(data):
        if data[index] != 0xFF:
            raise JpegError("Expected a marker")
        marker = data[index + 1]
        index += 2
        if marker in (0xD8, 0x01) or 0xD0 <= marker <= 0xD7:
            continue
        if marker == 0xD9:
            break
        (segment_length,) = struct.unpack(">H", data[index:index + 2])
        segment = data[index + 2:index + segment_length]
        if len(segment) != segment_length - 2:
            raise JpegError("Truncated marker segment")
        if marker == 0xDB:
            offset = 0
            while offset < len(segment):
                precision, table = segment[offset] >> 4, segment[offset] & 15
                offset += 1
                if precision == 0:
                    values = segment[offset:offset + 64]
                    offset += 64
                else:
                    values = struct.unpack(">64H", segment[offset:offset + 128])
                    offset += 128
                natural = [0] * 64
                for position, value in enumerate(values):
                    natural[ZIGZAG[position]] = value
                quant[table] = natural
        elif marker == 0xC4:
            offset = 0
            while offset < len(segment):
                kind, table = segment[offset] >> 4, segment[offset] & 15
                counts = segment[offset + 1:offset + 17]
                total = sum(counts)
                symbols = segment[offset + 17:offset + 17 + total]
                tables[(kind, table)] = _huffman_table(counts, symbols)
                offset += 17 + total
        elif marker in (0xC0, 0xC1):
            precision, height, width, count = struct.unpack(">BHHB", segment[:6])
            if precision != 8 or not 1 <= count <= 3 or width == 0 or height == 0 or width * height > MAX_PIXELS:
                raise JpegError("Unsupported frame")
            components = []
            for offset in range(6, 6 + 3 * count, 3):
                identifier, sampling, table = segment[offset:offset + 3]
                components.append({"id": identifier, "h": sampling >> 4, "v": sampling & 15, "q": table})
            frame = {"width": width, "height": height, "components": components}
        elif marker in (0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF):
            raise JpegError("Only baseline and extended sequential Huffman JPEG is supported")
        elif marker == 0xDD:
            (restart,) = struct.unpack(">H", segment[:2])
        elif marker == 0xDA:
            count = segment[0]
            selectors = {}
            for offset in range(1, 1 + 2 * count, 2):
                selectors[segment[offset]] = (segment[offset + 1] >> 4, segment[offset + 1] & 15)
            start = index + segment_length
            end = data.find(b"\xff\xd9", start)
            if end < 0:
                raise JpegError("Missing end of image")
            scan = (selectors, data[start:end])
            break
        index += segment_length
    if frame is None or scan is None:
        raise JpegError("Missing frame or scan")
    components = frame["components"]
    selectors, entropy = scan
    if set(selectors) != {component["id"] for component in components}:
        raise JpegError("Only a single interleaved scan is supported")
    hmax = max(component["h"] for component in components)
    vmax = max(component["v"] for component in components)
    width, height = frame["width"], frame["height"]
    mcus_x = -(-width // (8 * hmax))
    mcus_y = -(-height // (8 * vmax))
    planes = []
    for component in components:
        dc_table, ac_table = selectors[component["id"]]
        if (0, dc_table) not in tables or (1, ac_table) not in tables or component["q"] not in quant:
            raise JpegError("Missing coding or quantization table")
        component["dc"] = tables[(0, dc_table)]
        component["ac"] = tables[(1, ac_table)]
        component["quant"] = quant[component["q"]]
        component["stride"] = mcus_x * component["h"] * 8
        planes.append(bytearray(component["stride"] * mcus_y * component["v"] * 8))
    segments = _unstuff(entropy)
    total_mcus = mcus_x * mcus_y
    interval = restart or total_mcus
    if len(segments) < -(-total_mcus // interval):
        raise JpegError("Missing restart segments")
    mcu = 0
    for segment in segments:
        if mcu >= total_mcus:
            break
        accumulator = 0
        bits = 0
        position = 0
        size = len(segment)
        predictors = [0] * len(components)
        for _ in range(min(interval, total_mcus - mcu)):
            my, mx = divmod(mcu, mcus_x)
            for slot, component in enumerate(components):
                dc_lengths, dc_values = component["dc"]
                ac_lengths, ac_values = component["ac"]
                plane = planes[slot]
                stride = component["stride"]
                for by in range(component["v"]):
                    for bx in range(component["h"]):
                        block = [0] * 64
                        # DC coefficient.
                        while bits < 16:
                            accumulator = (accumulator << 8) | (segment[position] if position < size else 0)
                            position += 1
                            bits += 8
                        peek = (accumulator >> (bits - 16)) & 0xFFFF
                        length = dc_lengths[peek]
                        if not length:
                            raise JpegError("Invalid Huffman code")
                        bits -= length
                        category = dc_values[peek]
                        difference = 0
                        if category:
                            while bits < category:
                                accumulator = (accumulator << 8) | (segment[position] if position < size else 0)
                                position += 1
                                bits += 8
                            difference = (accumulator >> (bits - category)) & ((1 << category) - 1)
                            bits -= category
                            if difference < 1 << (category - 1):
                                difference -= (1 << category) - 1
                        predictors[slot] += difference
                        block[0] = predictors[slot]
                        # AC coefficients.
                        k = 1
                        while k < 64:
                            while bits < 16:
                                accumulator = (accumulator << 8) | (segment[position] if position < size else 0)
                                position += 1
                                bits += 8
                            peek = (accumulator >> (bits - 16)) & 0xFFFF
                            length = ac_lengths[peek]
                            if not length:
                                raise JpegError("Invalid Huffman code")
                            bits -= length
                            symbol = ac_values[peek]
                            run, category = symbol >> 4, symbol & 15
                            if category == 0:
                                if run == 15:
                                    k += 16
                                    continue
                                break
                            k += run
                            if k > 63:
                                raise JpegError("Coefficient index out of range")
                            while bits < category:
                                accumulator = (accumulator << 8) | (segment[position] if position < size else 0)
                                position += 1
                                bits += 8
                            value = (accumulator >> (bits - category)) & ((1 << category) - 1)
                            bits -= category
                            if value < 1 << (category - 1):
                                value -= (1 << category) - 1
                            block[ZIGZAG[k]] = value
                            k += 1
                        accumulator &= (1 << bits) - 1
                        samples = _idct(block, component["quant"])
                        row0 = (my * component["v"] + by) * 8
                        col0 = (mx * component["h"] + bx) * 8
                        for y in range(8):
                            start = (row0 + y) * stride + col0
                            plane[start:start + 8] = bytes(samples[y * 8:y * 8 + 8])
            mcu += 1
    if mcu != total_mcus:
        raise JpegError("Entropy-coded data ended early")
    channels = len(components)
    pixels = bytearray(width * height * channels)
    if channels == 1:
        stride = components[0]["stride"]
        for y in range(height):
            pixels[y * width:(y + 1) * width] = planes[0][y * stride:y * stride + width]
        return width, height, 1, bytes(pixels)
    scales = [(hmax // component["h"], vmax // component["v"]) for component in components]
    for (sx, sy), component in zip(scales, components):
        if sx * component["h"] != hmax or sy * component["v"] != vmax:
            raise JpegError("Unsupported sampling factors")
    out = 0
    for y in range(height):
        rows = [plane_row(planes[slot], components[slot]["stride"], y // scales[slot][1]) for slot in range(3)]
        yrow, cbrow, crrow = rows
        for x in range(width):
            yy = yrow[x]
            b = cbrow[x // scales[1][0]] - 128
            r = crrow[x // scales[2][0]] - 128
            red = yy + 1.402 * r
            green = yy - 0.344136 * b - 0.714136 * r
            blue = yy + 1.772 * b
            pixels[out] = 0 if red < 0 else 255 if red > 255 else int(red + 0.5)
            pixels[out + 1] = 0 if green < 0 else 255 if green > 255 else int(green + 0.5)
            pixels[out + 2] = 0 if blue < 0 else 255 if blue > 255 else int(blue + 0.5)
            out += 3
    return width, height, 3, bytes(pixels)


def plane_row(plane, stride, row):
    return plane[row * stride:(row + 1) * stride]
