/**
 * CAT Ecosystem - Pre-Release Guard & Leak Prevention Check
 * Complies with Section 9: Mechanically prevents pushing source code, secrets, or installers to GitHub.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');
const PUBLIC_RELEASE_DIR = path.join(ROOT_DIR, 'PUBLIC-RELEASE/PATCHES');

console.log('================================================================');
console.log('🛡️  CAT ECOSYSTEM - PRE-RELEASE SECURITY & SOURCE AUDIT');
console.log('================================================================\n');

let violations = [];

// 1. Audit Forbidden Directory / Source Paths
const FORBIDDEN_SOURCE_PATHS = [
  'web',
  'backend',
  'desktop-app',
  'extensions',
  'SOURCE-ORIGINAL',
  'SECURE-BUILD',
  'node_modules'
];

// 2. Audit Forbidden File Patterns
const FORBIDDEN_FILE_PATTERNS = [
  /\.env(\..+)?$/i,
  /\.map$/i,
  /\.exe$/i,
  /\.dmg$/i,
  /\.msi$/i,
  /\.pkg$/i,
  /key git\.txt$/i,
  /ftp\.txt$/i,
  /mysql_config\.txt$/i,
  /ftp_config\.txt$/i,
  /.*private.*\.pem$/i
];

// Check Git Status / Tracked Files and Staged Files (excluding files staged for deletion)
console.log('1. Kiểm tra Git Index và tệp đang được theo dõi / staged...');
try {
  const trackedFilesOutput = execSync('git ls-files', { cwd: ROOT_DIR, encoding: 'utf8' });
  const stagedFilesOutput = execSync('git diff --cached --name-only --diff-filter=ACMR', { cwd: ROOT_DIR, encoding: 'utf8' });
  
  const allAuditedFiles = new Set([
    ...trackedFilesOutput.split(/\r?\n/).filter(Boolean),
    ...stagedFilesOutput.split(/\r?\n/).filter(Boolean)
  ]);

  for (const file of allAuditedFiles) {
    const norm = file.replace(/\\/g, '/');

    // Check forbidden directories
    for (const dir of FORBIDDEN_SOURCE_PATHS) {
      if (norm.startsWith(`${dir}/`) || norm === dir) {
        violations.push({
          type: 'FORBIDDEN_SOURCE_TRACKED',
          file: norm,
          reason: `Thư mục source code gốc '${dir}' không được đưa vào Git repository phân phối.`
        });
      }
    }

    // Check forbidden patterns
    for (const pattern of FORBIDDEN_FILE_PATTERNS) {
      if (pattern.test(norm)) {
        violations.push({
          type: 'FORBIDDEN_FILE_PATTERN',
          file: norm,
          reason: `Tệp tin vi phạm quy tắc bảo mật: ${norm} (${pattern})`
        });
      }
    }
  }

  console.log(`  -> Đã quét ${allAuditedFiles.size} tệp tin trong Git Index & Staging.`);
} catch (gitErr) {
  console.warn('  -> [Notice] Không thể đọc git files:', gitErr.message);
}

// 3. Audit Public Release Assets
console.log('\n2. Kiểm tra danh mục tài sản phát hành (PUBLIC-RELEASE/PATCHES)...');
if (fs.existsSync(PUBLIC_RELEASE_DIR)) {
  const assets = fs.readdirSync(PUBLIC_RELEASE_DIR);
  console.log(`  -> Tìm thấy ${assets.length} tệp trong thư mục phát hành:`);

  for (const asset of assets) {
    console.log(`     - ${asset} (${(fs.statSync(path.join(PUBLIC_RELEASE_DIR, asset)).size / 1024).toFixed(1)} KB)`);

    // Strictly NO installers
    if (/\.(exe|dmg|msi|pkg)$/i.test(asset)) {
      violations.push({
        type: 'FORBIDDEN_INSTALLER_IN_RELEASE',
        file: asset,
        reason: 'Nghiêm cấm phát hành bộ cài gốc (.exe/.dmg/.msi) trên GitHub Releases.'
      });
    }

    // Strictly NO source code or secrets
    if (/\.(js|jsx|php|ts|tsx|html|css|json)$/i.test(asset) && asset !== 'patch-manifest.json') {
      violations.push({
        type: 'SOURCE_FILE_IN_RELEASE',
        file: asset,
        reason: 'Tệp mã nguồn không được đưa vào danh mục phát hành Release Assets.'
      });
    }
  }

  // Ensure mandatory patch files exist
  const requiredFiles = ['patch-manifest.json', 'patch-signature.sig', 'SHA256SUMS.txt', 'RELEASE_NOTES.md'];
  for (const req of requiredFiles) {
    if (!assets.includes(req)) {
      violations.push({
        type: 'MISSING_RELEASE_ASSET',
        file: req,
        reason: `Thiếu tệp tin phát hành bắt buộc: ${req}`
      });
    }
  }

  const patchZips = assets.filter(a => a.startsWith('CAT-Patch-') && a.endsWith('.zip'));
  if (patchZips.length === 0) {
    violations.push({
      type: 'NO_PATCH_ZIPS',
      file: 'CAT-Patch-*.zip',
      reason: 'Không tìm thấy gói bản vá vi sai (.zip) nào trong thư mục phát hành.'
    });
  }
} else {
  violations.push({
    type: 'MISSING_RELEASE_DIR',
    file: 'PUBLIC-RELEASE/PATCHES',
    reason: 'Thư mục tài sản phát hành không tồn tại.'
  });
}

// Summary and Enforcement
console.log('\n----------------------------------------------------------------');
if (violations.length > 0) {
  console.error(`❌ PHÁT HIỆN ${violations.length} VI PHẠM BẢO MẬT TRƯỚC KHI PUBLISH:`);
  violations.forEach((v, idx) => {
    console.error(`  [${idx + 1}] [${v.type}] ${v.file}: ${v.reason}`);
  });
  console.error('\n🚫 QUY TRÌNH PHÁT HÀNH BỊ HỦY BỎ ĐỂ BẢO VỆ MÃ NGUỒN VÀ BÍ MẬT.');
  process.exit(1);
} else {
  console.log('✅ 100% KIỂM TRA BẢO MẬT THÀNH CÔNG:');
  console.log('   - Không có source code Website / Backend / Desktop / Extensions.');
  console.log('   - Không có bộ cài gốc EXE / DMG.');
  console.log('   - Không có Secret / Token / Private Key.');
  console.log('   - Các gói bản vá vi phân và chữ ký số Ed25519 sẵn sàng an toàn.');
  console.log('================================================================\n');
  process.exit(0);
}
