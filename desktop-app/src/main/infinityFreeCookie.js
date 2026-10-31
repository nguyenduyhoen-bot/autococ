const crypto = require('crypto');

let ifCookie = null;
const DEFAULT_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function resolveInfinityFreeCookie(baseUrl = 'https://cathouse.gt.tc') {
  if (ifCookie) return ifCookie;
  try {
    const initRes = await fetch(`${baseUrl}/`, { headers: { 'User-Agent': DEFAULT_UA } });
    const text = await initRes.text();
    if (text.includes('slowAES.decrypt')) {
      const regex = /toNumbers\("([0-9a-f]+)"\)/g;
      const matches = [...text.matchAll(regex)].map(m => m[1]);
      if (matches.length >= 3) {
        const key = Buffer.from(matches[0], 'hex');
        const iv = Buffer.from(matches[1], 'hex');
        const cipher = Buffer.from(matches[2], 'hex');
        const decipher = crypto.createDecipheriv('aes-128-cbc', key, iv);
        decipher.setAutoPadding(false);
        ifCookie = Buffer.concat([decipher.update(cipher), decipher.final()]).toString('hex');
      }
    }
  } catch (err) {
    console.warn('[InfinityFreeCookie] Notice:', err.message);
  }
  return ifCookie;
}

module.exports = {
  resolveInfinityFreeCookie,
  DEFAULT_UA
};

