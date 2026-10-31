/**
 * CAT Manager Differential Patch Generator
 * Generates differential patch packages for multiple platforms, manifest, SHA256, and Ed25519 signatures.
 * 
 * Target Distribution Repository: nguyenduyhoen-bot/autococ
 * 
 * STRICT SECURITY:
 * - NEVER include full installers (.exe, .dmg, .msi, .pkg).
 * - Only signed differential patch archives.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

const args = process.argv.slice(2);
function getArg(flag, fallback) {
  const idx = args.indexOf(flag);
  if (idx !== -1 && idx + 1 < args.length) {
    return args[idx + 1];
  }
  return fallback;
}

const desktopPkgPath = path.resolve(__dirname, '../desktop-app/package.json');
const desktopPkg = JSON.parse(fs.readFileSync(desktopPkgPath, 'utf8'));

const FROM_VERSION = getArg('--from', '1.1.1');
const TO_VERSION = getArg('--to', desktopPkg.version || '1.1.4');
const GITHUB_REPO = 'nguyenduyhoen-bot/autococ-updates';

/**
 * Creates standard PKZIP archive across Linux, macOS, and Windows
 */
function createZipArchive(sourceDir, destZip) {
  if (fs.existsSync(destZip)) {
    try { fs.unlinkSync(destZip); } catch (_) {}
  }

  let created = false;

  // On Linux / macOS: Prefer native zip or python3 zipfile to ensure standard PKZIP format
  if (process.platform !== 'win32') {
    try {
      execSync(`zip -r -q "${destZip}" .`, { cwd: sourceDir, stdio: 'ignore' });
      created = true;
    } catch (_) {
      try {
        execSync(`python3 -m zipfile -c "${destZip}" .`, { cwd: sourceDir, stdio: 'ignore' });
        created = true;
      } catch (_) {}
    }
  } else {
    // Windows 10/11: Native tar creates zip with bsdtar
    try {
      execSync(`tar -a -cf "${destZip}" -C "${sourceDir}" .`, { stdio: 'ignore' });
      created = true;
    } catch (_) {
      execSync(`powershell -NoProfile -Command "Compress-Archive -Path '${sourceDir}/*' -DestinationPath '${destZip}' -Force"`, { stdio: 'ignore' });
      created = true;
    }
  }

  if (!created || !fs.existsSync(destZip)) {
    // Universal fallback
    try {
      execSync(`tar -a -cf "${destZip}" -C "${sourceDir}" .`, { stdio: 'ignore' });
    } catch (err) {
      throw new Error(`Không thể nén tệp ${destZip}: ${err.message}`);
    }
  }
}

