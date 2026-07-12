const zlib = require('zlib')
const { nativeImage } = require('electron')

// Hand-rolled PNG encoder for a single filled, anti-aliased dot. A tray icon
// needs *some* image, and pulling in an image library (or shipping a binary
// asset file) for one 32x32 circle is more dependency than the job needs —
// PNG's uncompressed-scanline + zlib format is simple enough to build by hand.
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

function buildDotPng(hexColor, size = 32) {
  const r = parseInt(hexColor.slice(1, 3), 16)
  const g = parseInt(hexColor.slice(3, 5), 16)
  const b = parseInt(hexColor.slice(5, 7), 16)
  const stride = size * 4
  const raw = Buffer.alloc(size * (1 + stride))
  const cx = size / 2
  const cy = size / 2
  const radius = size / 2 - 1.5

  for (let y = 0; y < size; y++) {
    const rowStart = y * (1 + stride)
    raw[rowStart] = 0 // filter type: none
    for (let x = 0; x < size; x++) {
      const dx = x - cx + 0.5
      const dy = y - cy + 0.5
      const dist = Math.sqrt(dx * dx + dy * dy)
      // One-pixel-wide soft edge so the dot isn't jagged at tray size.
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

const cache = new Map()
function dotIcon(hexColor) {
  if (!cache.has(hexColor)) cache.set(hexColor, nativeImage.createFromBuffer(buildDotPng(hexColor)))
  return cache.get(hexColor)
}

module.exports = { dotIcon }
