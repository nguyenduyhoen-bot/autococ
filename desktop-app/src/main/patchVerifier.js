const crypto = require('crypto');

// Ed25519 Public Key for verifying CAT Manager Patches (Embedded in Desktop App)
const ED25519_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAoFl3u2FT1MRvkQGbslYfaSAopqfWxl4pHoeddyny3U4=
-----END PUBLIC KEY-----`;

/**
 * Verify Ed25519 Digital Signature of data using embedded public key
 * @param {Buffer|string} data - Payload that was signed (e.g. SHA256SUMS or patch package hash)
 * @param {string|Buffer} signature - Hex or base64 or raw Buffer signature
 * @returns {boolean}
 */
function verifyPatchSignature(data, signature) {
  try {
    if (!data || !signature) return false;
    const sigBuffer = Buffer.isBuffer(signature) 
      ? signature 
      : (typeof signature === 'string' && /^[0-9a-fA-F]+$/.test(signature.trim()))
        ? Buffer.from(signature.trim(), 'hex')
        : Buffer.from(signature.trim(), 'base64');

    const dataBuffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
    return crypto.verify(null, dataBuffer, ED25519_PUBLIC_KEY_PEM, sigBuffer);
  } catch (err) {
    console.error('[PatchVerifier] Signature verification error:', err.message);
    return false;
  }
}

/**
 * Compute SHA256 checksum of a buffer or string
 */
function computeSha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex').toLowerCase();
}

module.exports = {
  verifyPatchSignature,
  computeSha256,
  ED25519_PUBLIC_KEY_PEM
};
