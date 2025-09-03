// Networking and connection management, extracted from ui.js and main.js

// From ui.js
function initializeStartOverlay() {
    const startOverlay = document.getElementById('start-overlay');
    const hostBtn = document.getElementById('host-btn');
    const scanBtn = document.getElementById('scan-qr-btn');
    const joinInput = document.getElementById('join-id-input');
    const realtimeBtn = document.getElementById('realtime-mode-btn');
    
    hostBtn.addEventListener('click', () => {
        if (peerId) {
            startHosting();
        } else {
            console.log('PeerJS not ready yet');
            alert('Connection service is not ready, please wait a moment.');
        }
    });

    scanBtn.addEventListener('click', () => {
        if (peerId) {
            startCameraScanner();
        } else {
            console.log('PeerJS not ready yet');
            alert('Connection service is not ready, please wait a moment.');
        }
    });

    joinInput.addEventListener('click', async () => {
        if (peerId && navigator.clipboard && typeof navigator.clipboard.readText === 'function') {
            try {
                // This may trigger a browser permission prompt
                const clipboardText = await navigator.clipboard.readText();
                const trimmedText = clipboardText.trim();
                // Basic check for a plausible ID (not empty)
                if (trimmedText.length > 3) {
                    joinInput.value = trimmedText;
                    joinGame(trimmedText);
                }
            } catch (err) {
                console.warn('Could not read from clipboard or permission denied:', err.name);
                // Fail silently, user can still type manually.
            }
        }
    });

    joinInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            const hostId = joinInput.value.trim();
            if (hostId) {
                joinGame(hostId);
            } else {
                alert('Please enter a valid join code.');
            }
        }
    });

    realtimeBtn.addEventListener('click', () => {
        // Disabled for now
        console.log('Realtime mode not implemented yet');
    });

    const qrOverlay = document.getElementById('qr-code-overlay');
    const closeQrBtn = document.getElementById('close-qr-overlay');
    const copyIdBtn = document.getElementById('copy-id-btn');
    const peerIdSpan = document.getElementById('peer-id-display');

    // Audio is now resumed via the cartridge insertion, so this is not strictly necessary
    // but good as a fallback.
    startOverlay.addEventListener('click', resumeAudioContext, { once: true });

    closeQrBtn.addEventListener('click', () => {
        qrOverlay.classList.add('hidden');
    });

    copyIdBtn.addEventListener('click', () => {
        const hostId = peerIdSpan.textContent;
        if (hostId && navigator.clipboard) {
            navigator.clipboard.writeText(hostId).then(() => {
                const originalText = copyIdBtn.textContent;
                copyIdBtn.textContent = 'Copied!';
                copyIdBtn.disabled = true;
                setTimeout(() => {
                    copyIdBtn.textContent = originalText;
                    copyIdBtn.disabled = false;
                }, 2000);
            }).catch(err => {
                console.error('Failed to copy ID: ', err);
                alert('Could not copy ID to clipboard.');
            });
        }
    });

    // Add listener for mini QR code to show fullscreen overlay
    const hostQrDisplay = document.getElementById('host-qr-display');
    hostQrDisplay.addEventListener('click', () => {
        if (isHost) {
            qrOverlay.classList.remove('hidden');
        }
    });
}

function startHosting() {
    gameMode = 'scan';
    isHost = true;
    
    // Hide start overlay and show character selection
    document.getElementById('start-overlay').classList.add('hidden');
    document.querySelector('.character-selection').classList.remove('hidden');
    
    // Show mini QR code in top right
    document.getElementById('host-qr-display').classList.add('visible');
    
    // Audio is now initialized on page load.
    // We just need to ensure the context is resumed if it was suspended.
    if (audioContext && audioContext.state === 'suspended') {
        audioContext.resume();
    }
    
    console.log('Started Scan to Play mode as host with ID:', peerId);
    mySlotIndex = 0;
    
    // Update the UI to show empty slots correctly
    updateCharacterSlotsUI();

    applyMobileSingleSlotMode();
}

async function startCameraScanner() {
    const cameraOverlay = document.getElementById('camera-scanner');
    const video = document.getElementById('camera-video');
    const canvas = document.getElementById('camera-canvas');
    const ctx = canvas.getContext('2d');
    const closeBtn = document.getElementById('close-camera');
    
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment' } // Use back camera if available
        });
        
        video.srcObject = stream;
        cameraOverlay.classList.remove('hidden');
        
        // Scanning loop
        const scanLoop = () => {
            if (video.readyState === video.HAVE_ENOUGH_DATA) {
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                
                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                const code = jsQR(imageData.data, imageData.width, imageData.height);
                
                if (code && code.data) {
                    console.log('QR Code detected:', code.data);
                    joinGame(code.data);
                    stopCameraScanner(stream);
                    return;
                }
            }
            
            requestAnimationFrame(scanLoop);
        };
        
        video.addEventListener('loadedmetadata', () => {
            scanLoop();
        });
        
        closeBtn.addEventListener('click', () => {
            stopCameraScanner(stream);
        }, { once: true });
        
    } catch (error) {
        console.error('Camera access failed:', error);
        alert('Camera access is required to scan QR codes');
    }
}

