#!/usr/bin/env node
/**
 * Smart Site mark: the single source for every icon asset Property Explorer serves.
 *
 * Two drawings, one set of colours, no dependencies:
 *   public/icons/icon-192.svg, public/icons/icon-512.svg, public/icon-192.svg   SVG text, MARK_SVG
 *   public/favicon-32.png (32x32), public/apple-touch-icon.png (180x180)        rasterised here, MARK_RASTER
 *   public/favicon.ico                                                          one ICO entry wrapping favicon-32.png
 *
 * Tile is --ss-ink #323234 (the component fill) since 2026-08-30 on every asset. The mark
 * itself, a #FBFBFC crosshair and an #E8963B dot, is unchanged. The web manifest's
 * theme_color and background_color stay at --ss-void on purpose (browser chrome tint and
 * splash, not the mark) and are not written here.
 *
 *   node scripts/render-mark.mjs              write every asset (prints path, bytes, sha256)
 *   node scripts/render-mark.mjs --check      decode the assets on disk, assert pixels, ICO, SVG fill,
 *                                             cache-busters; exit 1 on any finding
 *   node scripts/render-mark.mjs --self-test  prove each assertion fails on a violating render and
 *                                             that the PNG and ICO codecs round-trip; exit 1 on failure
 *
 * Rasters are rendered by scaling the geometry to the target size with 4x4 subsamples per
 * pixel, never by resampling a bitmap. PNGs are RGBA 8-bit, filter type 0 on every row, one
 * IDAT; the decoder here refuses any other filter type rather than guessing.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync, inflateSync } from "node:zlib";

export const COLOURS = Object.freeze({
  tile: "#323234", // --ss-ink, component fill
  white: "#FBFBFC", // crosshair and ring
  gold: "#E8963B", // --ss-gold, centre dot
});

/** Bumped whenever the assets change so browsers refetch the icon links. */
export const CACHE_BUST = "ss-ink-1";

export const RENDERED_ON = "2026-08-30";

/**
 * SVG geometry, exactly as the SVG carries it: a 192 box, a rounded tile, and a group
 * translated (20,20) and scaled 2 in which the mark is drawn in 76-unit coordinates.
 */
export const MARK_SVG = Object.freeze({
  box: 192,
  rx: 36,
  translate: 20,
  scale: 2,
  centre: 38,
  ringR: 30,
  ringStroke: 4,
  dotR: 6,
  lineStroke: 4,
  armEnd: 18, // each arm runs from the group edge (0 or 76) to 18 units in; stroke-linecap is the SVG default (butt)
  extent: 76,
});

/**
 * Raster geometry, as fractions of the tile with the centre at (0.5, 0.5).
 *
 * Why two geometries. The SVGs are the mark as designed: the crosshair inset in a rounded
 * tile with transparent corners. The three rasters are what the Claude connector card and
 * iOS display, and they have always carried a different drawing: the same mark scaled about
 * 1.25x about the centre, its four ticks running outward through the ring to the border, on
 * a SQUARE tile with alpha 255 everywhere. Apple paints transparent corners black and both
 * hosts round the tile themselves, so the rasters keep that full-bleed drawing and change
 * only the tile colour (planner ruling 2026-08-30 on the operator's colour-only ask).
 *
 * The numbers were measured from the b6b00d1 apple-touch-icon.png and favicon-32.png by
 * decoding them, coverage-weighted (180 / 32): dot r 0.0787 / 0.0782; ring half-coverage
 * span 0.367..0.419 / 0.367..0.422; tick width 0.0521 / 0.0509, centred at 0.500; tick inner
 * end 0.240 (180); ticks fully white on the border row; no pixel below alpha 255; corners
 * are tile. A rounding radius of 0 means a square tile with nothing transparent.
 */
