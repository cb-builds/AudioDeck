const fs = require('fs');

// Default TTL for clips (1 hour)
const ONE_HOUR_MS = 60 * 60 * 1000;

function computeExpiry(createdAtMs, ttlMs = ONE_HOUR_MS) {
  return createdAtMs + ttlMs;
}

function getMetaPath(filePath) {
  return `${filePath}.meta.json`;
}

function writeExpiryMeta(filePath, options = {}) {
  const now = Date.now();
  const ttlMs = options.ttlMs || ONE_HOUR_MS;
  const meta = {
    createdAt: now,
    ttlMs,
    expiryAt: computeExpiry(now, ttlMs),
    originalFilename: options.originalFilename || undefined,
  };
  try {
    fs.writeFileSync(getMetaPath(filePath), JSON.stringify(meta, null, 2));
  } catch (err) {
    // Non-fatal; cleanup will fallback to mtime if meta missing
    // eslint-disable-next-line no-console
    console.warn('Failed to write expiry meta for', filePath, err.message);
  }
  return meta;
}

function readExpiryMeta(filePath) {
  try {
    const raw = fs.readFileSync(getMetaPath(filePath), 'utf-8');
    const meta = JSON.parse(raw);
    return meta && typeof meta.expiryAt === 'number' ? meta : null;
  } catch (_) {
    return null;
  }
}

module.exports = {
  ONE_HOUR_MS,
  computeExpiry,
  getMetaPath,
  writeExpiryMeta,
  readExpiryMeta,
};


