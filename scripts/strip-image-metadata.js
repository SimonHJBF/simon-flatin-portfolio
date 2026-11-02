#!/usr/bin/env node
/**
 * Removes metadata (GPS, camera, author, comments) from JPG, PNG and WebP
 * files in place, without re-encoding, so image quality is unchanged.
 * Keeps colour profiles and, for JPGs, the display orientation.
 *
 * Usage: node scripts/strip-image-metadata.js <dir> [<dir> ...]
 */

const fs   = require('fs');
const path = require('path');

// Minimal EXIF holding only the Orientation tag, for JPGs that rely on it.
function orientationSegment(value) {
  const tiff = Buffer.from([
    0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08, // big-endian, IFD at 8
    0x00, 0x01,                                     // one entry
    0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, // Orientation, SHORT, 1
    0x00, value, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00,                         // no next IFD
  ]);
  const body   = Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), tiff]);
  const header = Buffer.from([0xff, 0xe1, 0, 0]);
  header.writeUInt16BE(body.length + 2, 2);
  return Buffer.concat([header, body]);
}

function readOrientation(exif) {
  const tiff = exif.subarray(6);
  if (tiff.length < 8) return 1;
  const le   = tiff.toString('latin1', 0, 2) === 'II';
  const u16  = o => (le ? tiff.readUInt16LE(o) : tiff.readUInt16BE(o));
  const u32  = o => (le ? tiff.readUInt32LE(o) : tiff.readUInt32BE(o));
  const ifd  = u32(4);
  if (ifd + 2 > tiff.length) return 1;
  for (let i = 0; i < u16(ifd); i++) {
    const entry = ifd + 2 + i * 12;
    if (entry + 12 > tiff.length) break;
    if (u16(entry) === 0x0112) return u16(entry + 8);
  }
  return 1;
}

function keepJpegSegment(marker, payload) {
  if (marker === 0xe0) return payload.toString('latin1', 0, 4) === 'JFIF';
  if (marker === 0xe2) return payload.toString('latin1', 0, 11) === 'ICC_PROFILE';
  if (marker === 0xee) return payload.toString('latin1', 0, 5) === 'Adobe'; // needed to decode colours
  return !(marker === 0xfe || (marker >= 0xe1 && marker <= 0xef));
}

function stripJpeg(buf) {
  const out = [buf.subarray(0, 2)];
  let orientation = 1;
  let i = 2;
  while (i + 2 <= buf.length) {
    if (buf[i] !== 0xff) throw new Error('bad JPEG marker');
    const marker = buf[i + 1];
    if (marker === 0xff) { i++; continue; }
    if (marker === 0xd9) { out.push(buf.subarray(i, i + 2)); i += 2; break; }

    const end = i + 2 + buf.readUInt16BE(i + 2);
    const payload = buf.subarray(i + 4, end);
    if (marker === 0xe1 && payload.toString('latin1', 0, 6) === 'Exif\0\0') {
      orientation = readOrientation(payload);
    }
    if (keepJpegSegment(marker, payload)) out.push(buf.subarray(i, end));
    i = end;

    if (marker === 0xda) { // image data runs until the next real marker
      const start = i;
      while (i + 1 < buf.length) {
        if (buf[i] === 0xff && buf[i + 1] !== 0x00 && !(buf[i + 1] >= 0xd0 && buf[i + 1] <= 0xd7)) break;
        i++;
      }
      out.push(buf.subarray(start, i));
    }
  }
  // Anything after the end marker is dropped too: phones append extra images
  // there, each with its own metadata.
  if (orientation > 1 && orientation <= 8) out.splice(1, 0, orientationSegment(orientation));
  return Buffer.concat(out);
}

function stripPng(buf) {
  const drop = new Set(['eXIf', 'tEXt', 'iTXt', 'zTXt', 'tIME']);
  const out  = [buf.subarray(0, 8)];
  for (let i = 8; i + 12 <= buf.length;) {
    const end = i + 12 + buf.readUInt32BE(i);
    if (!drop.has(buf.toString('latin1', i + 4, i + 8))) out.push(buf.subarray(i, end));
    i = end;
  }
  return Buffer.concat(out);
}

function stripWebp(buf) {
  const out = [Buffer.from(buf.subarray(0, 12))];
  for (let i = 12; i + 8 <= buf.length;) {
    const type = buf.toString('latin1', i, i + 4);
    const size = buf.readUInt32LE(i + 4);
    const end  = i + 8 + size + (size & 1);
    if (type !== 'EXIF' && type !== 'XMP ') {
      const chunk = Buffer.from(buf.subarray(i, end));
      if (type === 'VP8X') chunk[8] &= ~0x0c; // clear the EXIF and XMP flags
      out.push(chunk);
    }
    i = end;
  }
  const result = Buffer.concat(out);
  result.writeUInt32LE(result.length - 8, 4);
  return result;
}

function strip(buf) {
  if (buf[0] === 0xff && buf[1] === 0xd8) return stripJpeg(buf);
  if (buf.toString('latin1', 1, 4) === 'PNG') return stripPng(buf);
  if (buf.toString('latin1', 8, 12) === 'WEBP') return stripWebp(buf);
  return buf;
}

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === '.git' || entry.name === 'node_modules' ? [] : walk(full);
    return /\.(jpe?g|png|webp)$/i.test(entry.name) ? [full] : [];
  });
}

const dirs = process.argv.slice(2);
if (!dirs.length) {
  console.error('Usage: node scripts/strip-image-metadata.js <dir> [<dir> ...]');
  process.exit(1);
}

let changed = 0;
const files = dirs.flatMap(walk);
for (const file of files) {
  const before = fs.readFileSync(file);
  const after  = strip(before);
  if (!after.equals(before)) {
    fs.writeFileSync(file, after);
    changed++;
    console.log(`stripped ${file}`);
  }
}
console.log(`strip-image-metadata: ${changed} of ${files.length} files changed.`);
