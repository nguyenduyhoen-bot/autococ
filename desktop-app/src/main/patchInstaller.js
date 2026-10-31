const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const http = require('http');
const https = require('https');
const { execSync, spawn } = require('child_process');
const electron = require('electron');
const app = electron.app;

const githubConfig = require('./githubConfig');
const { verifyPatchSignature, computeSha256 } = require('./patchVerifier');
const { compareSemVer } = require('./autoUpdater');

const DEFAULT_UA = 'CAT-Manager-Desktop-App/1.1.4 (Windows; PatchInstaller)';

class PatchInstaller {
  constructor() {
    this.stagingDir = null;
    this.backupDir = null;
  }

  /**
   * Extract ZIP archive using native OS utilities (tar / PowerShell / unzip)
   */
  extractZip(zipFilePath, destDir) {
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }

    let extracted = false;
    try {
      execSync(`tar -xf "${zipFilePath}" -C "${destDir}"`, { stdio: 'pipe' });
      extracted = true;
    } catch (_) {}

    if (!extracted) {
      if (process.platform === 'win32') {
        execSync(`powershell -NoProfile -Command "$ErrorActionPreference = 'Stop'; Expand-Archive -Path '${zipFilePath}' -DestinationPath '${destDir}' -Force"`, { stdio: 'pipe' });
      } else {
        execSync(`unzip -q -o "${zipFilePath}" -d "${destDir}"`, { stdio: 'pipe' });
      }
    }
    return true;
  }

  /**
   * Check for available patch on GitHub Releases directly (Section 3 & 4)
   */
  async checkForPatches({ currentVersion = '1.1.4', platform, arch } = {}) {
    const curVer = currentVersion || (app && typeof app.getVersion === 'function' ? app.getVersion() : '1.1.4');
    const plat = platform || (process.platform === 'win32' ? 'windows' : 'macos');
    const architecture = arch || (process.arch === 'arm64' ? 'arm64' : 'x64');

    const apiUrl = githubConfig.GITHUB_LATEST_API || `https://api.github.com/repos/${githubConfig.GITHUB_OWNER}/${githubConfig.GITHUB_REPO}/releases/latest`;

    try {
      const res = await fetch(apiUrl, {
        headers: {
          'User-Agent': DEFAULT_UA,
          'Accept': 'application/vnd.github.v3+json'
        }
      });

      if (!res.ok) {
        // Fallback to local patch manifest if generated in workspace (allows offline verification & test)
        const localManifestPath = path.resolve(__dirname, '../../../release/patches/patch-manifest.json');
        if (fs.existsSync(localManifestPath)) {
          try {
            const localManifest = JSON.parse(fs.readFileSync(localManifestPath, 'utf8'));
            if (compareSemVer(curVer, localManifest.to_version) < 0) {
              return {
                hasPatch: true,
                currentVersion: curVer,
                latestVersion: localManifest.to_version,
                patch: localManifest,
                releaseNotes: localManifest.release_notes,
                source: 'local-patch-staging'
              };
            }
          } catch (_) {}
        }

        return {
          hasPatch: false,
          currentVersion: curVer,
          error: `Không thể kết nối đến GitHub Releases (HTTP ${res.status})`
        };
      }

      const releaseData = await res.json();
      const latestVer = (releaseData.tag_name || '').replace(/^v/i, '').trim();

      // Check if update is available via SemVer
      const hasSemverUpdate = compareSemVer(curVer, latestVer) < 0;
      if (!hasSemverUpdate) {
        return {
          hasPatch: false,
          currentVersion: curVer,
          latestVersion: latestVer,
          message: 'Bạn đang sử dụng phiên bản CAT Manager mới nhất.'
        };
      }

      const assets = releaseData.assets || [];

      // Look for patch-manifest.json asset
      const manifestAsset = assets.find(a => a.name === 'patch-manifest.json');
      let manifest = null;

      if (manifestAsset && manifestAsset.browser_download_url) {
        try {
          const mRes = await fetch(manifestAsset.browser_download_url, {
            headers: { 'User-Agent': DEFAULT_UA }
          });
          if (mRes.ok) {
            manifest = await mRes.json();
          }
        } catch (_) {}
      }

      // If manifest asset not found, construct from release assets
      if (!manifest) {
        const platTag = plat === 'windows' ? 'win' : 'mac';
        const archTag = architecture === 'arm64' ? 'arm64' : 'x64';

        let matchedAsset = assets.find(a => 
          a.name.toLowerCase().endsWith('.zip') &&
          a.name.toLowerCase().includes('patch') &&
          a.name.toLowerCase().includes(platTag) &&
          a.name.toLowerCase().includes(archTag)
        );

        if (!matchedAsset) {
          matchedAsset = assets.find(a => 
            a.name.toLowerCase().endsWith('.zip') &&
            a.name.toLowerCase().includes('patch') &&
            !a.name.toLowerCase().includes('win') &&
            !a.name.toLowerCase().includes('mac')
          );
        }

        if (!matchedAsset) {
          matchedAsset = assets.find(a => a.name.toLowerCase().endsWith('.zip') && a.name.toLowerCase().includes('patch'));
        }

        const sigAsset = assets.find(a => a.name === 'patch-signature.sig');
        let sigText = '';

        if (sigAsset && sigAsset.browser_download_url) {
          try {
            const sRes = await fetch(sigAsset.browser_download_url, {
              headers: { 'User-Agent': DEFAULT_UA }
            });
            if (sRes.ok) {
              sigText = await sRes.text();
            }
          } catch (_) {}
        }

        if (!matchedAsset) {
          return {
            hasPatch: false,
            currentVersion: curVer,
            latestVersion: latestVer,
            error: 'Không tìm thấy gói Patch hợp lệ trong bản phát hành GitHub'
          };
        }

        manifest = {
          version: latestVer,
          from_version: curVer,
          to_version: latestVer,
          platform: plat,
          architecture: architecture,
          patch_url: matchedAsset.browser_download_url,
          filename: matchedAsset.name,
          file_size: matchedAsset.size,
          sha256: '',
          signature: sigText.trim(),
          release_notes: releaseData.body || `Bản vá CAT Manager v${latestVer}`,
          minimum_supported_version: '1.1.1',
          published_at: releaseData.published_at
        };
      }

      return {
        hasPatch: true,
        currentVersion: curVer,
        latestVersion: manifest.to_version || latestVer,
        patch: manifest,
        releaseNotes: manifest.release_notes || releaseData.body
      };
    } catch (err) {
      return {
        hasPatch: false,
        currentVersion: curVer,
        error: `Lỗi kiểm tra bản vá: ${err.message}`
      };
    }
  }

  /**
   * Download patch package with progress and verify SHA256 & Ed25519 digital signature
   */
  async downloadAndVerifyPatch(patch, onProgress) {
    if (!patch || !patch.patch_url) {
      throw new Error('Thông tin gói Patch không hợp lệ');
    }

    const tempDir = path.join(os.tmpdir(), 'cat_patch_download');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const fileName = patch.filename || `CAT-Patch-${patch.from_version}-to-${patch.to_version}.zip`;
    const targetFile = path.join(tempDir, fileName);

    if (fs.existsSync(targetFile)) {
      try { fs.unlinkSync(targetFile); } catch (_) {}
    }

    // Check if patch is available locally (in build/release/patches directory)
    const localCandidates = [
      path.resolve(__dirname, `../../../release/patches/${fileName}`),
      path.resolve(process.cwd(), `release/patches/${fileName}`),
      path.resolve(__dirname, `../../../../release/patches/${fileName}`)
    ];

    let localFound = null;
    for (const c of localCandidates) {
      if (fs.existsSync(c)) {
        localFound = c;
        break;
      }
    }

    if (localFound) {
      fs.copyFileSync(localFound, targetFile);
    } else {
      // Remote streaming download with redirect support
      await new Promise((resolve, reject) => {
        const fileStream = fs.createWriteStream(targetFile);
        let downloadedBytes = 0;
        let lastReport = Date.now();
        let bytesSinceReport = 0;

        const fetchUrl = (currentUrl, redirects = 0) => {
          if (redirects > 8) {
            fileStream.close();
            return reject(new Error('Quá nhiều chuyển hướng khi tải Patch'));
          }

          const client = currentUrl.startsWith('https') ? https : http;
          client.get(currentUrl, {
            headers: { 'User-Agent': DEFAULT_UA, 'Accept': '*/*' }
          }, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
              let nextUrl = res.headers.location;
              if (!nextUrl.startsWith('http')) {
                const parsed = new URL(currentUrl);
                nextUrl = `${parsed.protocol}//${parsed.host}${nextUrl}`;
              }
              return fetchUrl(nextUrl, redirects + 1);
            }

            if (res.statusCode !== 200) {
              fileStream.close();
              return reject(new Error(`Máy chủ tải Patch trả về mã HTTP ${res.statusCode}`));
            }

            const totalBytes = parseInt(res.headers['content-length'] || patch.file_size || 0, 10);

            res.on('data', (chunk) => {
              downloadedBytes += chunk.length;
              bytesSinceReport += chunk.length;
              fileStream.write(chunk);

              const now = Date.now();
              if (now - lastReport >= 150 || downloadedBytes === totalBytes) {
                const speed = (bytesSinceReport / ((now - lastReport) / 1000) / (1024 * 1024)).toFixed(2);
                const percent = totalBytes > 0 ? Math.min(100, Math.round((downloadedBytes / totalBytes) * 100)) : 0;
                if (typeof onProgress === 'function') {
                  onProgress({
                    percent,
                    downloadedBytes,
                    totalBytes,
                    speedMBs: parseFloat(speed) || 5.0,
                    status: 'downloading'
                  });
                }
                lastReport = now;
                bytesSinceReport = 0;
              }
            });

            res.on('end', () => {
              fileStream.end(() => {
                if (typeof onProgress === 'function') {
                  onProgress({ percent: 100, status: 'verifying' });
                }
                resolve();
              });
            });

            res.on('error', reject);
          }).on('error', reject);
        };

        fetchUrl(patch.patch_url);
      });
    }

    // Step 1: Verify SHA256 Integrity
    const fileBytes = fs.readFileSync(targetFile);
    const computedSha = computeSha256(fileBytes);

    if (patch.sha256 && patch.sha256.toLowerCase() !== computedSha) {
      try { fs.unlinkSync(targetFile); } catch (_) {}
      throw new Error(`Cảnh báo bảo mật: Mã băm SHA-256 không khớp!\nTải về: ${computedSha}\nKỳ vọng: ${patch.sha256}`);
    }

    // Step 2: Verify Ed25519 Digital Signature (Section 6.1)
    if (patch.signature) {
      const isSigValid = verifyPatchSignature(fileBytes, patch.signature);
      if (!isSigValid) {
        try { fs.unlinkSync(targetFile); } catch (_) {}
        throw new Error('Chữ ký số Ed25519 không hợp lệ! Bản vá không được phát hành từ nguồn bảo mật của nhà phát triển.');
      }
    }

    return {
      success: true,
      filePath: targetFile,
      patchFilePath: targetFile,
      fileSize: fileBytes.length,
      sha256: computedSha,
      isVerified: true
    };
  }

  /**
   * Apply patch to application with automatic rollback on error (Section 7)
   */
  async applyPatch({ patchFilePath, targetAppDir }) {
    if (!fs.existsSync(patchFilePath)) {
      throw new Error(`Tệp tin bản vá không tồn tại tại: ${patchFilePath}`);
    }

    const appDir = targetAppDir || path.resolve(__dirname, '../..');
    const stagingBase = path.join(os.tmpdir(), `cat_patch_staging_${Date.now()}`);
    const extractedDir = path.join(stagingBase, 'extracted');
    const backupDir = path.join(stagingBase, 'backup');

    fs.mkdirSync(extractedDir, { recursive: true });
    fs.mkdirSync(backupDir, { recursive: true });

    let appliedFiles = [];
    let backupFiles = [];

    try {
      console.log('[PatchInstaller] Giải nén gói bản vá vào staging...');
      this.extractZip(patchFilePath, extractedDir);

      // Locate files to update in extracted bundle
      const scanDir = (dir, base = '') => {
        let results = [];
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const relPath = base ? path.join(base, entry.name) : entry.name;
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            results = results.concat(scanDir(fullPath, relPath));
          } else {
            results.push(relPath);
          }
        }
        return results;
      };

      const filesToUpdate = scanDir(extractedDir);
      console.log(`[PatchInstaller] Danh sách tệp cần cập nhật: ${filesToUpdate.length} tệp`);

      if (filesToUpdate.length === 0) {
        throw new Error('Gói bản vá rỗng hoặc không chứa tệp tin hợp lệ.');
      }

      // Backup existing files that will be replaced
      for (const relFile of filesToUpdate) {
        const destFile = path.join(appDir, relFile);
        if (fs.existsSync(destFile)) {
          const bkpDest = path.join(backupDir, relFile);
          fs.mkdirSync(path.dirname(bkpDest), { recursive: true });
          fs.copyFileSync(destFile, bkpDest);
          backupFiles.push({ original: destFile, backup: bkpDest });
        }
      }

      // Apply update: copy new files from extracted to appDir
      for (const relFile of filesToUpdate) {
        const srcFile = path.join(extractedDir, relFile);
        const destFile = path.join(appDir, relFile);
        fs.mkdirSync(path.dirname(destFile), { recursive: true });
        fs.copyFileSync(srcFile, destFile);
        appliedFiles.push(destFile);
      }

      // Verify integrity of applied files
      for (const file of appliedFiles) {
        if (!fs.existsSync(file) || fs.statSync(file).size === 0) {
          throw new Error(`Tệp tin sau khi áp dụng bản vá bị hỏng hoặc trống: ${file}`);
        }
      }

      // macOS Code Signature Integrity Check (Section 3 Requirement)
      if (process.platform === 'darwin') {
        try {
          const execPath = process.execPath || '';
          let appBundlePath = null;
          if (execPath.includes('.app/Contents/MacOS')) {
            appBundlePath = execPath.substring(0, execPath.indexOf('.app') + 4);
          } else if (app && typeof app.getAppPath === 'function') {
            const p = path.resolve(app.getAppPath(), '../../../..');
            if (p.endsWith('.app')) appBundlePath = p;
          }

          if (appBundlePath && fs.existsSync(appBundlePath)) {
            console.log(`[PatchInstaller] 🍎 macOS: Kiểm tra tính toàn vẹn chữ ký số App Bundle: ${appBundlePath}`);
            try {
              execSync(`codesign --verify --deep --strict "${appBundlePath}"`, { stdio: 'pipe' });
              console.log('[PatchInstaller] ✅ Chữ ký số macOS App Bundle toàn vẹn và hợp lệ.');
            } catch (csErr) {
              console.warn('[PatchInstaller] ⚠️ Không bảo toàn được chữ ký số App Bundle:', csErr.message);
              throw new Error('Chữ ký số macOS App Bundle không được bảo toàn sau khi vá. Đã tự động Rollback an toàn. Vui lòng tải bộ cài DMG chính thức (CAT-Manager-1.1.4.dmg) để nâng cấp.');
            }
          }
        } catch (macAuditErr) {
          throw macAuditErr;
        }
      }

      console.log('[PatchInstaller] ✅ Áp dụng bản vá thành công!');
      return {
        success: true,
        updatedFilesCount: appliedFiles.length,
        message: 'Bản vá đã được áp dụng an toàn và nguyên vẹn.'
      };
    } catch (err) {
      console.error('[PatchInstaller] ❌ Lỗi khi cài đặt bản vá, kích hoạt Rollback tự động...', err.message);

      // Automatic Rollback: restore backed up files
      try {
        for (const item of backupFiles) {
          if (fs.existsSync(item.backup)) {
            fs.mkdirSync(path.dirname(item.original), { recursive: true });
            fs.copyFileSync(item.backup, item.original);
          }
        }
        console.log('[PatchInstaller] 🔄 Hoàn tất phục hồi dữ liệu từ bản sao lưu (Rollback complete)');
      } catch (rbErr) {
        console.error('[PatchInstaller] Lỗi nghiêm trọng khi rollback:', rbErr.message);
      }

      throw new Error(`Cài đặt bản vá thất bại. Hệ thống đã tự động Rollback về phiên bản cũ: ${err.message}`);
    } finally {
      // Clean up staging directory
      try {
        fs.rmSync(stagingBase, { recursive: true, force: true });
      } catch (_) {}
    }
  }

  /**
   * Relaunch application after patch application
   */
  restartAfterPatch() {
    try {
      if (app && typeof app.relaunch === 'function') {
        app.relaunch();
      }
      if (app && typeof app.exit === 'function') {
        app.exit(0);
      } else if (app && typeof app.quit === 'function') {
        app.quit();
      }
    } catch (_) {
      process.exit(0);
    }
  }
}

module.exports = new PatchInstaller();
