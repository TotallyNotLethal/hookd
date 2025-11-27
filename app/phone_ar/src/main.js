import * as THREE from 'https://unpkg.com/three@0.161.0/build/three.module.js';
import { ARButton } from 'https://unpkg.com/three@0.161.0/examples/jsm/webxr/ARButton.js';
import { GLTFLoader } from 'https://unpkg.com/three@0.161.0/examples/jsm/loaders/GLTFLoader.js';

const manualDocuments = [
  {
    id: 'compressor',
    title: 'ManualLabs: Smart Compressor (ML-402)',
    summary: 'Shows airflow and electronics board for the ML-402 compressor.',
    modelUrl: 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/DamagedHelmet/glTF/DamagedHelmet.gltf',
    parts: [
      {
        id: 'intake',
        label: 'Air intake filter',
        note: 'Inspect for clogging and replace if pressure drops >10%.',
        highlightPosition: { x: 0, y: 0.25, z: -0.15 }
      },
      {
        id: 'pcb',
        label: 'Main PCB',
        note: 'Check for loose connectors before powering up.',
        highlightPosition: { x: 0.12, y: 0.04, z: -0.08 }
      },
      {
        id: 'valve',
        label: 'Pressure relief valve',
        note: 'Verify safety seal orientation; do not overtighten.',
        highlightPosition: { x: -0.15, y: 0.15, z: 0.05 }
      }
    ]
  },
  {
    id: 'switchgear',
    title: 'ManualLabs: LV Switchgear Cabinet',
    summary: '3D overlay of a low-voltage cabinet with key breakers labeled.',
    modelUrl: 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/VC/glTF/VC.gltf',
    parts: [
      {
        id: 'bus',
        label: 'A-B busbar joint',
        note: 'Thermal scan target. Torque to 35 Nm after maintenance.',
        highlightPosition: { x: 0.18, y: 0.35, z: -0.1 }
      },
      {
        id: 'breaker',
        label: 'Main breaker',
        note: 'Lockout-tagout here before servicing downstream feeders.',
        highlightPosition: { x: 0, y: 0.45, z: 0 }
      },
      {
        id: 'relay',
        label: 'Protection relay IO block',
        note: 'Verify CT polarity marks match ManualLabs wiring table.',
        highlightPosition: { x: -0.2, y: 0.25, z: 0.05 }
      }
    ]
  }
];

const manualSelect = document.getElementById('manualSelect');
const partSelect = document.getElementById('partSelect');
const startButton = document.getElementById('startAr');
const statusEl = document.getElementById('status');
const arContainer = document.getElementById('arContainer');
const partNotes = document.getElementById('partNotes');
const overlayLabel = document.getElementById('overlayLabel');
const cameraFallback = document.getElementById('cameraFallback');
const cameraPreview = document.getElementById('cameraPreview');

let renderer;
let scene;
let camera;
let model;
let highlight;
let currentManual = manualDocuments[0];
let fallbackStream;
let arSessionStarted = false;

function populateManuals() {
  manualDocuments.forEach((manual) => {
    const option = document.createElement('option');
    option.value = manual.id;
    option.textContent = manual.title;
    manualSelect.appendChild(option);
  });
  manualSelect.value = currentManual.id;
  populateParts();
}

function populateParts() {
  partSelect.innerHTML = '';
  currentManual.parts.forEach((part) => {
    const option = document.createElement('option');
    option.value = part.id;
    option.textContent = part.label;
    partSelect.appendChild(option);
  });
  updatePartNote();
}

function updatePartNote() {
  const part = currentManual.parts.find((p) => p.id === partSelect.value);
  partNotes.textContent = part ? part.note : 'Choose a part to highlight.';
  overlayLabel.textContent = part ? part.label : '';
  if (highlight && part) {
    highlight.position.set(part.highlightPosition.x, part.highlightPosition.y, part.highlightPosition.z);
  }
}

function initThree() {
  scene = new THREE.Scene();
  scene.background = null;

  camera = new THREE.PerspectiveCamera();

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(arContainer.clientWidth, arContainer.clientHeight);
  renderer.xr.enabled = true;
  arContainer.appendChild(renderer.domElement);

  const light = new THREE.HemisphereLight(0xffffff, 0xbbbbff, 1.1);
  scene.add(light);
}

function createHighlightSphere(part) {
  const geo = new THREE.SphereGeometry(0.03, 24, 24);
  const mat = new THREE.MeshBasicMaterial({ color: 0xff8c42, transparent: true, opacity: 0.9 });
  highlight = new THREE.Mesh(geo, mat);
  highlight.position.set(part.highlightPosition.x, part.highlightPosition.y, part.highlightPosition.z);
  scene.add(highlight);
}

function loadManualModel() {
  if (!renderer || !scene) return;
  const loader = new GLTFLoader();
  statusEl.textContent = `Loading ${currentManual.title}…`;
  loader.load(
    currentManual.modelUrl,
    (gltf) => {
      if (model) {
        scene.remove(model);
      }
      model = gltf.scene;
      model.scale.set(0.8, 0.8, 0.8);
      model.position.set(0, -0.35, -1);
      scene.add(model);
      statusEl.textContent = 'AR model placed. Move your phone to inspect the highlight.';
      createHighlightSphere(currentManual.parts[0]);
      renderer.setAnimationLoop(() => {
        renderer.render(scene, camera);
      });
    },
    undefined,
    (error) => {
      console.error('Error loading model', error);
      statusEl.textContent = 'Could not load 3D model. Check your network connection.';
    }
  );
}

function startWebXR() {
  if (arSessionStarted) {
    updatePartNote();
    return;
  }
  if (!navigator.xr) {
    statusEl.textContent = 'WebXR not available. Using camera preview.';
    startCameraFallback();
    return;
  }

  initThree();
  const arButton = ARButton.createButton(renderer, {
    requiredFeatures: ['hit-test'],
    optionalFeatures: ['dom-overlay'],
    domOverlay: { root: document.body }
  });
  arButton.classList.add('hidden');
  document.body.appendChild(arButton);

  renderer.xr.addEventListener('sessionstart', () => {
    arSessionStarted = true;
    statusEl.textContent = 'AR session started. Anchoring model…';
    cameraFallback.classList.add('hidden');
    loadManualModel();
  });

  renderer.xr.addEventListener('sessionend', () => {
    arSessionStarted = false;
    statusEl.textContent = 'AR session ended. Tap start to re-enter.';
  });

  renderer.xr.setSession(null);
  arButton.click();
}

async function startCameraFallback() {
  cameraFallback.classList.remove('hidden');
  if (fallbackStream) return;
  try {
    fallbackStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
    cameraPreview.srcObject = fallbackStream;
    await cameraPreview.play();
    statusEl.textContent = 'Camera preview active. Move the phone to align with the highlighted part label.';
  } catch (err) {
    console.error(err);
    statusEl.textContent = 'Camera permissions needed to show preview.';
  }
}

manualSelect.addEventListener('change', () => {
  currentManual = manualDocuments.find((m) => m.id === manualSelect.value);
  populateParts();
  if (arSessionStarted) {
    loadManualModel();
  }
});

partSelect.addEventListener('change', updatePartNote);
startButton.addEventListener('click', startWebXR);

populateManuals();
updatePartNote();

// Resize renderer when the layout changes
window.addEventListener('resize', () => {
  if (!renderer) return;
  renderer.setSize(arContainer.clientWidth, arContainer.clientHeight);
});
