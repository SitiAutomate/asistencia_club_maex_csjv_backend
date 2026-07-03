import fs from 'fs';

const SIGNATURES = [
  { mime: 'image/jpeg', ext: '.jpg', bytes: [0xff, 0xd8, 0xff] },
  { mime: 'image/png', ext: '.png', bytes: [0x89, 0x50, 0x4e, 0x47] },
  {
    mime: 'image/webp',
    ext: '.webp',
    bytes: [0x52, 0x49, 0x46, 0x46],
    extraCheck: (buf) => buf.length >= 12 && buf.slice(8, 12).toString('ascii') === 'WEBP',
  },
];

export function detectImageFromBuffer(buffer) {
  if (!buffer || buffer.length < 4) return null;
  for (const sig of SIGNATURES) {
    const matches = sig.bytes.every((byte, i) => buffer[i] === byte);
    if (!matches) continue;
    if (sig.extraCheck && !sig.extraCheck(buffer)) continue;
    return { mime: sig.mime, ext: sig.ext };
  }
  return null;
}

export function validateImageMagicBytes(filePath) {
  const fd = fs.openSync(filePath, 'r');
  try {
    const buffer = Buffer.alloc(16);
    const bytesRead = fs.readSync(fd, buffer, 0, 16, 0);
    return detectImageFromBuffer(buffer.subarray(0, bytesRead));
  } finally {
    fs.closeSync(fd);
  }
}

export function hasSuspiciousDoubleExtension(originalName) {
  const base = String(originalName || '').toLowerCase();
  const parts = base.split('.').filter(Boolean);
  if (parts.length < 3) return false;
  const dangerous = new Set(['php', 'exe', 'js', 'html', 'htm', 'sh', 'bat', 'cmd']);
  return parts.slice(0, -1).some((part) => dangerous.has(part));
}
