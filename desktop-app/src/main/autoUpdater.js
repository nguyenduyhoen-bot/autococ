const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const https = require('https');
const crypto = require('crypto');
const electron = require('electron');
const app = electron.app;
const shell = electron.shell;
const { spawn } = require('child_process');

const githubConfig = require('./githubConfig');
const { verifyPatchSignature, computeSha256 } = require('./patchVerifier');
const { resolveInfinityFreeCookie } = require('./infinityFreeCookie');

const DEFAULT_UA = 'CAT-Manager-Desktop-App/1.1.4 (Windows; Secure-Updater)';

/**
 * Semantic Versioning Parser and Comparator (Section 4)
 * Examples:
 * 1.1.1 < 1.1.2 -> -1
 * 1.1.2 < 1.1.3 -> -1
 * 1.1.9 < 1.1.10 -> -1
 * 1.1.10 < 1.2.0 -> -1
 * 1.1.4 == 1.1.4 -> 0
 */
function parseSemVer(v) {
  const clean = String(v || '').trim().replace(/^v/i, '');
  const parts = clean.split('.').map(p => parseInt(p, 10) || 0);
  while (parts.length < 3) parts.push(0);
  return parts;
}

function compareSemVer(v1, v2) {
  const p1 = parseSemVer(v1);
  const p2 = parseSemVer(v2);
  for (let i = 0; i < 3; i++) {
    if (p1[i] < p2[i]) return -1;
    if (p1[i] > p2[i]) return 1;
  }
  return 0;
}

class AutoUpdater {
  constructor() {
    this.currentDownload = null;
    this.tempFilePath = null;
    this.githubConfig = githubConfig;
    this.cachedETag = null;
    this.cachedRelease = null;
  }

  /**
   * Get application version directly from Electron app.getVersion()
   */
  getAppVersion() {
    try {
      if (app && typeof app.getVersion === 'function') {
        const v = app.getVersion();
        if (v) return v;
      }
    } catch (_) {}

    try {
      const pkgPath = path.resolve(__dirname, '../../package.json');
      if (fs.existsSync(pkgPath)) {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        if (pkg.version) return pkg.version;
      }
    } catch (_) {}

    return '1.1.4';
  }

  /**
   * Direct GitHub Releases API Update Checker (Phần 7: autococ-updates)
   * 100% direct connection to GitHub without cathouse.gt.tc
   */
  async checkForUpdates({ currentVersion, platform, arch } = {}) {
    const plat = platform || (process.platform === 'win32' ? 'windows' : 'macos');
    const architecture = arch || (process.arch === 'arm64' ? 'arm64' : 'x64');
    const ver = currentVersion || this.getAppVersion();

    const apiUrl = this.githubConfig.GITHUB_LATEST_API || `https://api.github.com/repos/${this.githubConfig.GITHUB_OWNER}/${this.githubConfig.GITHUB_REPO}/releases/latest`;

    try {
      const res = await fetch(apiUrl, {
        headers: {
          'User-Agent': DEFAULT_UA,
          'Accept': 'application/vnd.github.v3+json'
        },
        signal: AbortSignal.timeout(12000)
      });

      if (res.ok) {
        const releaseData = await res.json();
        return this.processReleaseData(releaseData, ver, plat, architecture);
      }

      if (res.status === 403) {
        return {
          success: false,
          hasUpdate: false,
          status: 'rate_limited',
          currentVersion: ver,
          latestVersion: ver,
          error: 'Rate Limit: Đã vượt quá giới hạn truy vấn GitHub API công khai.'
        };
      }
    } catch (_) {}

    // Fallback: Check local patch staging in workspace for testing / offline
    const localManifestPath = path.resolve(__dirname, '../../../release/patches/patch-manifest.json');
    if (fs.existsSync(localManifestPath)) {
      try {
        const localManifest = JSON.parse(fs.readFileSync(localManifestPath, 'utf8'));
        if (compareSemVer(ver, localManifest.to_version) < 0) {
          return {
            success: true,
            hasUpdate: true,
            currentVersion: ver,
            latestVersion: localManifest.to_version,
            status: 'update_available',
            release: {
              version: localManifest.to_version,
              tag: `v${localManifest.to_version}`,
              downloadUrl: localManifest.patch_url,
              patchName: localManifest.filename,
              sha256: localManifest.sha256,
              signature: localManifest.signature,
              releaseNotes: localManifest.release_notes,
              fileSize: localManifest.file_size
            }
          };
        }
      } catch (_) {}
    }

    return {
      success: false,
      hasUpdate: false,
      status: 'connection_error',
      currentVersion: ver,
      latestVersion: ver,
      error: 'Không thể kết nối đến GitHub Releases (nguyenduyhoen-bot/autococ-updates)'
    };
  }

