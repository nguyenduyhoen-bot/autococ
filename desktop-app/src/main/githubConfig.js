const fs = require('fs');
const path = require('path');

/**
 * Loads public GitHub Releases configuration from config/github_config.txt
 * Contains only public repository details, NEVER tokens or secrets.
 */
function loadGithubConfig() {
  const defaultConfig = {
    GITHUB_OWNER: 'nguyenduyhoen-bot',
    GITHUB_REPO: 'autococ-updates',
    GITHUB_API: 'https://api.github.com/repos/nguyenduyhoen-bot/autococ-updates',
    GITHUB_RELEASES_URL: 'https://github.com/nguyenduyhoen-bot/autococ-updates/releases',
    GITHUB_CHANNEL: 'stable',
    GITHUB_LATEST_API: 'https://api.github.com/repos/nguyenduyhoen-bot/autococ-updates/releases/latest',
    GITHUB_UPDATE_CHANNEL: 'stable'
  };

  const candidatePaths = [
    path.resolve(__dirname, '../../../config/github_config.txt'),
    path.resolve(__dirname, '../../../../config/github_config.txt'),
    path.resolve(process.cwd(), 'config/github_config.txt'),
    path.resolve(process.cwd(), '../config/github_config.txt')
  ];

  if (process.resourcesPath) {
    candidatePaths.push(path.resolve(process.resourcesPath, 'config/github_config.txt'));
  }

  for (const configPath of candidatePaths) {
    if (fs.existsSync(configPath)) {
      try {
        const content = fs.readFileSync(configPath, 'utf8');
        const lines = content.split(/\r?\n/);
        const parsed = { ...defaultConfig };
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) continue;
          const eqIdx = trimmed.indexOf('=');
          if (eqIdx > 0) {
            const key = trimmed.slice(0, eqIdx).trim();
            const val = trimmed.slice(eqIdx + 1).trim();
            if (key && val) {
              parsed[key] = val;
            }
          }
        }

        // Keep computed helper URLs in sync
        if (parsed.GITHUB_API && !parsed.GITHUB_LATEST_API) {
          parsed.GITHUB_LATEST_API = `${parsed.GITHUB_API}/releases/latest`;
        }
        if (parsed.GITHUB_CHANNEL && !parsed.GITHUB_UPDATE_CHANNEL) {
          parsed.GITHUB_UPDATE_CHANNEL = parsed.GITHUB_CHANNEL;
        }

        return parsed;
      } catch (_) {
        // Fall back to default
      }
    }
  }

  return defaultConfig;
}

module.exports = loadGithubConfig();