function stopCameraScanner(stream) {
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
    }
    document.getElementById('camera-scanner').classList.add('hidden');
}

function joinGame(hostId) {
    console.log('Attempting to join game with host:', hostId);
    isHost = false;
    
    const conn = peer.connect(hostId);
    
    conn.on('open', () => {
        console.log('Connected to host:', hostId);
        connections = [conn]; // Client only has one connection (to host)
        
        // Hide start overlay and show character selection
        document.getElementById('start-overlay').classList.add('hidden');
        document.querySelector('.character-selection').classList.remove('hidden');
        
        // Audio is now initialized on page load.
        // We just need to ensure the context is resumed if it was suspended.
        if (audioContext && audioContext.state === 'suspended') {
            audioContext.resume();
        }
    });
    
    conn.on('data', (data) => {
        handleHostMessage(data);
    });
    
    conn.on('close', () => {
        console.log('Disconnected from host');
        // Could show reconnection UI here
    });
}

function handleHostMessage(data) {
    const slotElement = document.querySelector(`.character-slot[data-player="${data.slotIndex + 1}"]`);
    switch (data.type) {
        case 'slot_assignment':
            console.log('Assigned to slot:', data.slot);
            playerSlots = data.playerSlots;
            updateCharacterSlotsUI(); // Full sync on first join
            mySlotIndex = data.slot;
            applyMobileSingleSlotMode();
            break;
            
        case 'player_slots_update':
            // Used for players joining/leaving
            playerSlots = data.playerSlots;
            updateCharacterSlotsUI();
            updateMobileSlotPicker();
            break;
            
        case 'character_change':
            if (slotElement) {
                playerSlots[data.slotIndex].characterIndex = data.characterIndex;
                updateCharacterSlot(slotElement, characters[data.characterIndex], data.direction);
            }
            updatePlayerChip(data.slotIndex, data.direction);
            break;
            
        case 'gender_change':
            if (slotElement) {
                playerSlots[data.slotIndex].gender = data.gender;
                slotElement.dataset.archerGender = data.gender;
                slotElement.querySelectorAll('.gender-toggle').forEach(t => {
                    t.classList.toggle('active', t.dataset.gender === data.gender);
                });
                updateCharacterSlot(slotElement, characters[playerSlots[data.slotIndex].characterIndex], 'fade');
            }
            updatePlayerChip(data.slotIndex, 'fade');
            break;
    }
}

// From main.js
function initializePeerJS() {
    peer = new Peer();
    
    peer.on('open', (id) => {
        peerId = id;
        console.log('PeerJS initialized with ID:', id);
        generateHostQRCodes(id);
    });

    peer.on('connection', (conn) => {
        console.log('Incoming connection:', conn.peer);
        handleIncomingConnection(conn);
    });

    peer.on('error', (error) => {
        console.error('PeerJS error:', error);
    });
}

function generateHostQRCodes(id) {
    // Generate mini QR code for in-game display
    new QRious({
        element: document.getElementById('mini-qr-code'),
        value: id,
        size: 80,
        foreground: '#ffffff',
        background: 'transparent'
    });

    // Generate fullscreen QR code
    new QRious({
        element: document.getElementById('fullscreen-qr-code'),
        value: id,
        size: Math.min(window.innerWidth, window.innerHeight) * 0.6,
        foreground: '#ffffff',
        background: 'transparent',
        padding: 20
    });

    // Display the Peer ID text
    document.getElementById('peer-id-display').textContent = id;
}

function handleIncomingConnection(conn) {
    connections.push(conn);
    
    conn.on('open', () => {
        console.log('Connection established with:', conn.peer);
        
        // Assign player to available slot
        const availableSlot = playerSlots.find(slot => !slot.occupied);
        if (availableSlot) {
            availableSlot.occupied = true;
            availableSlot.playerId = conn.peer;
            
            // Send slot assignment to new player
            conn.send({
                type: 'slot_assignment',
                slot: playerSlots.indexOf(availableSlot),
                playerSlots: playerSlots
            });
            
            // Broadcast updated player slots to all clients
            broadcastToClients({
                type: 'player_slots_update',
                playerSlots: playerSlots
            });
            
            updateCharacterSlotsUI();
        }
    });

    conn.on('data', (data) => {
        handleClientMessage(conn, data);
    });

    conn.on('close', () => {
        console.log('Connection closed:', conn.peer);
        removePlayer(conn.peer);
    });
}

function sendToHost(message) {
    // Client function to send data to the host
    if (!isHost && connections.length > 0 && connections[0].open) {
        connections[0].send(message);
    }
}

