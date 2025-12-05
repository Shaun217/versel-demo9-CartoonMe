let base64Image = null;
let imageMimeType = null;

function toggleSettings() {
    document.querySelector('.settings-box').classList.toggle('closed');
}

function handleFile(event) {
    const file = event.target.files[0];
    if (file) {
        if (file.size > 5 * 1024 * 1024) alert("图片较大，请耐心等待~");
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
    // 获取用户选择的“强力风格咒语”
    const stylePrompt = document.getElementById('styleSelect').value;
    
    if (!apiKey) {
        toggleSettings();
        return alert("请填入 API Key");
    }
    if (!base64Image) return alert("请上传图片");

    const genBtn = document.getElementById('generateBtn');
    const dlBtn = document.getElementById('downloadBtn');
    const loadingState = document.getElementById('loadingState');
    const loadingText = document.getElementById('loadingText');
    const resultImg = document.getElementById('cartoonResult');
    const debugText = document.getElementById('debugPrompt');

    genBtn.disabled = true;
    dlBtn.classList.add('hidden');
    resultImg.classList.add('hidden');
    loadingState.classList.remove('hidden');

    try {
        // --- STEP 1: 让 Gemini 只提取内容，不要描述风格 ---
        loadingText.innerText = "🔍 提取画面主体特征...";
        const modelName = await getModelName(apiKey);
        
        const systemPrompt = `
        Task: Analyze the image and provide a concise visual description of the MAIN SUBJECT and BACKGROUND only.
        
        Strict Guidelines:
        1. Describe WHAT is in the image (e.g., "a young man wearing a red hoodie holding a coffee cup").
        2. Describe the pose, expression, and key colors accurately.
        3. DO NOT describe the image style (do NOT say "this is a photo", "realistic", "camera shot"). 
        4. Focus on visual elements that need to be drawn.
        5. Output raw text only.
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
        if (!data.candidates) throw new Error("Gemini 识别失败");
        
        // Gemini 提取出的纯内容描述 (例如：A cat sitting on table)
        const contentDescription = data.candidates[0].content.parts[0].text.trim();

        // --- STEP 2: 拼接“三明治”咒语 ---
        // 结构：[强力风格] + [内容描述] + [画质增强]
        const finalPrompt = `(${stylePrompt}), ${contentDescription}, masterpiece, best quality, 8k resolution`;
        
        console.log("最终咒语:", finalPrompt);
        debugText.innerText = finalPrompt;

        // --- STEP 3: Pollinations 绘图 ---
        loadingText.innerText = "🎨 正在重绘风格...";
        
        const randomSeed = Math.floor(Math.random() * 99999);
        // 使用 flux 模型 (目前对自然语言理解最好)
        const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(finalPrompt)}?width=1024&height=1024&seed=${randomSeed}&model=flux&nolog=true`;

        const tempImg = new Image();
        tempImg.src = imageUrl;
        
        const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error("超时")), 40000));
        await Promise.race([new Promise(resolve => tempImg.onload = resolve), timeout]);

        resultImg.src = imageUrl;
        resultImg.classList.remove('hidden');
        loadingState.classList.add('hidden');
        dlBtn.classList.remove('hidden');
        genBtn.disabled = false;

    } catch (error) {
        alert("出错了: " + error.message);
        genBtn.disabled = false;
        loadingState.classList.add('hidden');
    }
}

function downloadImage() {
    const img = document.getElementById('cartoonResult');
    if (img.src) window.open(img.src, '_blank');
}