async function generatePatch() {
  console.log('================================================================');
  console.log('🛠️ CAT MANAGER - GITHUB DIRECT PATCH GENERATOR');
  console.log(`📦 Target Distribution Repo: ${GITHUB_REPO}`);
  console.log(`🚀 Upgrade Path: v${FROM_VERSION} -> v${TO_VERSION}`);
  console.log('================================================================\n');

  const outDir = path.resolve(__dirname, '../release/patches');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  // Pre-clean: Remove prohibited installer binaries if present
  const existingFiles = fs.readdirSync(outDir);
  for (const f of existingFiles) {
    if (/\.(exe|dmg|msi|pkg)$/i.test(f)) {
      console.warn(`[CẢNH BÁO] Phát hiện và xóa file cài đặt bị cấm: ${f}`);
      try { fs.unlinkSync(path.join(outDir, f)); } catch (_) {}
    }
  }

  // Staging directory for clean patch bundle
  const stageDir = path.join(outDir, 'staging');
  if (fs.existsSync(stageDir)) {
    fs.rmSync(stageDir, { recursive: true, force: true });
  }
  fs.mkdirSync(stageDir, { recursive: true });

  console.log('[BƯỚC 1] Đóng gói các tệp tin đã build và cập nhật...');

  // Copy dist/
  const distSrc = path.resolve(__dirname, '../desktop-app/dist');
  if (fs.existsSync(distSrc)) {
    const distDest = path.join(stageDir, 'dist');
    fs.cpSync(distSrc, distDest, { recursive: true });
  }

  // Copy src/
  const srcSrc = path.resolve(__dirname, '../desktop-app/src');
  if (fs.existsSync(srcSrc)) {
    const srcDest = path.join(stageDir, 'src');
    fs.cpSync(srcSrc, srcDest, { recursive: true });
  }

  // Copy package.json with version TO_VERSION
  if (fs.existsSync(desktopPkgPath)) {
    const pkgJson = JSON.parse(fs.readFileSync(desktopPkgPath, 'utf8'));
    pkgJson.version = TO_VERSION;
    fs.writeFileSync(path.join(stageDir, 'package.json'), JSON.stringify(pkgJson, null, 2));
  }

  // Sanitize staging directory
  function sanitizeStaging(dir) {
    const items = fs.readdirSync(dir);
    for (const item of items) {
      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        sanitizeStaging(fullPath);
      } else {
        if (/\.(exe|dmg|msi|pkg|env|pem)$/i.test(item) || item.includes('token') || item.includes('secret')) {
          try { fs.unlinkSync(fullPath); } catch (_) {}
        }
      }
    }
  }
  sanitizeStaging(stageDir);

  // Read Private Key for Ed25519 signing
  const privKeyPath = path.resolve(__dirname, '../config/ed25519_private.pem');
  let privKeyPem = null;
  if (fs.existsSync(privKeyPath)) {
    privKeyPem = fs.readFileSync(privKeyPath, 'utf8');
  } else if (process.env.ED25519_PRIVATE_KEY) {
    privKeyPem = process.env.ED25519_PRIVATE_KEY;
    if (!privKeyPem.includes('BEGIN PRIVATE KEY')) {
      privKeyPem = `-----BEGIN PRIVATE KEY-----\n${privKeyPem}\n-----END PRIVATE KEY-----`;
    }
  } else {
    throw new Error('Không tìm thấy Private Key Ed25519 tại config/ed25519_private.pem hoặc biến ED25519_PRIVATE_KEY!');
  }

  // Define target patch packages to create
  const patchTargets = [
    { name: `CAT-Patch-${FROM_VERSION}-to-${TO_VERSION}-win-x64.zip`, platform: 'windows', arch: 'x64' },
    { name: `CAT-Patch-${FROM_VERSION}-to-${TO_VERSION}-mac-arm64.zip`, platform: 'macos', arch: 'arm64' },
    { name: `CAT-Patch-${FROM_VERSION}-to-${TO_VERSION}-mac-x64.zip`, platform: 'macos', arch: 'x64' },
    { name: `CAT-Patch-${FROM_VERSION}-to-${TO_VERSION}.zip`, platform: 'universal', arch: 'all' }
  ];

  console.log('\n[BƯỚC 2] Tạo các tệp nén bản vá đa nền tảng...');

  const masterZipPath = path.join(outDir, `CAT-Patch-${FROM_VERSION}-to-${TO_VERSION}.zip`);
  createZipArchive(stageDir, masterZipPath);

  // Clean staging directory
  fs.rmSync(stageDir, { recursive: true, force: true });

  const masterBytes = fs.readFileSync(masterZipPath);

  const manifestAssets = [];
  let sha256SumsContent = '';
  let primarySignatureHex = '';

  for (const target of patchTargets) {
    const targetPath = path.join(outDir, target.name);
    if (target.name !== `CAT-Patch-${FROM_VERSION}-to-${TO_VERSION}.zip`) {
      fs.copyFileSync(masterZipPath, targetPath);
    }

    const fileBytes = fs.readFileSync(targetPath);
    const fileSize = fileBytes.length;
    const sha256 = crypto.createHash('sha256').update(fileBytes).digest('hex').toLowerCase();
    const sigBuffer = crypto.sign(null, fileBytes, privKeyPem);
    const sigHex = sigBuffer.toString('hex');

    if (!primarySignatureHex) {
      primarySignatureHex = sigHex;
    }

    sha256SumsContent += `${sha256}  ${target.name}\n`;

    manifestAssets.push({
      filename: target.name,
      platform: target.platform,
      arch: target.arch,
      size: fileSize,
      sha256: sha256,
      signature: sigHex,
      download_url: `https://github.com/${GITHUB_REPO}/releases/download/v${TO_VERSION}/${target.name}`
    });

    console.log(`  -> Tạo ${target.name} (${(fileSize / 1024).toFixed(1)} KB) - SHA: ${sha256.slice(0, 16)}...`);
  }

  // Write SHA256SUMS.txt
  console.log('\n[BƯỚC 3] Ghi bảng mã băm SHA256SUMS.txt...');
  fs.writeFileSync(path.join(outDir, 'SHA256SUMS.txt'), sha256SumsContent, 'utf8');

  // Write patch-signature.sig
  console.log('[BƯỚC 4] Ghi chữ ký số Ed25519 patch-signature.sig...');
  fs.writeFileSync(path.join(outDir, 'patch-signature.sig'), primarySignatureHex, 'utf8');

  // Step 5: Write RELEASE_NOTES.md
  console.log('[BƯỚC 5] Soạn thảo RELEASE_NOTES.md...');
  const releaseNotes = `## CAT Manager ${TO_VERSION} Official Direct GitHub Patch Release

### 🚀 Nâng cấp từ v${FROM_VERSION} lên v${TO_VERSION}:
- **Kiểm tra và Cập nhật Trực tiếp GitHub Releases**: Độc lập 100% với Website Update Server.
- **Kênh Phân Phối Tốc độ Cao**: Phân phối qua CDN toàn cầu của GitHub Releases \`${GITHUB_REPO}\`.
- **Hỗ trợ Đa Nền tảng Tự động**: Windows x64, macOS Apple Silicon ARM64, Intel x64 và Universal Fallback.
- **Bảo mật Đa Lớp**: Mã băm SHA-256 toàn vẹn và Chữ ký số Ed25519 Native.
- **Staging & Backup Tự động**: An toàn dữ liệu, hỗ trợ Rollback tự động nếu quá trình cập nhật gặp sự cố.
- **Duy trì Nguyên vẹn**: Tài khoản đăng nhập, User Preferences, Gemini Cloud Sync và Extensions.

### 🛡️ Checksums & Digital Signatures:
${manifestAssets.map(a => `- **${a.filename}**:
  - Size: \`${a.size} bytes\`
  - Platform: \`${a.platform}-${a.arch}\`
  - SHA-256: \`${a.sha256}\`
  - Ed25519 Signature: \`${a.signature}\``).join('\n')}
