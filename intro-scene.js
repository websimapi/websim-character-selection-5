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

// Dragging state
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let selectedObject = null;
const plane = new THREE.Plane();
const planeNormal = new THREE.Vector3(0, 1, 0); // Floor is on Y-up
const intersection = new THREE.Vector3();

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
    const tvScreen = new CSS3DObject(tvScreenElement);
    const screenWidth = 3;
    const screenHeight = screenWidth * (9/16);
    tvScreen.scale.set(screenWidth / tvScreenElement.offsetWidth, screenHeight / tvScreenElement.offsetHeight, 1);
    tvScreen.position.set(0, 1.7, -4.85);
    tvScreen.rotation.y = 0;
    scene.add(tvScreen);
    
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
    requestAnimationFrame(animate);
    
    if (!interactionComplete && selectedObject === null) { // Only check when not dragging
        const distance = cartridge.position.distanceTo(consoleSlot.position);
        if (distance < 0.2) {
            interactionComplete = true;
            onCartridgeInsert();
        }
    }
    
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
        .to(startContent, { opacity: 1, duration: 1, ease: 'power1.inOut' }, "-=0.5");

    // Zoom into TV
    zoomPromise = gsap.to(camera.position, {
        x: 0,
        y: 1.7,
        z: -3,
        duration: 3,
        delay: 1,
        ease: 'power2.inOut',
        onUpdate: () => {
            camera.lookAt(0, 1.7, -5);
        },
        onComplete: transitionToApp
    });
}

function transitionToApp() {
    // Smoothly fade out the 3D scene
    gsap.to(introContainer, {
        opacity: 0,
        duration: 0.5,
        onComplete: () => {
            introContainer.style.display = 'none';
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
    if (selectedObject) {
        updateMouse(event);

        raycaster.setFromCamera(mouse, camera);
        if (raycaster.ray.intersectPlane(plane, intersection)) {
            selectedObject.position.set(intersection.x, 0.025, intersection.z);
        }
    }
}

function onPointerUp() {
    if (selectedObject) {
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