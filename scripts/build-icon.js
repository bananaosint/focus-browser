const fs = require('fs')
const path = require('path')
const zlib = require('zlib')

// Same hand-rolled PNG encoder as src/main/trayIcon.js, duplicated here on
// purpose — this is a build-time script, not app runtime code, so it
// shouldn't depend on anything under src/main (keeps `npm run build:icon`
// runnable standalone, independent of Electron being installed at all).
let crcTable = null
function crc32(buf) {
  if (!crcTable) {
    crcTable = new Uint32Array(256)
    for (let n = 0; n < 256; n++) {
      let c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      crcTable[n] = c >>> 0
    }
  }
  let crc = 0xffffffff
  for (let i = 0; i < buf.length; i++) crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const typeData = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(typeData), 0)
  return Buffer.concat([len, typeData, crc])
}

function buildDotPng(hexColor, size) {
  const r = parseInt(hexColor.slice(1, 3), 16)
  const g = parseInt(hexColor.slice(3, 5), 16)
  const b = parseInt(hexColor.slice(5, 7), 16)
  const stride = size * 4
  const raw = Buffer.alloc(size * (1 + stride))
  const cx = size / 2
  const cy = size / 2
  const radius = size / 2 - Math.max(1, size * 0.04)

  for (let y = 0; y < size; y++) {
    const rowStart = y * (1 + stride)
    raw[rowStart] = 0 // filter type: none
    for (let x = 0; x < size; x++) {
      const dx = x - cx + 0.5
      const dy = y - cy + 0.5
      const dist = Math.sqrt(dx * dx + dy * dy)
      const alpha = dist <= radius ? 255 : dist <= radius + 1 ? Math.round(255 * (radius + 1 - dist)) : 0
      const p = rowStart + 1 + x * 4
      raw[p] = r
      raw[p + 1] = g
      raw[p + 2] = b
      raw[p + 3] = alpha
    }
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type: RGBA

  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const idat = zlib.deflateSync(raw)
  return Buffer.concat([signature, pngChunk('IHDR', ihdr), pngChunk('IDAT', idat), pngChunk('IEND', Buffer.alloc(0))])
}

// Windows Vista+ accepts PNG-compressed frames inside an .ico container at
// any size — no need to also hand-roll the older BMP/DIB icon format this
// app (Windows 10/11 only, per the README) will never actually need.
function buildIco(hexColor, sizes) {
  const images = sizes.map((size) => buildDotPng(hexColor, size))
  const headerSize = 6 + 16 * sizes.length
  let offset = headerSize

  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0) // reserved
  header.writeUInt16LE(1, 2) // type: icon
  header.writeUInt16LE(sizes.length, 4)

  const entries = sizes.map((size, i) => {
    const png = images[i]
    const entry = Buffer.alloc(16)
    entry[0] = size >= 256 ? 0 : size // 0 means 256 in ICO's one-byte dimension field
    entry[1] = size >= 256 ? 0 : size
    entry[2] = 0 // no palette
    entry[3] = 0 // reserved
    entry.writeUInt16LE(1, 4) // color planes
    entry.writeUInt16LE(32, 6) // bits per pixel
    entry.writeUInt32LE(png.length, 8)
    entry.writeUInt32LE(offset, 12)
    offset += png.length
    return entry
  })

  return Buffer.concat([header, ...entries, ...images])
}

const OUT_DIR = path.join(__dirname, '..', 'build')
fs.mkdirSync(OUT_DIR, { recursive: true })
const outPath = path.join(OUT_DIR, 'icon.ico')

const srcPngPath = path.join(__dirname, '..', 'src', 'chrome', 'assets', 'icon.png')
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

// ICO's Vista+ "PNG frame" entries must actually contain PNG-encoded data —
// embedding anything else (e.g. a JPEG saved with a .png extension) produces
// a .ico Windows silently can't decode, which just falls back to Electron's
// own default icon with no error anywhere. Checking the real signature
// here, not just the file extension, is what catches that.
const isRealPng = fs.existsSync(srcPngPath) && fs.readFileSync(srcPngPath).slice(0, 8).equals(PNG_SIGNATURE)

if (isRealPng) {
  try {
    const pngBuffer = fs.readFileSync(srcPngPath)
    const header = Buffer.alloc(6)
    header.writeUInt16LE(0, 0)
    header.writeUInt16LE(1, 2)
    header.writeUInt16LE(1, 4)

    const entry = Buffer.alloc(16)
    entry[0] = 0
    entry[1] = 0
    entry[2] = 0
    entry[3] = 0
    entry.writeUInt16LE(1, 4)
    entry.writeUInt16LE(32, 6)
    entry.writeUInt32LE(pngBuffer.length, 8)
    entry.writeUInt32LE(22, 12)

    const icoBuffer = Buffer.concat([header, entry, pngBuffer])
    fs.writeFileSync(outPath, icoBuffer)
    console.log(`Wrote custom high-definition icon from ${srcPngPath} to ${outPath} (${icoBuffer.length} bytes)`)
  } catch (err) {
    console.error('Failed to compile custom icon from PNG:', err)
  }
} else {
  if (fs.existsSync(srcPngPath)) {
    console.error(`${srcPngPath} exists but isn't actually a PNG (wrong signature) — falling back to the default icon instead of writing a corrupt .ico. Re-export it as a real PNG to use it.`)
  }
  const ico = buildIco('#5b8def', [16, 32, 48, 256])
  fs.writeFileSync(outPath, ico)
  console.log(`Wrote default blue circle icon to ${outPath} (${ico.length} bytes)`)
}