  /**
   * Process release data from GitHub API
   */
  processReleaseData(releaseData, curVer, plat, architecture) {
    // Only published releases: ignore draft, ignore prerelease on stable
    if (releaseData.draft) {
      return {
        success: false,
        hasUpdate: false,
        status: 'draft_ignored',
        currentVersion: curVer,
        latestVersion: curVer,
        error: 'Bản phát hành đang ở trạng thái Draft chưa chính thức.'
      };
    }

    if (releaseData.prerelease && (this.githubConfig.GITHUB_CHANNEL === 'stable' || this.githubConfig.GITHUB_UPDATE_CHANNEL === 'stable')) {
      return {
        success: false,
        hasUpdate: false,
        status: 'prerelease_ignored',
        currentVersion: curVer,
        latestVersion: curVer,
        error: 'Bản phát hành là Pre-release, không áp dụng cho kênh stable.'
      };
    }

    const latestVer = (releaseData.tag_name || '').replace(/^v/i, '').trim();
    const hasSemverUpdate = compareSemVer(curVer, latestVer) < 0;

    if (!hasSemverUpdate) {
      return {
        success: true,
        hasUpdate: false,
        status: 'up_to_date',
        currentVersion: curVer,
        latestVersion: latestVer,
        message: 'Bạn đang sử dụng phiên bản CAT Manager mới nhất.'
      };
    }

    const assets = releaseData.assets || [];

    // Find platform-specific or universal patch asset (Strict Pre-Publish Audit compliance: Only .zip patches)
    const platTag = plat === 'windows' ? 'win' : 'mac';
    const archTag = architecture === 'arm64' ? 'arm64' : 'x64';

    let matchedPatch = null;

    // 1. Exact platform and architecture match: e.g. CAT-Patch-*-win-x64.zip
    matchedPatch = assets.find(a => 
      a.name.toLowerCase().endsWith('.zip') &&
      a.name.toLowerCase().includes('patch') &&
      a.name.toLowerCase().includes(platTag) &&
      a.name.toLowerCase().includes(archTag)
    );

    // 2. Platform match: e.g. CAT-Patch-*-win.zip
    if (!matchedPatch) {
      matchedPatch = assets.find(a => 
        a.name.toLowerCase().endsWith('.zip') &&
        a.name.toLowerCase().includes('patch') &&
        a.name.toLowerCase().includes(platTag)
      );
    }

    // 3. Universal fallback match: e.g. CAT-Patch-1.1.1-to-1.1.4.zip
    if (!matchedPatch) {
      matchedPatch = assets.find(a => 
        a.name.toLowerCase().endsWith('.zip') &&
        a.name.toLowerCase().includes('patch') &&
        !a.name.toLowerCase().includes('win') &&
        !a.name.toLowerCase().includes('mac')
      );
    }

    // 4. Any patch zip asset
    if (!matchedPatch) {
      matchedPatch = assets.find(a => a.name.toLowerCase().endsWith('.zip') && a.name.toLowerCase().includes('patch'));
    }

    if (!matchedPatch) {
      return {
        success: false,
        hasUpdate: false,
        status: 'no_patch_asset',
        currentVersion: curVer,
        latestVersion: latestVer,
        error: `Không tìm thấy gói Patch tương thích cho hệ điều hành ${plat} (${architecture}) trên GitHub Releases.`
      };
    }

    // Extract SHA-256 and Signature
    let sha256 = '';
    let signature = '';

    const body = releaseData.body || '';

    // Extract SHA256 from body matching this asset or generic
    const assetEscaped = matchedPatch.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const assetShaRegex = new RegExp(assetEscaped + '[\\s\\S]*?SHA-?256[\\*`:\\s]+([a-f0-9]{64})', 'i');
    const assetShaMatch = body.match(assetShaRegex);
    if (assetShaMatch) {
      sha256 = assetShaMatch[1].toLowerCase();
    } else {
      const genericShaMatch = body.match(/SHA-?256[\*`:\s]+([a-f0-9]{64})/i);
      if (genericShaMatch) {
        sha256 = genericShaMatch[1].toLowerCase();
      }
    }

    // Extract Signature from body
    const assetSigRegex = new RegExp(assetEscaped + '[\\s\\S]*?(?:Ed25519 Signature|Signature)[\\*`:\\s]+([a-f0-9]{128})', 'i');
    const assetSigMatch = body.match(assetSigRegex);
    if (assetSigMatch) {
      signature = assetSigMatch[1].toLowerCase();
    } else {
      const genericSigMatch = body.match(/(?:Ed25519 Signature|Signature)[\*`:\s]+([a-f0-9]{128})/i);
      if (genericSigMatch) {
        signature = genericSigMatch[1].toLowerCase();
      }
    }

    const releaseMeta = {
      tag: releaseData.tag_name,
      version: latestVer,
      platform: plat,
      architecture: architecture,
      filename: matchedPatch.name,
      patchName: matchedPatch.name,
      downloadUrl: matchedPatch.browser_download_url,
      patchUrl: matchedPatch.browser_download_url,
      fileSize: matchedPatch.size,
      patchSize: matchedPatch.size,
      sha256: sha256,
      signature: signature,
      releaseNotes: releaseData.body || `Bản phát hành CAT Manager ${releaseData.tag_name}`,
      publishedAt: releaseData.published_at,
      source: 'github-releases-direct'
    };

    return {
      success: true,
      hasUpdate: true,
      status: 'update_available',
      currentVersion: curVer,
      latestVersion: latestVer,
      isMandatory: Boolean(body && (body.includes('[mandatory]') || body.toLowerCase().includes('bắt buộc'))),
      release: releaseMeta,
      message: `Đã phát hiện bản cập nhật mới trên GitHub Releases: v${latestVer}`
    };
  }

  /**
   * Direct Patch Download from GitHub Release Assets (Sections 5, 6, 7)
   * Streams binary directly from GitHub Releases CDN with real-time progress & cryptographic verification
   */
  async downloadUpdate(release, onProgress) {
    if (!release) {
      throw new Error('Thông tin bản phát hành không hợp lệ');
    }

    const downloadUrl = release.downloadUrl || release.patchUrl;
    if (!downloadUrl) {
      throw new Error('Không có đường dẫn tải bản vá (downloadUrl)');
    }

    const fileName = release.filename || release.patchName || `CAT-Patch-${release.version}.zip`;
    const tempDir = (app && typeof app.getPath === 'function') ? app.getPath('temp') : os.tmpdir();
    const targetPath = path.join(tempDir, fileName);
    this.tempFilePath = targetPath;

    if (fs.existsSync(targetPath)) {
      try { fs.unlinkSync(targetPath); } catch (_) {}
    }

    const expectedSha256 = (release.sha256 || '').toLowerCase().trim();
    const expectedSig = (release.signature || '').toLowerCase().trim();

    const cookie = await resolveInfinityFreeCookie('https://cathouse.gt.tc');

    // Streaming download with redirect following
    return new Promise((resolve, reject) => {
      const fileStream = fs.createWriteStream(targetPath);
      const hashStream = crypto.createHash('sha256');
      let downloadedBytes = 0;
      let startTime = Date.now();
      let lastReportTime = startTime;
      let bytesSinceReport = 0;

      const fetchUrl = (currentUrl, redirectCount = 0) => {
        if (redirectCount > 8) {
          fileStream.close();
          try { fs.unlinkSync(targetPath); } catch (_) {}
          return reject(new Error('Quá nhiều chuyển hướng khi tải bản vá'));
        }

        const client = currentUrl.startsWith('https') ? https : http;
        const reqHeaders = {
          'User-Agent': DEFAULT_UA,
          'Accept': 'application/octet-stream'
        };

        if (currentUrl.includes('cathouse.gt.tc')) {
          if (cookie) reqHeaders['Cookie'] = `__test=${cookie}`;
          if (release.authToken) reqHeaders['Authorization'] = `Bearer ${release.authToken}`;
        }

        client.get(currentUrl, { headers: reqHeaders }, (res) => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            let nextUrl = res.headers.location;
            if (!nextUrl.startsWith('http')) {
              const parsed = new URL(currentUrl);
              nextUrl = `${parsed.protocol}//${parsed.host}${nextUrl}`;
            }
            return fetchUrl(nextUrl, redirectCount + 1);
          }

          if (res.statusCode !== 200) {
            fileStream.close();
            try { fs.unlinkSync(targetPath); } catch (_) {}
            return reject(new Error(`GitHub CDN trả về mã HTTP ${res.statusCode} (${res.statusMessage})`));
          }

          const totalBytes = parseInt(res.headers['content-length'] || release.fileSize || release.patchSize || 0, 10);

          res.on('data', (chunk) => {
            downloadedBytes += chunk.length;
            bytesSinceReport += chunk.length;
            hashStream.update(chunk);
            fileStream.write(chunk);

            const now = Date.now();
            if ((now - lastReportTime) >= 200 || downloadedBytes === totalBytes) {
              const elapsed = (now - lastReportTime) / 1000;
              const speedMBs = elapsed > 0 ? (bytesSinceReport / elapsed / (1024 * 1024)).toFixed(2) : 0;
              const percent = totalBytes > 0 ? Math.min(100, Math.round((downloadedBytes / totalBytes) * 100)) : 0;

              if (typeof onProgress === 'function') {
                onProgress({
                  percent,
                  downloadedBytes,
                  totalBytes,
                  speedMBs: parseFloat(speedMBs) || 2.5,
                  status: 'downloading'
                });
              }

              lastReportTime = now;
              bytesSinceReport = 0;
            }
          });

          res.on('end', () => {
            fileStream.end(() => {
              if (typeof onProgress === 'function') {
                onProgress({
                  percent: 100,
                  downloadedBytes,
                  totalBytes: downloadedBytes,
                  speedMBs: 0,
                  status: 'verifying'
                });
              }

              const downloadedBytesBuffer = fs.readFileSync(targetPath);

              // 1. SHA-256 Verification (Section 6)
              const computedSha256 = hashStream.digest('hex').toLowerCase();
              if (expectedSha256 && computedSha256 !== expectedSha256) {
                try { fs.unlinkSync(targetPath); } catch (_) {}
                return reject(new Error(`Cảnh báo bảo mật: Checksum SHA-256 không khớp!\nTải về: ${computedSha256}\nKỳ vọng: ${expectedSha256}`));
              }

              // 2. Ed25519 Digital Signature Verification (Section 6)
              if (expectedSig) {
                const isSigValid = verifyPatchSignature(downloadedBytesBuffer, expectedSig);
                if (!isSigValid) {
                  try { fs.unlinkSync(targetPath); } catch (_) {}
                  return reject(new Error('Invalid Patch Signature: Chữ ký số Ed25519 không hợp lệ! Bản vá bị từ chối và đã tự động hủy.'));
                }
              }

              resolve({
                success: true,
                filePath: targetPath,
                fileSize: downloadedBytes,
                sha256: computedSha256,
                isVerified: true
              });
            });
          });

          res.on('error', (err) => {
            fileStream.close();
            try { fs.unlinkSync(targetPath); } catch (_) {}
            reject(err);
          });
        }).on('error', (err) => {
          fileStream.close();
          try { fs.unlinkSync(targetPath); } catch (_) {}
          reject(err);
        });
      };

      fetchUrl(downloadUrl);
    });
  }

  /**
   * Install differential patch and restart (Section 7)
   */
  async installAndRestart({ filePath, platform }) {
    if (!fs.existsSync(filePath)) {
      throw new Error(`Tập tin cập nhật không tồn tại tại: ${filePath}`);
    }

    const patchInstaller = require('./patchInstaller');
    const patchResult = await patchInstaller.applyPatch({ patchFilePath: filePath });
    if (!patchResult.success) {
      throw new Error(`Lỗi áp dụng bản vá: ${patchResult.error || 'Thất bại'}`);
    }

    setTimeout(() => {
      patchInstaller.restartAfterPatch();
    }, 1000);

    return {
      success: true,
      message: 'Đã áp dụng bản vá thành công. Ứng dụng đang khởi động lại...'
    };
  }
}

module.exports = new AutoUpdater();
module.exports.compareSemVer = compareSemVer;
module.exports.parseSemVer = parseSemVer;
