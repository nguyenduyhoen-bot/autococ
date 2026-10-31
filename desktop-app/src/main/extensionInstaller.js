const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const http = require('http');
const crypto = require('crypto');
const { execSync, exec } = require('child_process');

function getCepDirectory() {
  const isWin = os.platform() === 'win32';
  let cepDir;

  if (isWin) {
    const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
    cepDir = path.join(appData, 'Adobe', 'CEP', 'extensions');
  } else {
    cepDir = path.join(os.homedir(), 'Library', 'Application Support', 'Adobe', 'CEP', 'extensions');
  }

  if (!fs.existsSync(cepDir)) {
    fs.mkdirSync(cepDir, { recursive: true });
  }

  return cepDir;
}

function enablePlayerDebugMode() {
  const isWin = os.platform() === 'win32';
  const versions = ['9', '10', '11', '12', '13', '14', '15', '16'];

  try {
    for (const v of versions) {
      if (isWin) {
        try {
          execSync(`reg add "HKCU\\Software\\Adobe\\CSXS.${v}" /v PlayerDebugMode /t REG_SZ /d 1 /f`, { stdio: 'ignore' });
        } catch (_) {}
      } else {
        try {
          execSync(`defaults write com.adobe.CSXS.${v} PlayerDebugMode 1`, { stdio: 'ignore' });
        } catch (_) {}
      }
    }
    return true;
  } catch (err) {
    console.error('Failed to enable PlayerDebugMode:', err.message);
    return false;
  }
}

function getInstalledExtensions() {
  const cepDir = getCepDirectory();
  const extensions = {
    'cat-prime': { installed: false, version: null, path: null, name: 'CAT Prime', app: 'Adobe Premiere Pro' },
    'cat-af': { installed: false, version: null, path: null, name: 'CAT AF', app: 'Adobe After Effects' }
  };

  const idMap = {
    'cat-prime': 'com.cat.prime',
    'cat-af': 'com.cat.af'
  };

  for (const [slug, folderName] of Object.entries(idMap)) {
    const targetDir = path.join(cepDir, folderName);
    if (fs.existsSync(targetDir)) {
      extensions[slug].installed = true;
      extensions[slug].path = targetDir;

      // Read version from manifest.xml
      const manifestPath = path.join(targetDir, 'CSXS', 'manifest.xml');
      if (fs.existsSync(manifestPath)) {
        try {
          const content = fs.readFileSync(manifestPath, 'utf8');
          const match = content.match(/ExtensionBundleVersion="([^"]+)"/) || content.match(/Version="([^"]+)"/);
          if (match) {
            extensions[slug].version = match[1];
          } else {
            extensions[slug].version = '1.0.0';
          }
        } catch (_) {
          extensions[slug].version = '1.0.0';
        }
      } else {
        extensions[slug].version = '1.0.0';
      }
    }
  }

  return extensions;
}

function copyRecursiveSync(src, dest) {
  const exists = fs.existsSync(src);
  const stats = exists && fs.statSync(src);
  const isDirectory = exists && stats.isDirectory();
  if (isDirectory) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    fs.readdirSync(src).forEach((childItemName) => {
      copyRecursiveSync(path.join(src, childItemName), path.join(dest, childItemName));
    });
  } else {
    fs.copyFileSync(src, dest);
  }
}

function installExtensionFromDir(slug, sourceDir) {
  const cepDir = getCepDirectory();
  const folderName = slug === 'cat-prime' ? 'com.cat.prime' : 'com.cat.af';
  const targetDir = path.join(cepDir, folderName);
  const backupDir = path.join(cepDir, `${folderName}_backup_${Date.now()}`);

  try {
    // 1. If previous version exists, create backup
    if (fs.existsSync(targetDir)) {
      copyRecursiveSync(targetDir, backupDir);
      fs.rmSync(targetDir, { recursive: true, force: true });
    }

    // 2. Copy new files
    copyRecursiveSync(sourceDir, targetDir);

    // 3. Verify integrity
    const manifest = path.join(targetDir, 'CSXS', 'manifest.xml');
    if (!fs.existsSync(manifest)) {
      throw new Error(`Tệp tin cấu hình CSXS/manifest.xml không tồn tại trong bản phát hành`);
    }

    // 4. Automatically enable PlayerDebugMode
    enablePlayerDebugMode();

    return {
      success: true,
      path: targetDir,
      message: `Đã cài đặt thành công Extension ${slug} vào thư mục Adobe CEP!`
    };
  } catch (err) {
    console.error('InstallExtension error:', err);
    // Rollback if backup exists
    if (fs.existsSync(backupDir)) {
      try {
        if (fs.existsSync(targetDir)) fs.rmSync(targetDir, { recursive: true, force: true });
        copyRecursiveSync(backupDir, targetDir);
      } catch (_) {}
    }
    throw new Error(`Cài đặt thất bại: ${err.message}`);
  } finally {
    if (fs.existsSync(backupDir)) {
      setTimeout(() => {
        try { fs.rmSync(backupDir, { recursive: true, force: true }); } catch (_) {}
      }, 5000);
    }
  }
}

