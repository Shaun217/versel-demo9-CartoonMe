let base64Image = null;
let imageMimeType = null;

function toggleSettings() {
    document.querySelector('.settings-box').classList.toggle('closed');
}

function handleFile(event) {
    const file = event.target.files[0];
    if (file) {
        if (file.size > 5 * 1024 * 1024) alert("图片较大，建议压缩");
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
    const selectedModel = document.getElementById('modelSelect').value; // 获取选择的模型 (flux/turbo)
    
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
        // --- STEP 1: Gemini 描述内容 ---
        loadingText.innerText = "🔍 提取特征...";
        const modelName = await getModelName(apiKey);
        
        const systemPrompt = `
        Task: Describe the main subject and action in the image concisely.
        
        Rules:
        1. Start directly with the subject (e.g., "A cute cat sitting on a rug").
        2. Describe colors and key features clearly.
        3. DO NOT use words like "photo", "realistic", "camera", "image". 
        4. Focus only on visual content.
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
        const contentDescription = data.candidates[0].content.parts[0].text.trim();

        // --- STEP 2: 构造强力咒语 ---
        const finalPrompt = `${stylePrompt}, ${contentDescription}, masterpiece, high quality`;
        
        debugText.innerText = `[Model: ${selectedModel}] ${finalPrompt}`;

        // --- STEP 3: Pollinations 绘图 (带负面提示词) ---
        loadingText.innerText = "🎨 正在重绘...";
        
        const randomSeed = Math.floor(Math.random() * 99999);
        
        // 关键点：添加 negative 参数，禁止生成照片风格
        // 关键点：根据用户选择切换 model (flux 或 turbo)
        const negativePrompt = "photo, realistic, realism, photography, camera, blurry, distorted";
        
        const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(finalPrompt)}?width=1024&height=1024&seed=${randomSeed}&model=${selectedModel}&negative=${encodeURIComponent(negativePrompt)}&nolog=true`;

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