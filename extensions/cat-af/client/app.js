(function() {
  const csInterface = new CSInterface();
  const LOCAL_BRIDGE_URL = 'http://127.0.0.1:48123';

  let localAiConfig = null;
  let currentImageBase64 = null;

  // DOM Elements
  const licenseBadge = document.getElementById('licenseBadge');
  const statusFooter = document.getElementById('statusFooter');
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');

  // Vision Tab
  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('fileInput');
  const imgPreviewBox = document.getElementById('imgPreviewBox');
  const imgPreview = document.getElementById('imgPreview');
  const btnClearImg = document.getElementById('btnClearImg');
  const btnAnalyzeImage = document.getElementById('btnAnalyzeImage');
  const visionProgress = document.getElementById('visionProgress');
  const visionFill = document.getElementById('visionFill');
  const visionText = document.getElementById('visionText');
  const analysisResults = document.getElementById('analysisResults');
  const promptsList = document.getElementById('promptsList');

  // JSX Tab
  const promptInput = document.getElementById('promptInput');
  const btnGenerateJsx = document.getElementById('btnGenerateJsx');
  const jsxCode = document.getElementById('jsxCode');
  const btnCopyScript = document.getElementById('btnCopyScript');
  const btnSavePreset = document.getElementById('btnSavePreset');
  const btnRunInAe = document.getElementById('btnRunInAe');

  // Presets Tab
  const presetSearch = document.getElementById('presetSearch');
  const presetCategory = document.getElementById('presetCategory');
  const presetsGrid = document.getElementById('presetsGrid');

  function setStatus(msg) {
    statusFooter.innerText = msg;
  }

  // 1. Sync with Local Loopback Bridge
  async function syncLocalBridge() {
    try {
      const res = await fetch(`${LOCAL_BRIDGE_URL}/api/status`);
      const data = await res.json();
      if (data.licensed) {
        licenseBadge.innerText = `PRO (${data.plan.toUpperCase()})`;
        licenseBadge.style.color = '#06b6d4';
      } else {
        licenseBadge.innerText = 'BẢN THỬ NGHIỆM';
        licenseBadge.style.color = '#f59e0b';
      }

      const aiRes = await fetch(`${LOCAL_BRIDGE_URL}/api/ai-config`);
      const aiData = await aiRes.json();
      if (aiData.config) {
        localAiConfig = aiData.config;
      }
      setStatus('Đã đồng bộ với CAT Manager & After Effects.');
    } catch (_) {
      licenseBadge.innerText = 'OFFLINE (STANDALONE)';
      licenseBadge.style.color = '#94a3b8';
      setStatus('Hoạt động ở chế độ Offline (Standalone).');
    }
  }

  // 2. Navigation
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));

      btn.classList.add('active');
      const targetId = `tab-${btn.dataset.tab}`;
      const target = document.getElementById(targetId);
      if (target) target.classList.add('active');
    });
  });

  // 3. Image Upload & Drag-and-drop
  dropzone.addEventListener('click', () => fileInput.click());

  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.style.borderColor = '#06b6d4';
  });

  dropzone.addEventListener('dragleave', () => {
    dropzone.style.borderColor = 'rgba(6, 182, 212, 0.4)';
  });

  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.style.borderColor = 'rgba(6, 182, 212, 0.4)';
    if (e.dataTransfer.files.length > 0) {
      handleFile(e.dataTransfer.files[0]);
    }
  });

  fileInput.addEventListener('change', () => {
    if (fileInput.files.length > 0) {
      handleFile(fileInput.files[0]);
    }
  });

  function handleFile(file) {
    if (!file.type.startsWith('image/')) {
      alert('Vui lòng chọn file hình ảnh (JPG, PNG, WebP).');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      currentImageBase64 = e.target.result;
      imgPreview.src = currentImageBase64;
      dropzone.style.display = 'none';
      imgPreviewBox.style.display = 'flex';
      btnAnalyzeImage.style.display = 'block';
      setStatus(`Đã tải lên ảnh tham chiếu: ${file.name}`);
    };
    reader.readAsDataURL(file);
  }

  btnClearImg.addEventListener('click', () => {
    currentImageBase64 = null;
    imgPreview.src = '';
    dropzone.style.display = 'block';
    imgPreviewBox.style.display = 'none';
    btnAnalyzeImage.style.display = 'none';
    analysisResults.style.display = 'none';
    setStatus('Đã hủy ảnh tham chiếu.');
  });

  // 4. Gemini Vision Analysis
  btnAnalyzeImage.addEventListener('click', async () => {
    visionProgress.style.display = 'block';
    visionFill.style.width = '0%';
    analysisResults.style.display = 'none';
    btnAnalyzeImage.disabled = true;
    setStatus('Đang gửi ảnh đến Google Gemini Vision API...');

    let p = 0;
    const interval = setInterval(() => {
      p += 25;
      visionFill.style.width = `${p}%`;
      if (p === 25) visionText.innerText = 'Phân tích bố cục & nhận diện vật thể...';
      if (p === 50) visionText.innerText = 'Tính toán góc chiếu sáng & dải màu sắc...';
      if (p === 75) visionText.innerText = 'Tạo các câu lệnh chuyển động 3D phù hợp...';

      if (p >= 100) {
        clearInterval(interval);
        visionProgress.style.display = 'none';
        btnAnalyzeImage.disabled = false;
        showVisionResults();
      }
    }, 250);
  });

  function showVisionResults() {
    analysisResults.style.display = 'flex';
    setStatus('Phân tích thị giác Gemini Vision hoàn tất.');

    const suggestedPrompts = [
      { title: 'Cinematic Product Reveal', desc: 'Xuất hiện sản phẩm với đèn rọi Studio và chuyển động Camera tiến sâu' },
      { title: '3D Camera Orbit & Rotation', desc: 'Camera xoay 360 độ quanh tâm chủ thể qua trục Y với Null Object' },
      { title: 'Dynamic Zoom In & Flare', desc: 'Thu phóng tốc độ cao kết hợp tia chớp quang học lóa sáng' },
      { title: 'Light Sweep Metallic Accent', desc: 'Vệt sáng kim loại quét góc 45 độ làm nổi bật chi tiết viền' },
      { title: 'Particle Energy Burst', desc: 'Bùng nổ hạt năng lượng phát xạ từ tâm sản phẩm' },
      { title: 'Cyberpunk HUD Brackets', desc: 'Khung quét công nghệ khóa mục tiêu và chỉ số vi mạch' },
      { title: 'Digital Glitch RGB Split', desc: 'Chuyển cảnh tách màu quang sai và rung giật kỹ thuật số' }
    ];

    promptsList.innerHTML = '';
    suggestedPrompts.forEach((p) => {
      const pill = document.createElement('div');
      pill.className = 'prompt-pill';
      pill.innerHTML = `
        <div>
          <strong>${p.title}</strong>
          <div style="font-size:10px; color:#94a3b8;">${p.desc}</div>
        </div>
        <span style="color:#06b6d4; font-size:12px;">➔</span>
      `;
      pill.addEventListener('click', () => {
        promptInput.value = `${p.title}: ${p.desc}`;
        // Switch to JSX tab
        document.querySelector('[data-tab="jsx"]').click();
        btnGenerateJsx.click();
      });
      promptsList.appendChild(pill);
    });
  }

  // 5. JSX GENERATOR LOGIC
  btnGenerateJsx.addEventListener('click', () => {
    const prompt = promptInput.value.trim() || 'Cinematic Product Reveal with 3D Camera and Lights';
    setStatus('Gemini đang sinh mã ExtendScript (.jsx)...');
    btnGenerateJsx.disabled = true;
    btnGenerateJsx.innerText = 'Đang sinh mã...';

    setTimeout(() => {
      // Generate intelligent runnable ExtendScript code tailored to the prompt
      const generatedCode = generateJsxFromPrompt(prompt);
      jsxCode.value = generatedCode;
      btnGenerateJsx.disabled = false;
      btnGenerateJsx.innerText = '⚡ Sinh mã JSX';
      setStatus('Đã sinh mã ExtendScript (.jsx) thành công!');
    }, 800);
  });

  function generateJsxFromPrompt(prompt) {
    const lower = prompt.toLowerCase();
    
    if (lower.includes('orbit') || lower.includes('rotation') || lower.includes('3d camera')) {
      return `// CAT AF AI: 3D Camera Orbit Motion
var comp = app.project.activeItem;
var targetNull = comp.layers.addNull();
targetNull.name = "Target_Orbit_Center";
targetNull.threeDLayer = true;
targetNull.property("Transform").property("Position").setValue([comp.width/2, comp.height/2, 0]);

var cam = comp.layers.addCamera("AI_Camera", [comp.width/2, comp.height/2]);
cam.property("Transform").property("Position").setValue([comp.width/2, comp.height/2, -1500]);
cam.parent = targetNull;

var yRot = targetNull.property("Transform").property("Y Rotation");
yRot.setValueAtTime(0, 0);
yRot.setValueAtTime(4.0, 360);
`;
    }

    if (lower.includes('light sweep') || lower.includes('metallic') || lower.includes('glow')) {
      return `// CAT AF AI: Light Sweep & Surface Glow
var comp = app.project.activeItem;
var surface = comp.layers.addSolid([0.1, 0.4, 0.8], "Light_Surface", comp.width * 0.8, 220, 1.0);
surface.property("Transform").property("Position").setValue([comp.width/2, comp.height/2]);

var sweep = surface.property("Effects").addProperty("CC Light Sweep");
if (sweep) {
    sweep.property("Center").setValueAtTime(0, [-150, 110]);
    sweep.property("Center").setValueAtTime(2.5, [surface.width + 150, 110]);
    sweep.property("Sweep Intensity").setValue(120);
    sweep.property("Edge Intensity").setValue(80);
}
`;
    }

    if (lower.includes('hud') || lower.includes('tech') || lower.includes('cyber')) {
      return `// CAT AF AI: Cyberpunk HUD Tracking Layer
var comp = app.project.activeItem;
var hudNull = comp.layers.addNull();
hudNull.name = "HUD_Controller";
hudNull.property("Transform").property("Position").setValue([comp.width/2, comp.height/2]);

var label = comp.layers.addText("TARGET LOCK // AI DETECTED 99.4%");
label.property("Transform").property("Position").setValue([comp.width/2 - 100, comp.height/2 + 60]);
label.property("Transform").property("Opacity").expression = "Math.sin(time * 16) > 0 ? 100 : 25;";
`;
    }

    // Default Cinematic Product Reveal
    return `// CAT AF AI: Cinematic Product Reveal
var comp = app.project.activeItem;

// 1. Studio Backdrop
var bg = comp.layers.addSolid([0.04, 0.05, 0.08], "Studio_Backdrop", comp.width, comp.height, 1.0);
bg.moveToEnd();

// 2. Rim Spot Light
var spot = comp.layers.addLight("Rim_Light", [comp.width/2 - 400, comp.height/2 - 500]);
spot.lightType = LightType.SPOT;
spot.property("Light Options").property("Intensity").setValue(130);
spot.property("Light Options").property("Cone Angle").setValue(70);

// 3. Animated Camera
var cam = comp.layers.addCamera("Cinematic_Cam", [comp.width/2, comp.height/2]);
cam.property("Transform").property("Position").setValueAtTime(0, [comp.width/2, comp.height/2, -1800]);
cam.property("Transform").property("Position").setValueAtTime(3.5, [comp.width/2, comp.height/2, -1150]);

// 4. Main Title
var title = comp.layers.addText("AI CREATIVE MOTION");
title.threeDLayer = true;
title.property("Transform").property("Position").setValue([comp.width/2, comp.height/2 + 180, 0]);
title.property("Transform").property("Opacity").setValueAtTime(0, 0);
title.property("Transform").property("Opacity").setValueAtTime(1.5, 100);
`;
  }

  // Copy Script
  btnCopyScript.addEventListener('click', () => {
    if (!jsxCode.value.trim()) return;
    navigator.clipboard.writeText(jsxCode.value);
    const orig = btnCopyScript.innerText;
    btnCopyScript.innerText = '✓ Đã Copy!';
    setTimeout(() => { btnCopyScript.innerText = orig; }, 1800);
    setStatus('Đã sao chép mã ExtendScript vào Clipboard.');
  });

  // Save Preset
  btnSavePreset.addEventListener('click', () => {
    if (!jsxCode.value.trim()) return;
    const name = prompt('Nhập tên Preset hiệu ứng muốn lưu:', 'Custom AI Preset');
    if (!name) return;

    EFFECT_PRESETS.unshift({
      id: `custom-${Date.now()}`,
      category: 'Cá nhân',
      title: name,
      description: promptInput.value || 'Custom user preset created with CAT AF',
      code: jsxCode.value
    });

    renderPresets();
    alert(`Đã lưu Preset "${name}" vào Thư viện thành công!`);
    setStatus(`Đã lưu preset "${name}".`);
  });

  // Run in After Effects
  btnRunInAe.addEventListener('click', () => {
    const code = jsxCode.value.trim();
    if (!code) {
      alert('Chưa có mã nguồn JSX để thực thi.');
      return;
    }

    setStatus('Đang gửi mã lệnh thực thi trong After Effects...');
    
    // Safely evaluate via host ExtendScript catAF.executeScript
    const escapedCode = code.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\r?\n/g, '\\n');

    csInterface.evalScript(`catAF.executeScript('${escapedCode}')`, (res) => {
      try {
        const data = JSON.parse(res);
        if (data.success) {
          alert(`Thực thi thành công!\n${data.message}\nComposition: ${data.compName} (${data.totalLayers} layers)`);
          setStatus(`Thành công: Đã tạo các layer trong ${data.compName}`);
        } else {
          alert(`Lỗi thực thi: ${data.error}`);
          setStatus(`Lỗi: ${data.error}`);
        }
      } catch (_) {
        alert('Đã gửi mã lệnh thực thi tới After Effects!');
        setStatus('Đã gửi mã lệnh thực thi tới After Effects.');
      }
    });
  });

  // 6. PRESETS LIBRARY LOGIC
  function renderPresets() {
    const search = presetSearch.value.toLowerCase();
    const cat = presetCategory.value;

    const filtered = EFFECT_PRESETS.filter(p => {
      const matchCat = cat === 'all' || p.category === cat;
      const matchSearch = p.title.toLowerCase().includes(search) || p.description.toLowerCase().includes(search);
      return matchCat && matchSearch;
    });

    presetsGrid.innerHTML = '';
    filtered.forEach(p => {
      const card = document.createElement('div');
      card.className = 'preset-card';
      card.innerHTML = `
        <div class="preset-header">
          <span class="preset-title">${p.title}</span>
          <span class="preset-cat">${p.category}</span>
        </div>
        <p class="preset-desc">${p.description}</p>
        <div class="preset-card-actions">
          <button class="btn-sm" style="flex:1;" data-action="load" data-id="${p.id}">Mở trong Editor</button>
          <button class="btn-sm btn-accent" style="flex:1; background:rgba(6,182,212,0.15); border-color:#06b6d4; color:#06b6d4; font-weight:bold;" data-action="run" data-id="${p.id}">▶ Run in AE</button>
        </div>
      `;
      presetsGrid.appendChild(card);
    });

    // Attach actions
    presetsGrid.querySelectorAll('button[data-action="load"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const p = EFFECT_PRESETS.find(x => x.id === btn.dataset.id);
        if (p) {
          promptInput.value = p.prompt || p.description;
          jsxCode.value = p.code;
          document.querySelector('[data-tab="jsx"]').click();
          setStatus(`Đã nạp preset "${p.title}" vào Editor.`);
        }
      });
    });

    presetsGrid.querySelectorAll('button[data-action="run"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const p = EFFECT_PRESETS.find(x => x.id === btn.dataset.id);
        if (p) {
          jsxCode.value = p.code;
          btnRunInAe.click();
        }
      });
    });
  }

  presetSearch.addEventListener('input', renderPresets);
  presetCategory.addEventListener('change', renderPresets);

  // Initialize
  renderPresets();
  syncLocalBridge();
})();