/**
 * Extract a ZIP archive using native system tool (tar -xf works on Win10/11 and macOS)
 */
function extractZip(zipFilePath, destDir) {
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }

  try {
    // Both modern Windows (since 2018) and macOS have native bsdtar
    execSync(`tar -xf "${zipFilePath}" -C "${destDir}"`, { stdio: 'ignore' });
  } catch (err) {
    // Fallback on Windows via PowerShell Expand-Archive
    if (os.platform() === 'win32') {
      execSync(`powershell -NoProfile -Command "Expand-Archive -Path '${zipFilePath}' -DestinationPath '${destDir}' -Force"`, { stdio: 'ignore' });
    } else {
      execSync(`unzip -q -o "${zipFilePath}" -d "${destDir}"`, { stdio: 'ignore' });
    }
  }
}

/**
 * Install Extension from a downloaded ZIP archive with SHA256 integrity check and rollback
 */
function installExtensionFromZip(slug, zipFilePath, expectedSha256 = null) {
  if (!fs.existsSync(zipFilePath)) {
    throw new Error(`Tệp tin ZIP không tồn tại tại: ${zipFilePath}`);
  }

  // 1. Verify SHA-256
  if (expectedSha256) {
    const fileBytes = fs.readFileSync(zipFilePath);
    const computedHash = crypto.createHash('sha256').update(fileBytes).digest('hex').toLowerCase();
    const expected = expectedSha256.toLowerCase().trim();
    if (computedHash !== expected) {
      try { fs.unlinkSync(zipFilePath); } catch (_) {}
      throw new Error(`Cảnh báo bảo mật: Mã băm SHA-256 không khớp! (Tải về: ${computedHash}, Máy chủ: ${expected})`);
    }
  }

  const cepDir = getCepDirectory();
  const folderName = slug === 'cat-prime' ? 'com.cat.prime' : 'com.cat.af';
  const targetDir = path.join(cepDir, folderName);
  const backupDir = path.join(cepDir, `${folderName}_backup_${Date.now()}`);
  const tempExtractDir = path.join(os.tmpdir(), `cat_ext_extract_${Date.now()}`);

  try {
    // 2. Extract ZIP to temporary folder first
    extractZip(zipFilePath, tempExtractDir);

    // Look for root folder or direct files
    let sourceDir = tempExtractDir;
    const items = fs.readdirSync(tempExtractDir);
    if (items.length === 1 && fs.statSync(path.join(tempExtractDir, items[0])).isDirectory()) {
      sourceDir = path.join(tempExtractDir, items[0]);
    }

    // 3. Backup existing extension
    if (fs.existsSync(targetDir)) {
      copyRecursiveSync(targetDir, backupDir);
      fs.rmSync(targetDir, { recursive: true, force: true });
    }

    // 4. Deploy to CEP folder
    copyRecursiveSync(sourceDir, targetDir);

    // 5. Verify integrity of manifest.xml
    const manifest = path.join(targetDir, 'CSXS', 'manifest.xml');
    if (!fs.existsSync(manifest)) {
      throw new Error('Gói cài đặt thiếu tệp tin CSXS/manifest.xml');
    }

    // 6. Enable PlayerDebugMode
    enablePlayerDebugMode();

    return {
      success: true,
      path: targetDir,
      message: `Đã cài đặt thành công Extension ${slug} vào Adobe CEP!`
    };
  } catch (err) {
    // Rollback to previous version if backup exists
    if (fs.existsSync(backupDir)) {
      try {
        if (fs.existsSync(targetDir)) fs.rmSync(targetDir, { recursive: true, force: true });
        copyRecursiveSync(backupDir, targetDir);
      } catch (_) {}
    }
    throw new Error(`Lỗi cài đặt Extension: ${err.message}`);
  } finally {
    // Clean up temporary extracted files
    try { fs.rmSync(tempExtractDir, { recursive: true, force: true }); } catch (_) {}
    if (fs.existsSync(backupDir)) {
      setTimeout(() => {
        try { fs.rmSync(backupDir, { recursive: true, force: true }); } catch (_) {}
      }, 5000);
    }
  }
}

function uninstallExtension(slug) {
  const cepDir = getCepDirectory();
  const folderName = slug === 'cat-prime' ? 'com.cat.prime' : 'com.cat.af';
  const targetDir = path.join(cepDir, folderName);

  if (fs.existsSync(targetDir)) {
    fs.rmSync(targetDir, { recursive: true, force: true });
    return { success: true, message: `Đã gỡ cài đặt Extension ${slug} thành công khỏi Adobe CEP.` };
  }
  return { success: false, message: 'Extension chưa được cài đặt trong hệ thống' };
}

module.exports = {
  getCepDirectory,
  enablePlayerDebugMode,
  getInstalledExtensions,
  installExtensionFromDir,
  installExtensionFromZip,
  uninstallExtension
};
