// server/lib/imageType.js
//
// Works out what kind of image a file really is from its first bytes (its
// "magic number"), not from its name or the type the browser claims: both of
// those are just text the uploader chose. Only these four types are allowed.
// SVG is left out on purpose: it's a text format that can contain scripts.

const TYPES = [
  { ext: 'png', mime: 'image/png', matches: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { ext: 'jpg', mime: 'image/jpeg', matches: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: 'gif', mime: 'image/gif', matches: (b) => ['GIF87a', 'GIF89a'].includes(b.toString('latin1', 0, 6)) },
  { ext: 'webp', mime: 'image/webp', matches: (b) => b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP' },
];

// Returns { ext, mime } for an allowed image, or null for anything else.
export function imageType(buffer) {
  if (!buffer || buffer.length < 12) return null;
  const type = TYPES.find((t) => t.matches(buffer));
  return type ? { ext: type.ext, mime: type.mime } : null;
}