function handleClientMessage(conn, data) {
    const playerSlot = playerSlots.find(slot => slot.playerId === conn.peer);
    if (!playerSlot) {
        console.warn('Received message from unassigned player:', conn.peer);
        return;
    }
    const slotIndex = playerSlots.indexOf(playerSlot);
    const oldCharacterIndex = playerSlot.characterIndex;

    switch (data.type) {
        case 'character_change':
            if (slotIndex === data.slotIndex) { // Security check
                playerSlot.characterIndex = data.characterIndex;
                
                // Broadcast the updated state to all clients
                broadcastToClients({
                    type: 'character_change',
                    slotIndex: slotIndex,
                    characterIndex: data.characterIndex,
                    direction: data.direction
                });
                
                // Also update host's UI with animation
                const slotElement = document.querySelector(`.character-slot[data-player="${slotIndex + 1}"]`);
                if (slotElement) {
                    updateCharacterSlot(slotElement, characters[data.characterIndex], data.direction);
                }
            }
            break;
        case 'gender_change':
             if (slotIndex === data.slotIndex) { // Security check
                playerSlot.gender = data.gender;
                
                // Broadcast the updated state to all clients
                broadcastToClients({
                    type: 'gender_change',
                    slotIndex: slotIndex,
                    gender: data.gender
                });
                
                // Also update host's UI with animation
                const slotElement = document.querySelector(`.character-slot[data-player="${slotIndex + 1}"]`);
                if (slotElement) {
                     // The gender property is already updated in playerSlots array.
                     // updateCharacterSlot will read from the dataset which we update before calling.
                     slotElement.dataset.archerGender = data.gender;
                     updateCharacterSlot(slotElement, characters[playerSlot.characterIndex], 'fade');
                }
            }
            break;
        case 'slot_switch':
            hostAssignClientToSlot(conn.peer, data.targetIndex);
            break;
    }
}

function broadcastToClients(message) {
    connections.forEach(conn => {
        if (conn.open) {
            conn.send(message);
        }
    });
}

function removePlayer(playerId) {
    const slot = playerSlots.find(slot => slot.playerId === playerId);
    if (slot) {
        slot.occupied = false;
        slot.playerId = null;
        
        broadcastToClients({
            type: 'player_slots_update',
            playerSlots: playerSlots
        });
        
        updateCharacterSlotsUI();
    }
    
    connections = connections.filter(conn => conn.peer !== playerId);
}

function hostAssignClientToSlot(peerIdToMove, targetIndex) {
    const target = playerSlots[targetIndex];
    if (!target || target.occupied) return;
    const current = playerSlots.find(s => s.playerId === peerIdToMove);
    if (!current) return;
    target.occupied = true; target.playerId = peerIdToMove; target.characterIndex = current.characterIndex; target.gender = current.gender;
    current.occupied = false; current.playerId = null;
    broadcastToClients({ type: 'player_slots_update', playerSlots });
    const conn = connections.find(c => c.peer === peerIdToMove);
    if (conn && conn.open) {
        conn.send({ type: 'slot_assignment', slot: targetIndex, playerSlots });
    }
    updateCharacterSlotsUI();
}

function hostSwitchToSlot(targetIndex) {
    if (!isHost) return;
    const target = playerSlots[targetIndex];
    if (!target || target.occupied) return;
    const prevIndex = mySlotIndex;
    const current = playerSlots[mySlotIndex];
    target.occupied = true; target.playerId = 'host'; target.characterIndex = current.characterIndex; target.gender = current.gender;
    current.occupied = false; current.playerId = null;
    mySlotIndex = targetIndex;
    suppressUIAnimationOnce = true;
    broadcastToClients({ type: 'player_slots_update', playerSlots });
    updateCharacterSlotsUI();
    const prevEl = document.querySelector(`.character-slot[data-player="${prevIndex + 1}"]`);
    if (prevEl) {
        prevEl.classList.add('empty');
        const wrap = prevEl.querySelector('.character-image-wrapper');
        wrap && wrap.querySelectorAll('.character-image').forEach(img => { if (img.dataset.blobUrl) URL.revokeObjectURL(img.dataset.blobUrl); img.remove(); });
        // add skull overlay to the slot we vacated
        if (wrap && !prevEl.querySelector('.skull-overlay')) {
            const skull = document.createElement('div');
            skull.className = 'skull-overlay';
            skull.innerHTML = '<img src="/skull.png" alt="Empty Slot">';
            wrap.appendChild(skull);
        }
    }
    const targetEl = document.querySelector(`.character-slot[data-player="${targetIndex + 1}"]`);
    if (targetEl) {
        const twrap = targetEl.querySelector('.character-image-wrapper');
        if (twrap) twrap.querySelectorAll('.character-image').forEach(img => { if (img.dataset.blobUrl) URL.revokeObjectURL(img.dataset.blobUrl); img.remove(); });
        const skull = targetEl.querySelector('.skull-overlay');
        if (skull) {
            skull.classList.add('slide-out-to-left');
            setTimeout(() => { skull.remove(); targetEl.classList.remove('empty'); updateCharacterSlot(targetEl, characters[target.characterIndex], 'right'); }, 500);
        } else {
            targetEl.classList.remove('empty');
            updateCharacterSlot(targetEl, characters[target.characterIndex], 'right');
        }
    }
    applyMobileSingleSlotMode();
}