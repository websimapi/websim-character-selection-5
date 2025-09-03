import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS3DRenderer, CSS3DObject } from 'three/addons/renderers/CSS3DRenderer.js';

let scene, camera, renderer, cssRenderer;
let controls;
let cartridge, consoleSlot, floor;
let draggableObjects = [];
const introContainer = document.getElementById('intro-scene-container');
let interactionComplete = false;
let zoomPromise = null;
let animationFrameId = null; // To control the animation loop

// Dragging state
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let selectedObject = null;
const plane = new THREE.Plane();
const planeNormal = new THREE.Vector3(0, 1, 0); // Floor is on Y-up
const intersection = new THREE.Vector3();
const SNAP_DISTANCE = 0.4;

async function init() {
    // --- Basic Scene Setup ---
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x101010);

    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 1.5, 3.5);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    introContainer.appendChild(renderer.domElement);

    // --- CSS3D Renderer for HTML elements ---
    cssRenderer = new CSS3DRenderer();
    cssRenderer.setSize(window.innerWidth, window.innerHeight);
    cssRenderer.domElement.style.position = 'absolute';
    cssRenderer.domElement.style.top = 0;
    cssRenderer.domElement.style.pointerEvents = 'none'; // Allow clicks to pass through to WebGL canvas
    introContainer.appendChild(cssRenderer.domElement);

    // --- Lighting ---
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);

    const pointLight = new THREE.PointLight(0xffffff, 2, 10);
    pointLight.position.set(0, 3, 2);
    pointLight.castShadow = true;
    scene.add(pointLight);

    // --- Textures ---
    const textureLoader = new THREE.TextureLoader();
    const floorTexture = textureLoader.load('/floor_texture.png');
    floorTexture.wrapS = floorTexture.wrapT = THREE.RepeatWrapping;
    floorTexture.repeat.set(5, 5);

    const wallTexture = textureLoader.load('/wall_texture.png');
    wallTexture.wrapS = wallTexture.wrapT = THREE.RepeatWrapping;
    wallTexture.repeat.set(5, 5);

    const consoleTexture = textureLoader.load('/console_texture.png');
    const cartridgeTexture = textureLoader.load('/cartridge_texture.png');
    const tvBodyTexture = textureLoader.load('/tv_body_texture.png');
    const consoleSlotTexture = textureLoader.load('/console_slot_texture.png');

    // --- Room ---
    floor = new THREE.Mesh(
        new THREE.PlaneGeometry(10, 10),
        new THREE.MeshStandardMaterial({ map: floorTexture })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);
    plane.setFromNormalAndCoplanarPoint(planeNormal, floor.position);

    const wallMaterial = new THREE.MeshStandardMaterial({ map: wallTexture });
    const wallBack = new THREE.Mesh(new THREE.PlaneGeometry(10, 5), wallMaterial);
    wallBack.position.z = -5;
    wallBack.position.y = 2.5;
    scene.add(wallBack);

    // --- TV ---
    const tvScreenElement = document.getElementById('start-overlay');
    tvScreenElement.classList.remove('hidden'); // Make it available for CSS3DRenderer
    // The background color is now set directly on the overlay in CSS.
    
    const tvScreen = new CSS3DObject(tvScreenElement);
    const screenWidth = 3;
    const screenHeight = screenWidth * (9/16);
    tvScreen.scale.set(screenWidth / tvScreenElement.offsetWidth, screenHeight / tvScreenElement.offsetHeight, 1);
    tvScreen.position.set(0, 1.7, -4.85);
    tvScreen.rotation.y = 0;
    scene.add(tvScreen);
    
    // The noise element is now part of the start-overlay in HTML to simplify management.
    
    // Hide the content initially
    const startContent = tvScreenElement.querySelector('.start-content');
    if (startContent) startContent.style.opacity = '0';

    const tvBody = new THREE.Mesh(
        new THREE.BoxGeometry(screenWidth * 1.05, screenHeight * 1.1, 0.2),
        new THREE.MeshStandardMaterial({ map: tvBodyTexture })
    );
    tvBody.position.set(0, 1.7, -4.95);
    scene.add(tvBody);

    // --- Game Console ---
    const consoleBody = new THREE.Mesh(
        new THREE.BoxGeometry(0.8, 0.2, 0.6),
        new THREE.MeshStandardMaterial({ map: consoleTexture })
    );
    consoleBody.position.set(0, 0.1, 1);
    consoleBody.castShadow = true;
    scene.add(consoleBody);

    consoleSlot = new THREE.Mesh(
        new THREE.PlaneGeometry(0.3, 0.2),
        new THREE.MeshStandardMaterial({ map: consoleSlotTexture, transparent: true })
    );
    consoleSlot.position.set(0, 0.201, 1);
    consoleSlot.rotation.x = -Math.PI / 2;
    scene.add(consoleSlot);

    // --- Cartridge ---
    cartridge = new THREE.Mesh(
        new THREE.BoxGeometry(0.25, 0.05, 0.18),
        new THREE.MeshStandardMaterial({ map: cartridgeTexture })
    );
    cartridge.position.set(0.8, 0.025, 1.2);
    cartridge.castShadow = true;
    cartridge.name = "cartridge";
    scene.add(cartridge);
    draggableObjects.push(cartridge);

    // --- Controls ---
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enablePan = false;
    controls.enableZoom = false;
    controls.minPolarAngle = Math.PI / 3;
    controls.maxPolarAngle = Math.PI / 2;
    controls.minAzimuthAngle = -Math.PI / 6;
    controls.maxAzimuthAngle = Math.PI / 6;

    // --- Event Listeners ---
    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('pointerup', onPointerUp);

    window.addEventListener('resize', onWindowResize, false);
    animate();
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    cssRenderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
    animationFrameId = requestAnimationFrame(animate);
    
    controls.update();
    renderer.render(scene, camera);
    cssRenderer.render(scene, camera);
}

