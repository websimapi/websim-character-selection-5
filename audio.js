// Audio system management
let audioContext;
let stoneShiftBuffer;
let backgroundMusicBuffer;
let cartridgeInsertBuffer;
let musicSourceNode = null; // To keep track of the music source
let isMusicPlaying = false;
let stoneShiftLoading = false;

// Function to load a sound
async function loadSound(url) {
    if (!audioContext) return null;
    try {
        const response = await fetch(url);
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        return audioBuffer;
    } catch (error) {
        console.error(`Error loading sound: ${url}`, error);
        return null;
    }
}

// Function to play a sound
function playSound(buffer) {
    if (!audioContext) return;
    if (!buffer) {
        if (url === 'stone_shift.mp3' && !stoneShiftLoading) {
            stoneShiftLoading = true;
            loadSound('stone_shift.mp3').then(b => { stoneShiftBuffer = b; stoneShiftLoading = false; if (b) playSound(b); });
        }
        return;
    }
    
    // It's very likely the context is running if sound effects are played,
    // but a resume check is cheap.
    if (audioContext.state === 'suspended') {
        audioContext.resume();
    }

    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(audioContext.destination);
    source.start(0);
}

// Function to play background music
function playBackgroundMusic() {
    if (!audioContext || !backgroundMusicBuffer || isMusicPlaying) return;

    if (audioContext.state !== 'running') {
        console.log('AudioContext not running, music delayed.');
        return;
    }

    isMusicPlaying = true;
    
    musicSourceNode = audioContext.createBufferSource();
    musicSourceNode.buffer = backgroundMusicBuffer;
    musicSourceNode.loop = true; // Loop the music

    const gainNode = audioContext.createGain();
    gainNode.gain.value = 0.5; // Set volume to half

    musicSourceNode.connect(gainNode);
    gainNode.connect(audioContext.destination);
    musicSourceNode.start(0);

    console.log('Background music started.');
}

// Initialize audio system
async function initializeAudio() {
    if (audioContext) return; // Already initialized

    try {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        
        // Listen for state changes to automatically play music when ready
        audioContext.onstatechange = () => {
            console.log(`AudioContext state changed to: ${audioContext.state}`);
            if (audioContext.state === 'running') {
                playBackgroundMusic();
            }
        };

        // Don't try to resume here, as there's no user gesture yet.
        // We will resume on the first user click.
        
        // Load all sounds
        const soundsToLoad = [
            loadSound('stone_shift.mp3').then(b => stoneShiftBuffer = b),
            loadSound('/Ancient_Champions.ogg').then(b => backgroundMusicBuffer = b),
            loadSound('cartridge_insert.mp3').then(b => cartridgeInsertBuffer = b)
        ];
        // We don't await here to prevent blocking the UI loading.
        Promise.all(soundsToLoad).then(() => {
            // Attempt to play background music right away in case context is already running
            playBackgroundMusic();
        });

    } catch (e) {
        console.error("Web Audio API is not supported or failed to initialize.", e);
    }
}

// Function to resume audio context
function resumeAudioContext() {
    if (audioContext && audioContext.state === 'suspended') {
        audioContext.resume().then(() => {
            console.log('AudioContext resumed successfully on user gesture.');
        });
    }
}

// Expose playBackgroundMusic to be called from intro-scene
window.playBackgroundMusic = playBackgroundMusic;