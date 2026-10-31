const os = require('os');
const crypto = require('crypto');

function getMachineFingerprint() {
  const parts = [];
  parts.push(os.platform());
  parts.push(os.arch());
  parts.push(os.hostname());
  parts.push(os.totalmem().toString());

  // Collect network interface MACs
  const interfaces = os.networkInterfaces();
  const macs = [];
  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name]) {
      if (net.mac && net.mac !== '00:00:00:00:00:00') {
        macs.push(net.mac);
      }
    }
  }
  macs.sort();
  parts.push(macs.join(','));

  const raw = parts.join('|');
  const hash = crypto.createHash('sha256').update(raw).digest('hex');
  return `CAT-HW-${hash.substring(0, 16).toUpperCase()}`;
}

module.exports = {
  getMachineFingerprint
};