function onCartridgeInsert() {
    console.log('Cartridge inserted!');
    
    // Disable controls
    controls.enabled = false;
    
    // Play sound and resume audio context
    if (window.resumeAudioContext) window.resumeAudioContext();
    if (window.playSound && window.cartridgeInsertBuffer) window.playSound(window.cartridgeInsertBuffer);

    const tvScreenElement = document.getElementById('start-overlay');
    const startContent = tvScreenElement.querySelector('.start-content');
    const noiseElement = document.getElementById('tv-noise');

    // Animate cartridge into slot and TV screen fade-in
    gsap.timeline()
        .to(cartridge.position, {
            x: consoleSlot.position.x,
            y: consoleSlot.position.y - 0.1, // slightly into the slot
            z: consoleSlot.position.z,
            duration: 0.5,
            ease: 'power2.in'
        })
        .to(cartridge.position, { y: -0.1, duration: 0.3 })
        .call(() => {
            // Start static noise
            noiseElement.classList.add('active');
        }, null, "-=0.2")
        .to(startContent, { 
            opacity: 1, 
            duration: 1, 
            ease: 'power1.inOut',
            delay: 3 // Wait for 3 seconds of static
        })
        .call(() => {
            // Stop static noise and show game background
            noiseElement.classList.remove('active');
            // Background is applied via CSS class, not directly here.
        }, null, "-=1");
    
    // Define the target for the camera to look at
    const tvLookAtTarget = new THREE.Vector3(0, 1.7, -5);

    // Calculate the final camera Z position to make the screen fill the view
    const fovInRadians = camera.fov * (Math.PI / 180);
    const screenHeightIn3D = 1.6875; // 3 * (9/16)
    // The distance is calculated using: distance = (height / 2) / tan(fov / 2)
    const finalZ = screenHeightIn3D / (2 * Math.tan(fovInRadians / 2));


    // Zoom into TV by animating both camera position and controls target
    const timeline = gsap.timeline({
        delay: 1,
        onComplete: transitionToApp
    });

    timeline.to(camera.position, {
        x: 0,
        y: 1.7,
        z: tvLookAtTarget.z + finalZ,
        duration: 6, // Slower zoom
        ease: 'power2.inOut'
    }, 0);

    timeline.to(controls.target, {
        x: tvLookAtTarget.x,
        y: tvLookAtTarget.y,
        z: tvLookAtTarget.z,
        duration: 6, // Slower zoom
        ease: 'power2.inOut'
    }, 0);

    zoomPromise = timeline;
}

