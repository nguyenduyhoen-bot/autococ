const fs = require('fs');
const path = require('path');
const os = require('os');

function detectAdobeApplications() {
  const isWin = os.platform() === 'win32';
  const isMac = os.platform() === 'darwin';

  const results = {
    premiere: { installed: false, version: null, path: null },
    afterEffects: { installed: false, version: null, path: null }
  };

  if (isWin) {
    const programFiles = process.env['ProgramFiles'] || 'C:\\Program Files';
    const adobeDir = path.join(programFiles, 'Adobe');

    if (fs.existsSync(adobeDir)) {
      try {
        const entries = fs.readdirSync(adobeDir);

        for (const entry of entries) {
          const full = path.join(adobeDir, entry);
          if (entry.toLowerCase().includes('premiere pro')) {
            results.premiere.installed = true;
            results.premiere.path = full;
            // extract year/version like 2024 or 2025
            const match = entry.match(/20\d\d/);
            results.premiere.version = match ? match[0] : 'Installed';
          }
          if (entry.toLowerCase().includes('after effects')) {
            results.afterEffects.installed = true;
            results.afterEffects.path = full;
            const match = entry.match(/20\d\d/);
            results.afterEffects.version = match ? match[0] : 'Installed';
          }
        }
      } catch (err) {
        console.error('Error scanning Adobe dir on Windows:', err.message);
      }
    }
  } else if (isMac) {
    const appsDir = '/Applications';
    if (fs.existsSync(appsDir)) {
      try {
        const entries = fs.readdirSync(appsDir);
        for (const entry of entries) {
          const full = path.join(appsDir, entry);
          if (entry.toLowerCase().includes('premiere pro')) {
            results.premiere.installed = true;
            results.premiere.path = full;
            const match = entry.match(/20\d\d/);
            results.premiere.version = match ? match[0] : 'Installed';
          }
          if (entry.toLowerCase().includes('after effects')) {
            results.afterEffects.installed = true;
            results.afterEffects.path = full;
            const match = entry.match(/20\d\d/);
            results.afterEffects.version = match ? match[0] : 'Installed';
          }
        }
      } catch (err) {
        console.error('Error scanning Adobe dir on macOS:', err.message);
      }
    }
  }

  return results;
}

module.exports = {
  detectAdobeApplications
};

