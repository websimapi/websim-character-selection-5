// Color shader and recoloring system
const slotColors = {
    blue: 240,
    green: 120,
    yellow: 60,
    red: 0
};

// Apply CSS filter to shift image color
function applyColorShader(slot) {
    const image = slot.querySelector('.character-image');
    const slotColorName = slot.dataset.color;
    applyColorShaderToImage(image, slotColorName);
}

function applyColorShaderToImage(image, slotColorName) {
    if (!image) return Promise.resolve();

    return new Promise(resolve => {
        const process = async () => {
            const blobUrl = await processAndCacheImage(image, { baseHue: image.dataset.baseHue }, slotColorName);
            if (blobUrl) {
                if (image.dataset.blobUrl) URL.revokeObjectURL(image.dataset.blobUrl);
                image.src = blobUrl;
                image.dataset.blobUrl = blobUrl;
            }
            resolve();
        };
        
        if (image.complete && image.naturalWidth) {
            process();
        } else {
            image.addEventListener('load', process, { once: true });
        }
    });
}

function processAndCacheImage(img, characterData, slotColorName) {
    const baseHue = parseInt(characterData.baseHue, 10);
    const targetHue = slotColors[slotColorName];

    if (baseHue === 120) { 
        return selectiveRecolorArcher(img, targetHue, true);
    }
    if (baseHue === 240) {
        return selectiveRecolorWarrior(img, targetHue, true);
    }
    if (baseHue === 0) {
        return selectiveRecolorValkyrie(img, targetHue, true);
    }
    if (baseHue === 60) {
        return selectiveRecolorWizard(img, targetHue, true);
    }
    
    // For characters without special logic (like Wizard), just return null as CSS filter is fine.
    // We only need to cache canvas-processed images.
    // To implement hue-rotate via canvas for them too, we would add that logic here.
    return Promise.resolve(null);
}