function transitionToApp() {
    // Stop the rendering loop to prevent it from interfering with the 2D app
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    }

    // Smoothly fade out the 3D scene
    gsap.to(introContainer, {
        opacity: 0,
        duration: 0.5,
        onComplete: () => {
            introContainer.style.display = 'none';
            const startOverlay = document.getElementById('start-overlay');
            startOverlay.classList.add('transition-complete');

            // Crucially, reset styles that might have been applied by CSS3DRenderer
            startOverlay.style.transform = '';
            startOverlay.style.position = '';
            startOverlay.style.top = '';
            startOverlay.style.left = '';
            startOverlay.style.width = '';
            startOverlay.style.height = '';
            startOverlay.style.pointerEvents = '';
            
            if(window.startApp) window.startApp();
        }
    });
}

// --- Dragging Logic ---
function onPointerDown(event) {
    if (interactionComplete) return;

    updateMouse(event);

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(draggableObjects);

    if (intersects.length > 0) {
        selectedObject = intersects[0].object;
        controls.enabled = false;
    }
}

function onPointerMove(event) {
    if (interactionComplete || !selectedObject) return;

    updateMouse(event);
    raycaster.setFromCamera(mouse, camera);

    if (raycaster.ray.intersectPlane(plane, intersection)) {
        selectedObject.position.set(intersection.x, 0.025, intersection.z);

        // Auto-rotate cartridge to face the console slot
        const targetRotation = Math.atan2(
            consoleSlot.position.x - selectedObject.position.x,
            consoleSlot.position.z - selectedObject.position.z
        );
        // Use slerp for smooth rotation
        const currentQuaternion = selectedObject.quaternion.clone();
        const targetQuaternion = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), targetRotation);
        currentQuaternion.slerp(targetQuaternion, 0.1); // Adjust 0.1 for faster/slower rotation
        selectedObject.quaternion.copy(currentQuaternion);
        
        // Check for snapping
        const distance = selectedObject.position.distanceTo(consoleSlot.position);
        if (distance < SNAP_DISTANCE) {
            interactionComplete = true;
            selectedObject = null; // Stop dragging
            onCartridgeInsert();
        }
    }
}

function onPointerUp() {
    if (interactionComplete) return;

    if (selectedObject) {
        // Check distance one last time on mouse up, in case user releases it over the slot
        const distance = selectedObject.position.distanceTo(consoleSlot.position);
        if (distance < SNAP_DISTANCE) {
            interactionComplete = true;
            onCartridgeInsert();
        }
        selectedObject = null;
        controls.enabled = true;
    }
}

function updateMouse(event) {
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
}

document.addEventListener('DOMContentLoaded', async () => {
    // The main app is now started via startApp(), called from here
    
    // Preload character images
    if (window.preloadAllCharacterImages) {
        await window.preloadAllCharacterImages();
    }
    
    // Hide preloader
    const preloader = document.getElementById('preloader');
    preloader.classList.add('hidden');

    init();
});

// Skip intro for development
// document.addEventListener('keydown', (e) => {
//     if (e.key === 'Escape' && !interactionComplete) {
//         if(zoomPromise) zoomPromise.kill();
//         interactionComplete = true;
//         transitionToApp();
//     }
// });