export const MARK_RASTER = Object.freeze({
  rx: 0,
  ringIn: 0.368,
  ringOut: 0.42,
  dot: 0.079,
  tickHalf: 0.026,
  tickIn: 0.24,
  tickOut: 0.5,
});

/** MARK_SVG in the same fraction space, so both drawings go through the one rasteriser. */
export function svgMarkAsFractions(m = MARK_SVG) {
  const c = m.translate + m.centre * m.scale;
  return Object.freeze({
    rx: m.rx / m.box,
    ringIn: ((m.ringR - m.ringStroke / 2) * m.scale) / m.box,
    ringOut: ((m.ringR + m.ringStroke / 2) * m.scale) / m.box,
    dot: (m.dotR * m.scale) / m.box,
    tickHalf: ((m.lineStroke / 2) * m.scale) / m.box,
    tickIn: (c - (m.translate + m.armEnd * m.scale)) / m.box,
    tickOut: (c - m.translate) / m.box,
  });
}

export const SIZES = Object.freeze({ favicon: 32, apple: 180, svgSmall: 192, svgLarge: 512 });

const HERE = dirname(fileURLToPath(import.meta.url));
export const APP_DIR = resolve(HERE, "..");
export const PUBLIC_DIR = join(APP_DIR, "public");

// ---------------------------------------------------------------------------
// SVG text

function num(value, decimals) {
  return value.toFixed(decimals).replace(/\.?0+$/, "");
}

/** The six mark elements, in group units; identical at every size. */
export function markElements(colours = COLOURS) {
  const { centre, ringR, ringStroke, dotR, lineStroke, armEnd, extent } = MARK_SVG;
  const far = extent - armEnd;
  return [
    `<circle cx="${centre}" cy="${centre}" r="${ringR}" stroke="${colours.white}" stroke-width="${ringStroke}" fill="none"/>`,
    `<circle cx="${centre}" cy="${centre}" r="${dotR}" fill="${colours.gold}"/>`,
    `<line x1="${centre}" y1="0" x2="${centre}" y2="${armEnd}" stroke="${colours.white}" stroke-width="${lineStroke}"/>`,
    `<line x1="${centre}" y1="${far}" x2="${centre}" y2="${extent}" stroke="${colours.white}" stroke-width="${lineStroke}"/>`,
    `<line x1="0" y1="${centre}" x2="${armEnd}" y2="${centre}" stroke="${colours.white}" stroke-width="${lineStroke}"/>`,
    `<line x1="${far}" y1="${centre}" x2="${extent}" y2="${centre}" stroke="${colours.white}" stroke-width="${lineStroke}"/>`,
  ];
}

export function svgText(size, colours = COLOURS) {
  const k = size / MARK_SVG.box;
  const t = num(MARK_SVG.translate * k, 3);
  const s = num(MARK_SVG.scale * k, 5);
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" role="img" aria-label="Smart Site">`,
    `  <!-- Light Charcoal --ss-ink tile (${colours.tile}), ${RENDERED_ON}, rendered by scripts/render-mark.mjs. The Stone --ss-void tile is retired. -->`,
    `  <rect width="${size}" height="${size}" rx="${num(MARK_SVG.rx * k, 3)}" fill="${colours.tile}"/>`,
    `  <g transform="translate(${t},${t}) scale(${s})">`,
    ...markElements(colours).map((el) => `    ${el}`),
    `  </g>`,
    `</svg>`,
  ].join("\n") + "\n";
}

// ---------------------------------------------------------------------------
// Rasteriser

export function hexToRgb(hex) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) throw new Error(`not a 6-digit hex colour: ${hex}`);
  const v = parseInt(m[1], 16);
  return [(v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff];
}

function palette(colours) {
  return { tile: hexToRgb(colours.tile), white: hexToRgb(colours.white), gold: hexToRgb(colours.gold) };
}