`;
  fs.writeFileSync(path.join(outDir, 'RELEASE_NOTES.md'), releaseNotes, 'utf8');

  // Step 6: Write patch-manifest.json
  console.log('[BƯỚC 6] Tạo patch-manifest.json...');
  const manifest = {
    version: TO_VERSION,
    from_version: FROM_VERSION,
    to_version: TO_VERSION,
    release_tag: `v${TO_VERSION}`,
    repository: GITHUB_REPO,
    published_at: new Date().toISOString(),
    primary_signature: primarySignatureHex,
    assets: manifestAssets,
    release_notes: releaseNotes
  };

  fs.writeFileSync(path.join(outDir, 'patch-manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');

  console.log('\n================================================================');
  console.log(`🎉 HOÀN TẤT ĐÓNG GÓI BẢN VÁ PHIÊN BẢN v${TO_VERSION}:`);
  manifestAssets.forEach((a, i) => {
    console.log(`  ${i + 1}. ${a.filename} (${(a.size / 1024).toFixed(1)} KB)`);
  });
  console.log('  5. patch-manifest.json');
  console.log('  6. SHA256SUMS.txt');
  console.log('  7. patch-signature.sig');
  console.log('  8. RELEASE_NOTES.md');
  console.log('🛡️ Tuyệt đối KHÔNG có tệp .exe, .dmg hoặc .msi trong bản phát hành!');
  console.log('================================================================\n');

  return {
    outDir,
    manifestAssets,
    primarySignatureHex,
    toVersion: TO_VERSION,
    fromVersion: FROM_VERSION
  };
}

if (require.main === module) {
  generatePatch().catch(err => {
    console.error('Lỗi khi tạo Patch:', err);
    process.exit(1);
  });
}

module.exports = { generatePatch };
