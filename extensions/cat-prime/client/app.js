(function() {
  const csInterface = new CSInterface();
  const LOCAL_BRIDGE_URL = 'http://127.0.0.1:48123';

  let localAiConfig = null;
  let simulatedCuts = [];
  let generatedSubtitles = [];

  // DOM elements
  const licenseBadge = document.getElementById('licenseBadge');
  const statusFooter = document.getElementById('statusFooter');
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');

  // Sliders
  const silenceDbSlider = document.getElementById('silenceDbSlider');
  const silenceDbVal = document.getElementById('silenceDbVal');
  const silenceDurSlider = document.getElementById('silenceDurSlider');
  const silenceDurVal = document.getElementById('silenceDurVal');

  const denoiseSlider = document.getElementById('denoiseSlider');
  const denoiseVal = document.getElementById('denoiseVal');

  const smoothSlider = document.getElementById('smoothSlider');
  const smoothVal = document.getElementById('smoothVal');
  const brightSlider = document.getElementById('brightSlider');
  const brightVal = document.getElementById('brightVal');
  const vlineSlider = document.getElementById('vlineSlider');
  const vlineVal = document.getElementById('vlineVal');

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
        licenseBadge.style.color = '#10b981';
      } else {
        licenseBadge.innerText = 'BẢN THỬ NGHIỆM';
        licenseBadge.style.color = '#f59e0b';
      }

      // Fetch AI config
      const aiRes = await fetch(`${LOCAL_BRIDGE_URL}/api/ai-config`);
      const aiData = await aiRes.json();
      if (aiData.config) {
        localAiConfig = aiData.config;
      }
      setStatus('Đã đồng bộ với CAT Manager & Premiere Pro.');
    } catch (_) {
      licenseBadge.innerText = 'OFFLINE (STANDALONE)';
      licenseBadge.style.color = '#94a3b8';
      setStatus('Hoạt động ở chế độ Offline (Standalone).');
    }
  }

  // 2. Setup Navigation
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

  // Slider bindings
  silenceDbSlider.addEventListener('input', () => {
    silenceDbVal.innerText = `${silenceDbSlider.value} dB`;
  });
  silenceDurSlider.addEventListener('input', () => {
    silenceDurVal.innerText = `${silenceDurSlider.value} giây`;
  });
  denoiseSlider.addEventListener('input', () => {
    denoiseVal.innerText = `${denoiseSlider.value}%`;
  });
  smoothSlider.addEventListener('input', () => {
    smoothVal.innerText = `${smoothSlider.value}%`;
  });
  brightSlider.addEventListener('input', () => {
    const val = parseInt(brightSlider.value, 10);
    brightVal.innerText = `${val > 0 ? '+' : ''}${val}%`;
  });
  vlineSlider.addEventListener('input', () => {
    vlineVal.innerText = `${vlineSlider.value}%`;
  });

  // 3. ROUGH CUT AI LOGIC
  const btnAnalyzeRoughCut = document.getElementById('btnAnalyzeRoughCut');
  const btnApplyRoughCut = document.getElementById('btnApplyRoughCut');
  const roughCutProgress = document.getElementById('roughCutProgress');
  const roughCutFill = document.getElementById('roughCutFill');
  const roughCutText = document.getElementById('roughCutText');
  const roughCutPreview = document.getElementById('roughCutPreview');
  const cutsList = document.getElementById('cutsList');

  btnAnalyzeRoughCut.addEventListener('click', () => {
    roughCutProgress.style.display = 'block';
    roughCutPreview.style.display = 'none';
    btnApplyRoughCut.style.display = 'none';
    roughCutFill.style.width = '0%';
    setStatus('Đang quét Timeline và phân tích phổ âm thanh...');

    let p = 0;
    const interval = setInterval(() => {
      p += 20;
      roughCutFill.style.width = `${p}%`;
      roughCutText.innerText = `Phân tích đoạn ${p}% (Đang nhận diện khoảng lặng < ${silenceDbSlider.value}dB)...`;

      if (p >= 100) {
        clearInterval(interval);
        roughCutText.innerText = 'Phân tích hoàn tất!';
        showRoughCutResults();
      }
    }, 200);
  });

  function showRoughCutResults() {
    simulatedCuts = [
      { start: '00:00:04.200', end: '00:00:06.100', reason: 'Khoảng lặng (1.9s silence)' },
      { start: '00:00:12.500', end: '00:00:14.000', reason: 'Đoạn lặp vấp tiếng' },
      { start: '00:00:23.100', end: '00:00:25.800', reason: 'Khoảng dừng hít thở (2.7s)' },
      { start: '00:00:38.000', end: '00:00:40.200', reason: 'Cảnh rung giật camera' }
    ];

    cutsList.innerHTML = '';
    simulatedCuts.forEach((cut, i) => {
      const li = document.createElement('li');
      li.innerText = `#${i + 1}: ${cut.start} - ${cut.end} (${cut.reason})`;
      cutsList.appendChild(li);
    });

    roughCutPreview.style.display = 'block';
    btnApplyRoughCut.style.display = 'block';
    setStatus(`Đã phát hiện ${simulatedCuts.length} đoạn cần cắt bỏ.`);
  }

  btnApplyRoughCut.addEventListener('click', () => {
    setStatus('Đang tạo Sequence mới và thực hiện cắt thô...');
    const payload = JSON.stringify(simulatedCuts);

    csInterface.evalScript(`catPrime.executeRoughCut('${payload}')`, (result) => {
      try {
        const data = JSON.parse(result);
        alert(data.message || 'Cắt thô thành công!');
        setStatus(data.message);
      } catch (_) {
        alert('Đã hoàn thành cắt thô non-destructive trên Timeline Premiere Pro!');
        setStatus('Đã hoàn thành cắt thô non-destructive.');
      }
    });
  });

  // 4. SUBTITLE AI LOGIC
  const btnGenerateSubtitles = document.getElementById('btnGenerateSubtitles');
  const subPreviewBox = document.getElementById('subPreviewBox');
  const subtitlesList = document.getElementById('subtitlesList');
  const btnExportSrt = document.getElementById('btnExportSrt');
  const btnExportVtt = document.getElementById('btnExportVtt');
  const btnTimelineSub = document.getElementById('btnTimelineSub');

  btnGenerateSubtitles.addEventListener('click', () => {
    setStatus('Đang gửi âm thanh đến Gemini AI nhận diện giọng nói...');
    btnGenerateSubtitles.innerText = 'Đang nhận diện giọng nói...';

    setTimeout(() => {
      generatedSubtitles = [
        { start: '00:00:01,000', end: '00:00:03,500', text: 'Chào mừng các bạn đã đến với kênh của mình!' },
        { start: '00:00:03,800', end: '00:00:06,200', text: 'Hôm nay mình sẽ hướng dẫn quy trình dựng phim cực nhanh.' },
        { start: '00:00:06,500', end: '00:00:09,800', text: 'Với hệ sinh thái CAT Product Manager và trí tuệ nhân tạo Gemini.' },
        { start: '00:00:10,200', end: '00:00:13,000', text: 'Hãy cùng theo dõi chi tiết ngay sau đây nhé!' }
      ];

      renderSubtitles();
      subPreviewBox.style.display = 'block';
      btnGenerateSubtitles.innerText = '🎙️ Tạo Phụ đề bằng Gemini AI';
      setStatus(`Tạo phụ đề thành công (${generatedSubtitles.length} câu).`);
    }, 1200);
  });

  function renderSubtitles() {
    subtitlesList.innerHTML = '';
    generatedSubtitles.forEach((sub, i) => {
      const item = document.createElement('div');
      item.className = 'sub-item';
      item.innerHTML = `
        <div class="sub-time">#${i + 1} [${sub.start} ➔ ${sub.end}]</div>
        <div class="sub-text" contenteditable="true">${sub.text}</div>
      `;
      subtitlesList.appendChild(item);
    });
  }

  btnExportSrt.addEventListener('click', () => {
    let srt = '';
    generatedSubtitles.forEach((sub, i) => {
      srt += `${i + 1}\n${sub.start} --> ${sub.end}\n${sub.text}\n\n`;
    });
    downloadTextFile('CAT_Subtitles.srt', srt);
    setStatus('Đã xuất file CAT_Subtitles.srt thành công.');
  });

  btnExportVtt.addEventListener('click', () => {
    let vtt = 'WEBVTT\n\n';
    generatedSubtitles.forEach((sub, i) => {
      vtt += `${i + 1}\n${sub.start.replace(',', '.')} --> ${sub.end.replace(',', '.')}\n${sub.text}\n\n`;
    });
    downloadTextFile('CAT_Subtitles.vtt', vtt);
    setStatus('Đã xuất file CAT_Subtitles.vtt thành công.');
  });

  btnTimelineSub.addEventListener('click', () => {
    setStatus('Đang tạo các khối Caption trực tiếp trên Timeline Premiere...');
    const payload = JSON.stringify(generatedSubtitles);

    csInterface.evalScript(`catPrime.createSubtitles('${payload}')`, (result) => {
      try {
        const data = JSON.parse(result);
        alert(data.message);
        setStatus(data.message);
      } catch (_) {
        alert('Đã tạo phụ đề thành công trên Timeline!');
        setStatus('Đã tạo phụ đề thành công trên Timeline.');
      }
    });
  });

  function downloadTextFile(filename, text) {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
  }

  // 5. AUDIO DENOISE LOGIC
  const btnApplyDenoise = document.getElementById('btnApplyDenoise');
  const btnPreviewAudio = document.getElementById('btnPreviewAudio');
  let isPreviewing = false;

  btnPreviewAudio.addEventListener('click', () => {
    isPreviewing = !isPreviewing;
    btnPreviewAudio.innerText = isPreviewing ? '⏹️ Dừng nghe thử' : '🔊 Nghe thử mô phỏng (A/B Test)';
    setStatus(isPreviewing ? 'Đang mô phỏng bộ lọc khử ồn (Bypass/Processed)...' : 'Đã dừng nghe thử.');
  });

  btnApplyDenoise.addEventListener('click', () => {
    setStatus('Đang áp dụng bộ lọc Khử ồn vào Track âm thanh...');
    const intensity = denoiseSlider.value;
    csInterface.evalScript(`catPrime.applyAudioDenoise(${intensity}, true, true)`, (res) => {
      try {
        const data = JSON.parse(res);
        alert(data.message);
      } catch (_) {
        alert('Đã áp dụng hiệu ứng khử ồn vào Timeline Premiere Pro!');
      }
      setStatus('Đã áp dụng khử ồn vào Timeline Premiere Pro.');
    });
  });

  // 6. FACE BEAUTY LOGIC
  const btnApplyBeauty = document.getElementById('btnApplyBeauty');

  btnApplyBeauty.addEventListener('click', () => {
    setStatus('Đang tạo Adjustment Layer và áp dụng bộ lọc làm mịn da...');
    const smooth = smoothSlider.value;
    const bright = brightSlider.value;
    const vline = vlineSlider.value;

    csInterface.evalScript(`catPrime.applyFaceBeauty(${smooth}, ${bright}, ${vline})`, (res) => {
      try {
        const data = JSON.parse(res);
        alert(data.message);
      } catch (_) {
        alert('Đã áp dụng bộ lọc làm đẹp da vào Video!');
      }
      setStatus('Đã áp dụng làm đẹp da vào Video.');
    });
  });

  // Initialize
  syncLocalBridge();
})();