/** Colour at a point (u, v) in tile fractions, or null outside a rounded tile. Paint order follows the SVG. */
function sampleAt(u, v, g, pal) {
  if (u < 0 || v < 0 || u > 1 || v > 1) return null;
  if (g.rx > 0) {
    const cx = Math.min(Math.max(u, g.rx), 1 - g.rx);
    const cy = Math.min(Math.max(v, g.rx), 1 - g.rx);
    if ((u - cx) ** 2 + (v - cy) ** 2 > g.rx * g.rx) return null;
  }
  const dx = u - 0.5;
  const dy = v - 0.5;
  const r = Math.hypot(dx, dy);
  if (r >= g.ringIn && r <= g.ringOut) return pal.white;
  if (r <= g.dot) return pal.gold;
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  const onVerticalTick = ax <= g.tickHalf && ay >= g.tickIn && ay <= g.tickOut;
  const onHorizontalTick = ay <= g.tickHalf && ax >= g.tickIn && ax <= g.tickOut;
  if (onVerticalTick || onHorizontalTick) return pal.white;
  return pal.tile;
}

export const SUPERSAMPLE = 4;

/** RGBA (straight alpha) at size x size, 4x4 subsamples per pixel, geometry given in tile fractions. */
export function rasterize(size, geometry = MARK_RASTER, colours = COLOURS) {
  const pal = palette(colours);
  const out = new Uint8Array(size * size * 4);
  const n = SUPERSAMPLE;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let hits = 0;
      let r = 0;
      let g = 0;
      let b = 0;
      for (let sy = 0; sy < n; sy++) {
        for (let sx = 0; sx < n; sx++) {
          const u = (x + (sx + 0.5) / n) / size;
          const v = (y + (sy + 0.5) / n) / size;
          const c = sampleAt(u, v, geometry, pal);
          if (c) {
            hits++;
            r += c[0];
            g += c[1];
            b += c[2];
          }
        }
      }
      const i = (y * size + x) * 4;
      if (hits > 0) {
        out[i] = Math.round(r / hits);
        out[i + 1] = Math.round(g / hits);
        out[i + 2] = Math.round(b / hits);
        out[i + 3] = Math.round((hits * 255) / (n * n));
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// PNG codec (RGBA 8-bit, filter 0 rows)

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

export function encodePng(width, height, rgba) {
  if (rgba.length !== width * height * 4) {
    throw new Error(`rgba length ${rgba.length} is not ${width}x${height}x4`);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter method
  ihdr[12] = 0; // no interlace
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter type 0 (None)
    raw.set(rgba.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  }
  return Buffer.concat([
    PNG_SIG,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

/** Decodes the subset this file emits (RGBA 8-bit, non-interlaced, filter 0 rows); refuses anything else. */
export function decodePng(buf) {
  if (buf.length < 8 || !buf.subarray(0, 8).equals(PNG_SIG)) throw new Error("not a PNG: bad signature");
  let p = 8;
  let width = 0;
  let height = 0;
  let sawIhdr = false;
  const idat = [];
  while (p + 12 <= buf.length) {
    const len = buf.readUInt32BE(p);
    const type = buf.subarray(p + 4, p + 8).toString("ascii");
    const data = buf.subarray(p + 8, p + 8 + len);
    const crc = buf.readUInt32BE(p + 8 + len);
    if (crc !== crc32(buf.subarray(p + 4, p + 8 + len))) throw new Error(`PNG chunk ${type}: CRC mismatch`);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      const [depth, colour, , , interlace] = [data[8], data[9], data[10], data[11], data[12]];
      if (depth !== 8 || colour !== 6 || interlace !== 0) {
        throw new Error(`PNG IHDR unsupported: depth ${depth} colour ${colour} interlace ${interlace}`);
      }
      sawIhdr = true;
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      break;
    }
    p += 12 + len;
  }
  if (!sawIhdr) throw new Error("PNG has no IHDR");
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * 4;
  if (raw.length !== (stride + 1) * height) throw new Error(`PNG raw length ${raw.length} != ${(stride + 1) * height}`);
  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    if (filter !== 0) throw new Error(`PNG row ${y}: unsupported filter type ${filter} (this decoder handles 0 only)`);
    rgba.set(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)), y * stride);
  }
  return { width, height, rgba };
}

export function pixelAt(img, x, y) {
  if (x < 0 || y < 0 || x >= img.width || y >= img.height) throw new Error(`pixel (${x},${y}) outside ${img.width}x${img.height}`);
  const i = (y * img.width + x) * 4;
  return [img.rgba[i], img.rgba[i + 1], img.rgba[i + 2], img.rgba[i + 3]];
}

// ---------------------------------------------------------------------------
// ICO wrapper: 6-byte header, one 16-byte directory entry, PNG payload

export const ICO_HEADER_BYTES = 6;
export const ICO_ENTRY_BYTES = 16;

export function encodeIco(png, size) {
  const header = Buffer.alloc(ICO_HEADER_BYTES);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(1, 4); // one image
  const entry = Buffer.alloc(ICO_ENTRY_BYTES);
  entry[0] = size === 256 ? 0 : size; // width
  entry[1] = size === 256 ? 0 : size; // height
  entry[2] = 0; // palette colours
  entry[3] = 0; // reserved
  entry.writeUInt16LE(1, 4); // colour planes
  entry.writeUInt16LE(32, 6); // bits per pixel
  entry.writeUInt32LE(png.length, 8);
  entry.writeUInt32LE(ICO_HEADER_BYTES + ICO_ENTRY_BYTES, 12);
  return Buffer.concat([header, entry, png]);
}

export function icoEntries(buf) {
  if (buf.length < ICO_HEADER_BYTES) throw new Error("ICO too short for a header");
  if (buf.readUInt16LE(0) !== 0 || buf.readUInt16LE(2) !== 1) throw new Error("ICO header is not reserved=0,type=1");
  const count = buf.readUInt16LE(4);
  const entries = [];
  for (let i = 0; i < count; i++) {
    const at = ICO_HEADER_BYTES + i * ICO_ENTRY_BYTES;
    const size = buf.readUInt32LE(at + 8);
    const offset = buf.readUInt32LE(at + 12);
    entries.push({
      width: buf[at] === 0 ? 256 : buf[at],
      height: buf[at + 1] === 0 ? 256 : buf[at + 1],
      planes: buf.readUInt16LE(at + 4),
      bpp: buf.readUInt16LE(at + 6),
      size,
      offset,
      bytes: buf.subarray(offset, offset + size),
    });
  }
  return entries;
}

// ---------------------------------------------------------------------------
// Assets

export const ASSET_FILES = Object.freeze([
  "icons/icon-192.svg",
  "icons/icon-512.svg",
  "icon-192.svg", // root copy, byte-identical to icons/icon-192.svg; pinned by src/components/p96-chrome.test.ts, not linked from index.html or the manifest
  "favicon-32.png",
  "favicon.ico",
  "apple-touch-icon.png",
]);

/** Every asset as bytes, keyed by path under public/. SVGs draw MARK_SVG; rasters draw MARK_RASTER. */
export function renderAssets(colours = COLOURS, rasterGeometry = MARK_RASTER) {
  const favicon32 = encodePng(SIZES.favicon, SIZES.favicon, rasterize(SIZES.favicon, rasterGeometry, colours));
  const svg192 = Buffer.from(svgText(SIZES.svgSmall, colours), "utf8");
  return new Map([
    ["icons/icon-192.svg", svg192],
    ["icons/icon-512.svg", Buffer.from(svgText(SIZES.svgLarge, colours), "utf8")],
    ["icon-192.svg", svg192],
    ["favicon-32.png", favicon32],
    ["favicon.ico", encodeIco(favicon32, SIZES.favicon)],
    ["apple-touch-icon.png", encodePng(SIZES.apple, SIZES.apple, rasterize(SIZES.apple, rasterGeometry, colours))],
  ]);
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function writeAssets(publicDir = PUBLIC_DIR) {
  const written = [];
  for (const [rel, bytes] of renderAssets()) {
    const path = join(publicDir, rel);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, bytes);
    written.push({ rel, bytes: bytes.length, sha256: sha256(bytes) });
  }
  return written;
}

// ---------------------------------------------------------------------------
// Check

/**
 * Pre-registered sample pixels (x, y) per raster size, reasoned against MARK_RASTER in tile
 * fractions (centre 0.5; ring 0.368..0.420; ticks |axis offset| <= 0.026 from r 0.240 to the
 * border; dot r 0.079). "Whole pixel" below means all 16 subsample centres.
 *   corners: the four corner pixels; the tile is square, so they are opaque ink.
 *   tile: 32 (3,7)/(28,24) and 180 (20,40)/(160,140): r 0.45..0.49 from the centre, outside
 *     the ring and clear of both ticks by more than a pixel; whole pixel is tile.
 *   centre: the pixel containing (0.5, 0.5); at 32 its far corner is 0.044 from the centre,
 *     inside the 0.079 dot.
 *   ring: 180 (140,140) on the diagonal, r 0.393..0.400 (70.7..72.1 px), all four pixel
 *     corners inside the annulus (66.2..75.6 px). 32 (7,6) on the diagonal, whole pixel
 *     inside the annulus (11.8..13.4 px); at 32 the ring is 1.66 px wide so the sample is
 *     exact for this subsample grid and would read slightly mixed from an analytic renderer.
 *   tick: the border row on the vertical axis, where a tick that reaches the edge is white.
 *     180 (90,3): x 0.500..0.506 lies inside the tick's 0.474..0.526, whole pixel white.
 *     32: the tick is 1.66 px wide centred on the boundary between pixels 15 and 16, so
 *     (15,0) and (16,0) are each 12/16 white; the predicate is white coverage >= 0.5 with
 *     alpha 255 at both sizes, which also fails on a transparent corner or a short tick.
 */
export const RASTER_SAMPLES = Object.freeze({
  32: {
    corners: [[0, 0], [31, 0], [0, 31], [31, 31]],
    tile: [[3, 7], [28, 24]],
    centre: [16, 16],
    ring: [7, 6],
    tick: [[15, 0], [16, 0]],
  },
  180: {
    corners: [[0, 0], [179, 0], [0, 179], [179, 179]],
    tile: [[20, 40], [160, 140]],
    centre: [90, 90],
    ring: [140, 140],
    tick: [[90, 3]],
  },
});

function rgbaText(p) {
  return `rgba(${p.join(",")})`;
}

function expectRgba(findings, samples, label, img, [x, y], want) {
  const got = pixelAt(img, x, y);
  samples.push({ label, x, y, rgba: got });
  const same = got.every((v, i) => v === want[i]);
  if (!same) findings.push(`${label} pixel (${x},${y}): got ${rgbaText(got)}, want ${rgbaText(want)}`);
}

/** Fraction of the way from the tile colour to white, read from the red channel. */
export function whiteCoverage(rgba, colours = COLOURS) {
  const tile = hexToRgb(colours.tile)[0];
  const white = hexToRgb(colours.white)[0];
  return (rgba[0] - tile) / (white - tile);
}

/** Pixel assertions on a decoded raster of the given size. Returns { findings, samples }. */
export function checkPixels(img, size, colours = COLOURS, prefix = `${size}px`) {
  const findings = [];
  const samples = [];
  const s = RASTER_SAMPLES[size];
  if (!s) throw new Error(`no pre-registered samples for size ${size}`);
  if (img.width !== size || img.height !== size) {
    findings.push(`${prefix}: image is ${img.width}x${img.height}, want ${size}x${size}`);
    return { findings, samples };
  }
  const ink = [...hexToRgb(colours.tile), 255];
  for (const xy of s.corners) expectRgba(findings, samples, `${prefix} corner`, img, xy, ink);
  for (const xy of s.tile) expectRgba(findings, samples, `${prefix} tile`, img, xy, ink);
  expectRgba(findings, samples, `${prefix} centre`, img, s.centre, [...hexToRgb(colours.gold), 255]);
  expectRgba(findings, samples, `${prefix} ring`, img, s.ring, [...hexToRgb(colours.white), 255]);
  for (const [x, y] of s.tick) {
    const got = pixelAt(img, x, y);
    samples.push({ label: `${prefix} tick`, x, y, rgba: got });
    const cover = whiteCoverage(got, colours);
    if (got[3] !== 255 || !(cover >= 0.5)) {
      findings.push(`${prefix} tick pixel (${x},${y}): got ${rgbaText(got)} (white coverage ${cover.toFixed(2)}), want alpha 255 and coverage >= 0.5 (tick reaching the border)`);
    }
  }
  return { findings, samples };
}

/** SVG text assertions: the ink fill on the rect, no void hex anywhere, the six mark elements verbatim. */
export function checkSvgText(text, label, colours = COLOURS) {
  const findings = [];
  const rectFill = new RegExp(`<rect[^>]*fill="${colours.tile}"`);
  if (!rectFill.test(text)) findings.push(`${label}: rect does not carry fill="${colours.tile}"`);
  if (/#2a2a2b/i.test(text)) findings.push(`${label}: still mentions #2A2A2B`);
  for (const el of markElements(colours)) {
    if (!text.includes(el)) findings.push(`${label}: missing mark element ${el}`);
  }
  return findings;
}

function readOrNull(path) {
  try {
    return readFileSync(path);
  } catch {
    return null;
  }
}

/** Decodes and asserts the assets on disk plus the cache-busters in index.html and the manifest. */
export function checkAssets({ publicDir = PUBLIC_DIR, appDir = APP_DIR, colours = COLOURS } = {}) {
  const findings = [];
  const samples = [];

  for (const [rel, size] of [["favicon-32.png", SIZES.favicon], ["apple-touch-icon.png", SIZES.apple]]) {
    const bytes = readOrNull(join(publicDir, rel));
    if (!bytes) {
      findings.push(`${rel}: missing`);
      continue;
    }
    try {
      const res = checkPixels(decodePng(bytes), size, colours, rel);
      findings.push(...res.findings);
      samples.push(...res.samples);
    } catch (err) {
      findings.push(`${rel}: ${err.message}`);
    }
  }

  const ico = readOrNull(join(publicDir, "favicon.ico"));
  const png32 = readOrNull(join(publicDir, "favicon-32.png"));
  if (!ico) findings.push("favicon.ico: missing");
  else {
    try {
      const entries = icoEntries(ico);
      if (entries.length !== 1) findings.push(`favicon.ico: ${entries.length} entries, want 1`);
      const e = entries[0];
      if (e && (e.width !== 32 || e.height !== 32 || e.bpp !== 32)) {
        findings.push(`favicon.ico: entry is ${e.width}x${e.height} @ ${e.bpp}bpp, want 32x32 @ 32bpp`);
      }
      if (e && e.offset !== ICO_HEADER_BYTES + ICO_ENTRY_BYTES) findings.push(`favicon.ico: payload offset ${e.offset}, want 22`);
      if (e && png32 && !e.bytes.equals(png32)) findings.push("favicon.ico: embedded PNG bytes differ from favicon-32.png");
    } catch (err) {
      findings.push(`favicon.ico: ${err.message}`);
    }
  }

  for (const rel of ["icons/icon-192.svg", "icons/icon-512.svg", "icon-192.svg"]) {
    const bytes = readOrNull(join(publicDir, rel));
    if (!bytes) findings.push(`${rel}: missing`);
    else findings.push(...checkSvgText(bytes.toString("utf8"), rel, colours));
  }
  const a = readOrNull(join(publicDir, "icons/icon-192.svg"));
  const b = readOrNull(join(publicDir, "icon-192.svg"));
  if (a && b && !a.equals(b)) findings.push("icon-192.svg: root copy differs from icons/icon-192.svg");

  const index = readOrNull(join(appDir, "index.html"));
  if (!index) findings.push("index.html: missing");
  else {
    const text = index.toString("utf8");
    for (const href of ["/favicon.ico", "/icons/icon-192.svg", "/apple-touch-icon.png"]) {
      if (!text.includes(`href="${href}?v=${CACHE_BUST}"`)) findings.push(`index.html: ${href} link does not carry ?v=${CACHE_BUST}`);
    }
  }
  const manifest = readOrNull(join(publicDir, "manifest.webmanifest"));
  if (!manifest) findings.push("manifest.webmanifest: missing");
  else {
    let parsed;
    try {
      parsed = JSON.parse(manifest.toString("utf8"));
    } catch (err) {
      findings.push(`manifest.webmanifest: ${err.message}`);
    }
    if (parsed) {
      for (const src of ["/icons/icon-192.svg", "/icons/icon-512.svg"]) {
        const want = `${src}?v=${CACHE_BUST}`;
        if (!(parsed.icons || []).some((i) => i.src === want)) findings.push(`manifest.webmanifest: no icon src ${want}`);
      }
    }
  }

  return { findings, samples };
}

// ---------------------------------------------------------------------------
// Self-test: every assertion is shown failing on a violating input, and the codecs round-trip.

export function selfTest() {
  const failures = [];
  const must = (cond, msg) => {
    if (!cond) failures.push(msg);
  };
  const render = (size, geometry = MARK_RASTER, colours = COLOURS) =>
    checkPixels(decodePng(encodePng(size, size, rasterize(size, geometry, colours))), size);
  const only = (res, word) => res.findings.length > 0 && res.findings.every((f) => f.includes(word));
  const some = (res, word) => res.findings.some((f) => f.includes(word));

  // PNG round trip, and the CRC guard.
  const w = 7;
  const h = 5;
  const rnd = new Uint8Array(w * h * 4);
  let seed = 0x9e3779b9;
  for (let i = 0; i < rnd.length; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    rnd[i] = seed >>> 24;
  }
  const png = encodePng(w, h, rnd);
  const back = decodePng(png);
  must(back.width === w && back.height === h && Buffer.from(back.rgba).equals(Buffer.from(rnd)), "PNG round trip lost pixels");
  const corrupt = Buffer.from(png);
  corrupt[40] ^= 0xff; // inside IDAT
  let threw = false;
  try {
    decodePng(corrupt);
  } catch {
    threw = true;
  }
  must(threw, "PNG decoder accepted a corrupted chunk");

  // ICO round trip.
  const ico = encodeIco(png, 32);
  const entries = icoEntries(ico);
  must(entries.length === 1 && entries[0].bytes.equals(png) && entries[0].offset === 22, "ICO round trip lost the PNG");

  // Each raster predicate fails on a render that violates it, and all pass on the real render.
  for (const size of [SIZES.favicon, SIZES.apple]) {
    const good = render(size);
    must(good.findings.length === 0, `${size}px: correct render reported ${JSON.stringify(good.findings)}`);

    const voidTile = render(size, MARK_RASTER, { ...COLOURS, tile: "#2A2A2B" });
    must(some(voidTile, "tile pixel") && some(voidTile, "corner pixel"), `${size}px: void tile (#2A2A2B) was not caught on tile and corners`);
    must(voidTile.findings.every((f) => f.includes("tile pixel") || f.includes("corner pixel")), `${size}px: void tile produced unrelated findings ${JSON.stringify(voidTile.findings)}`);

    const wrongDot = render(size, MARK_RASTER, { ...COLOURS, gold: "#E8963A" });
    must(only(wrongDot, "centre pixel"), `${size}px: off-by-one dot colour was not caught cleanly ${JSON.stringify(wrongDot.findings)}`);

    const wrongRing = render(size, MARK_RASTER, { ...COLOURS, white: "#FFFFFF" });
    must(some(wrongRing, "ring pixel"), `${size}px: #FFFFFF ring was not caught`);

    // The SVG drawing (rounded, transparent corners, ticks stopping short of the border) is the
    // exact failure the rasters must not regress to: corners and ticks both fail.
    const svgDrawing = render(size, svgMarkAsFractions());
    must(some(svgDrawing, "corner pixel") && some(svgDrawing, "tick pixel"), `${size}px: SVG-geometry raster was not caught on corners and ticks ${JSON.stringify(svgDrawing.findings)}`);

    const shortTicks = render(size, { ...MARK_RASTER, tickOut: 0.45 });
    must(only(shortTicks, "tick pixel"), `${size}px: ticks stopping at r 0.45 were not caught cleanly ${JSON.stringify(shortTicks.findings)}`);

    const roundedOpaque = render(size, { ...MARK_RASTER, rx: 0.1875 });
    must(some(roundedOpaque, "corner pixel"), `${size}px: rounded tile was not caught on corners`);
  }

  // SVG assertions fail on the void fill and on a moved element.
  const voidSvg = checkSvgText(svgText(192, { ...COLOURS, tile: "#2A2A2B" }), "void");
  must(voidSvg.some((f) => f.includes("does not carry fill")), "SVG check accepted a void rect fill");
  must(voidSvg.some((f) => f.includes("still mentions #2A2A2B")), "SVG check accepted #2A2A2B in the text");
  const movedSvg = checkSvgText(svgText(192).replace('r="6"', 'r="7"'), "moved");
  must(movedSvg.some((f) => f.includes("missing mark element")), "SVG check accepted a changed dot radius");
  must(checkSvgText(svgText(192), "good").length === 0, "SVG check rejected the correct text");

  return failures;
}

// ---------------------------------------------------------------------------
// CLI

function isMain() {
  if (!process.argv[1]) return false;
  const norm = (p) => resolve(p).replace(/\\/g, "/").toLowerCase();
  return norm(fileURLToPath(import.meta.url)) === norm(process.argv[1]);
}

if (isMain()) {
  const mode = process.argv[2] ?? "write";
  if (mode === "--self-test") {
    const failures = selfTest();
    if (failures.length) {
      console.error("render-mark self-test FAILED:\n  " + failures.join("\n  "));
      process.exit(1);
    }
    console.log("render-mark self-test passed: PNG/ICO round trip; corner, tile, dot, ring, tick, SVG fill and element assertions each fail on a violating input (void tile, wrong colours, SVG drawing, short ticks, rounded tile).");
  } else if (mode === "--check") {
    const { findings, samples } = checkAssets();
    for (const s of samples) console.log(`  ${s.label} (${s.x},${s.y}) = ${rgbaText(s.rgba)}`);
    if (findings.length) {
      console.error(`render-mark check FAILED (${findings.length} finding${findings.length === 1 ? "" : "s"}):\n  ` + findings.join("\n  "));
      process.exit(1);
    }
    console.log(`render-mark check passed: ${ASSET_FILES.length} assets under ${PUBLIC_DIR}, cache-buster ${CACHE_BUST}.`);
  } else if (mode === "write") {
    for (const w of writeAssets()) console.log(`wrote public/${w.rel}  ${w.bytes} bytes  sha256 ${w.sha256}`);
  } else {
    console.error(`unknown mode ${mode}; use --check, --self-test, or no argument to write`);
    process.exit(2);
  }
}
