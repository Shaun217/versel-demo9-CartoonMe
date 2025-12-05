let base64Image = null;
let imageMimeType = null;

function toggleSettings() {
    document.querySelector('.settings-box').classList.toggle('closed');
}

function handleFile(event) {
    const file = event.target.files[0];
    if (file) {
        // 这里的限制稍微放宽一点
        if (file.size > 8 * 1024 * 1024) alert("图片较大，AI 分析可能需要一点时间~");
        
        const reader = new FileReader();
        reader.onload = function(e) {
            const raw = e.target.result;
            document.getElementById('originalPreview').src = raw;
            document.getElementById('originalPreview').classList.remove('hidden');
            document.getElementById('uploadPlaceholder').classList.add('hidden');
            base64Image = raw.split(',')[1];
            imageMimeType = file.type;
        };
        reader.readAsDataURL(file);
    }
}

async function getModelName(apiKey) {
    try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
        const data = await res.json();
        const model = data.models?.find(m => m.name.includes('flash')) || 
                      data.models?.find(m => m.name.includes('pro'));
        return model ? model.name.replace('models/', '') : 'gemini-1.5-flash';
    } catch {
        return 'gemini-1.5-flash';
    }
}

async function startConversion() {
    const apiKey = document.getElementById('apiKey').value.trim();
    const stylePrompt = document.getElementById('styleSelect').value;
    const selectedModel = document.getElementById('modelSelect').value;
    
    if (!apiKey) {
        toggleSettings();
        return alert("请填入 Google API Key");
    }
    if (!base64Image) return alert("请先上传照片");

    const genBtn = document.getElementById('generateBtn');
    const dlBtn = document.getElementById('downloadBtn');
    const loadingState = document.getElementById('loadingState');
    const loadingText = document.getElementById('loadingText');
    const resultImg = document.getElementById('cartoonResult');
    const debugText = document.getElementById('debugPrompt');

    // UI 锁定
    genBtn.disabled = true;
    genBtn.innerText = "⏳ 魔法施展中...";
    dlBtn.classList.add('hidden');
    resultImg.classList.add('hidden');
    loadingState.classList.remove('hidden');

    try {
        // --- STEP 1: Gemini 视觉分析 ---
        loadingText.innerText = "🔍 正在分析图片细节...";
        const modelName = await getModelName(apiKey);
        
        const systemPrompt = `
        Task: Describe the visual content of this image concisely for an AI artist.
        
        Rules:
        1. Start with the main subject (e.g., "A golden retriever sitting on grass").
        2. Describe colors, lighting, and key features clearly.
        3. DO NOT use words like "photo", "realistic", "camera", "realism". 
        4. Output only the description text.
        `;

        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contents: [{
                    parts: [
                        { text: systemPrompt },
                        { inline_data: { mime_type: imageMimeType, data: base64Image } }
                    ]
                }]
            })
        });

        const data = await res.json();
        if (!data.candidates) throw new Error("Gemini 无法连接，请检查 Key 或网络");
        const contentDescription = data.candidates[0].content.parts[0].text.trim();

        // --- STEP 2: 构造强力咒语 ---
        // 结构：风格 + 内容 + 高质量词缀
        const finalPrompt = `${stylePrompt}, ${contentDescription}, masterpiece, high quality, 8k`;
        debugText.innerText = `[${selectedModel.toUpperCase()}] ${finalPrompt}`;

        // --- STEP 3: Pollinations 绘图 (带超时优化) ---
        loadingText.innerText = selectedModel === 'flux' ? 
            "🎨 正在精细绘制 (Flux较慢，请耐心等待)..." : 
            "⚡ 正在极速生成 (Turbo)...";
        
        const randomSeed = Math.floor(Math.random() * 99999);
        const negativePrompt = "photo, realistic, photography, camera, text, watermark, bad anatomy, blurry, distorted";
        
        // 构造 URL
        const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(finalPrompt)}?width=1024&height=1024&seed=${randomSeed}&model=${selectedModel}&negative=${encodeURIComponent(negativePrompt)}&nolog=true`;

        // 图片预加载
        const tempImg = new Image();
        tempImg.src = imageUrl;
        
        // 🔥 关键修改：将超时时间从 40s 延长到 90s (1分半) 🔥
        // Flux 模型有时需要排队，90s 比较保险
        const timeout = new Promise((_, reject) => 
            setTimeout(() => reject(new Error("服务器繁忙，生成超时。请尝试切换 Turbo 模型，或稍后再试。")), 90000)
        );

        await Promise.race([
            new Promise(resolve => tempImg.onload = resolve),
            timeout
        ]);

        // 显示结果
        resultImg.src = imageUrl;
        resultImg.classList.remove('hidden');
        loadingState.classList.add('hidden');
        dlBtn.classList.remove('hidden');
        
    } catch (error) {
        console.error(error);
        alert("出错了: " + error.message);
        loadingState.classList.add('hidden');
    } finally {
        // 无论成功失败，恢复按钮状态
        genBtn.disabled = false;
        genBtn.innerText = "🚀 强力变身！";
    }
}

function downloadImage() {
    const img = document.getElementById('cartoonResult');
    if (img.src) window.open(img.src, '_blank');
}