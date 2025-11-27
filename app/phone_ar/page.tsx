"use client";

import { useEffect, useMemo, useRef, useState } from "react";
//import "../styles.css";

type HighlightPosition = { x: number; y: number; z: number };

type ManualPart = {
  id: string;
  label: string;
  note: string;
  highlightPosition: HighlightPosition;
};

type ManualDocument = {
  id: string;
  title: string;
  summary: string;
  modelUrl: string;
  parts: ManualPart[];
};

const manualDocuments: ManualDocument[] = [
  {
    id: "compressor",
    title: "ManualLabs: Smart Compressor (ML-402)",
    summary: "Shows airflow and electronics board for the ML-402 compressor.",
    modelUrl:
      "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/DamagedHelmet/glTF/DamagedHelmet.gltf",
    parts: [
      {
        id: "intake",
        label: "Air intake filter",
        note: "Inspect for clogging and replace if pressure drops >10%.",
        highlightPosition: { x: 0, y: 0.25, z: -0.15 },
      },
      {
        id: "pcb",
        label: "Main PCB",
        note: "Check for loose connectors before powering up.",
        highlightPosition: { x: 0.12, y: 0.04, z: -0.08 },
      },
      {
        id: "valve",
        label: "Pressure relief valve",
        note: "Verify safety seal orientation; do not overtighten.",
        highlightPosition: { x: -0.15, y: 0.15, z: 0.05 },
      },
    ],
  },
  {
    id: "switchgear",
    title: "ManualLabs: LV Switchgear Cabinet",
    summary: "3D overlay of a low-voltage cabinet with key breakers labeled.",
    modelUrl:
      "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/VC/glTF/VC.gltf",
    parts: [
      {
        id: "bus",
        label: "A-B busbar joint",
        note: "Thermal scan target. Torque to 35 Nm after maintenance.",
        highlightPosition: { x: 0.18, y: 0.35, z: -0.1 },
      },
      {
        id: "breaker",
        label: "Main breaker",
        note: "Lockout-tagout here before servicing downstream feeders.",
        highlightPosition: { x: 0, y: 0.45, z: 0 },
      },
      {
        id: "relay",
        label: "Protection relay IO block",
        note: "Verify CT polarity marks match ManualLabs wiring table.",
        highlightPosition: { x: -0.2, y: 0.25, z: 0.05 },
      },
    ],
  },
];

export default function Page() {
  const [manualQuery, setManualQuery] = useState("");
  const [partQuery, setPartQuery] = useState("");
  const [selectedManualId, setSelectedManualId] = useState(manualDocuments[0].id);
  const [selectedPartId, setSelectedPartId] = useState(manualDocuments[0].parts[0].id);
  const [status, setStatus] = useState("Waiting to start AR…");

  const arContainerRef = useRef<HTMLDivElement | null>(null);
  const overlayLabelRef = useRef<HTMLDivElement | null>(null);
  const partNotesRef = useRef<HTMLDivElement | null>(null);
  const cameraFallbackRef = useRef<HTMLDivElement | null>(null);
  const cameraPreviewRef = useRef<HTMLVideoElement | null>(null);

  const rendererRef = useRef<any>(null);
  const sceneRef = useRef<any>(null);
  const cameraRef = useRef<any>(null);
  const modelRef = useRef<any>(null);
  const highlightRef = useRef<any>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const arSessionStartedRef = useRef(false);

  const selectedManual = useMemo(
    () => manualDocuments.find((manual) => manual.id === selectedManualId) ?? manualDocuments[0],
    [selectedManualId]
  );

  const filteredManuals = useMemo(() => {
    if (!manualQuery.trim()) return manualDocuments;
    const query = manualQuery.toLowerCase();
    const results = manualDocuments.filter(
      (manual) => manual.title.toLowerCase().includes(query) || manual.summary.toLowerCase().includes(query)
    );
    return results.length ? results : manualDocuments;
  }, [manualQuery]);

  const filteredParts = useMemo(() => {
    if (!selectedManual) return [] as ManualPart[];
    if (!partQuery.trim()) return selectedManual.parts;
    const query = partQuery.toLowerCase();
    const results = selectedManual.parts.filter(
      (part) => part.label.toLowerCase().includes(query) || part.note.toLowerCase().includes(query)
    );
    return results.length ? results : selectedManual.parts;
  }, [selectedManual, partQuery]);

  useEffect(() => {
    if (!filteredManuals.find((manual) => manual.id === selectedManualId)) {
      const fallbackManual = filteredManuals[0] ?? manualDocuments[0];
      setSelectedManualId(fallbackManual.id);
      setSelectedPartId(fallbackManual.parts[0].id);
    }
  }, [filteredManuals, selectedManualId]);

  useEffect(() => {
    const manualPartIds = selectedManual.parts.map((part) => part.id);
    if (!manualPartIds.includes(selectedPartId)) {
      setSelectedPartId(selectedManual.parts[0]?.id ?? "");
    }
  }, [selectedManual, selectedPartId]);

  useEffect(() => {
    const part = selectedManual.parts.find((p) => p.id === selectedPartId) ?? selectedManual.parts[0];
    if (!part) return;

    if (partNotesRef.current) {
      partNotesRef.current.textContent = part.note;
    }
    if (overlayLabelRef.current) {
      overlayLabelRef.current.textContent = part.label;
    }

    if (highlightRef.current && part.highlightPosition) {
      highlightRef.current.position.set(part.highlightPosition.x, part.highlightPosition.y, part.highlightPosition.z);
    }
  }, [selectedManual, selectedPartId]);

  useEffect(() => {
    return () => {
      if (rendererRef.current?.xr?.getSession()) {
        rendererRef.current.xr.getSession().end();
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  const loadManualModel = async () => {
    if (!arContainerRef.current) return;

    const [{ default: THREE }, { GLTFLoader }] = await Promise.all([
      import("three"),
      import("three/examples/jsm/loaders/GLTFLoader.js"),
    ]);

    const loader = new GLTFLoader();
    setStatus(`Loading ${selectedManual.title}…`);

    loader.load(
      selectedManual.modelUrl,
      (gltf) => {
        if (modelRef.current) {
          sceneRef.current.remove(modelRef.current);
        }
        modelRef.current = gltf.scene;
        modelRef.current.scale.set(0.8, 0.8, 0.8);
        modelRef.current.position.set(0, -0.35, -1);
        sceneRef.current.add(modelRef.current);
        setStatus("AR model placed. Move your phone to inspect the highlight.");

        createHighlightSphere(THREE, selectedManual.parts[0]);
        rendererRef.current.setAnimationLoop(() => {
          rendererRef.current.render(sceneRef.current, cameraRef.current);
        });
      },
      undefined,
      (error) => {
        console.error("Error loading model", error);
        setStatus("Could not load 3D model. Check your network connection.");
      }
    );
  };

  const createHighlightSphere = (THREE: any, part: ManualPart) => {
    const geo = new THREE.SphereGeometry(0.03, 24, 24);
    const mat = new THREE.MeshBasicMaterial({ color: 0xff8c42, transparent: true, opacity: 0.9 });
    if (highlightRef.current) {
      sceneRef.current.remove(highlightRef.current);
    }
    highlightRef.current = new THREE.Mesh(geo, mat);
    highlightRef.current.position.set(part.highlightPosition.x, part.highlightPosition.y, part.highlightPosition.z);
    sceneRef.current.add(highlightRef.current);
  };

  const initThree = async () => {
    if (!arContainerRef.current) return;
    if (rendererRef.current) return;

    const THREE = await import("three");
    sceneRef.current = new THREE.Scene();
    sceneRef.current.background = null;

    cameraRef.current = new THREE.PerspectiveCamera();

    rendererRef.current = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    rendererRef.current.setSize(arContainerRef.current.clientWidth, arContainerRef.current.clientHeight);
    rendererRef.current.xr.enabled = true;
    arContainerRef.current.appendChild(rendererRef.current.domElement);

    const light = new THREE.HemisphereLight(0xffffff, 0xbbbbff, 1.1);
    sceneRef.current.add(light);
  };

  const startCameraFallback = async () => {
    if (!cameraFallbackRef.current || !cameraPreviewRef.current) return;
    cameraFallbackRef.current.classList.remove("hidden");
    if (streamRef.current) return;
    try {
      streamRef.current = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });
      cameraPreviewRef.current.srcObject = streamRef.current;
      await cameraPreviewRef.current.play();
      setStatus("Camera preview active. Move the phone to align with the highlighted part label.");
    } catch (error) {
      console.error(error);
      setStatus("Camera permissions needed to show preview.");
    }
  };

  const startWebXR = async () => {
    if (arSessionStartedRef.current) {
      const part = selectedManual.parts.find((p) => p.id === selectedPartId);
      if (part && highlightRef.current) {
        highlightRef.current.position.set(part.highlightPosition.x, part.highlightPosition.y, part.highlightPosition.z);
      }
      return;
    }

    if (!(navigator as any).xr) {
      setStatus("WebXR not available. Using camera preview.");
      startCameraFallback();
      return;
    }

    await initThree();
    const [{ ARButton }] = await Promise.all([import("three/examples/jsm/webxr/ARButton.js")]);

    const arButton = ARButton.createButton(rendererRef.current, {
      requiredFeatures: ["hit-test"],
      optionalFeatures: ["dom-overlay"],
      domOverlay: { root: document.body },
    });
    arButton.classList.add("hidden");
    document.body.appendChild(arButton);

    rendererRef.current.xr.addEventListener("sessionstart", () => {
      arSessionStartedRef.current = true;
      setStatus("AR session started. Anchoring model…");
      cameraFallbackRef.current?.classList.add("hidden");
      loadManualModel();
    });

    rendererRef.current.xr.addEventListener("sessionend", () => {
      arSessionStartedRef.current = false;
      setStatus("AR session ended. Tap start to re-enter.");
    });

    rendererRef.current.xr.setSession(null);
    arButton.click();
  };

  useEffect(() => {
    const handleResize = () => {
      if (!rendererRef.current || !arContainerRef.current) return;
      rendererRef.current.setSize(arContainerRef.current.clientWidth, arContainerRef.current.clientHeight);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return (
    <div>
      <header className="app-header">
        <div className="branding">
          <div className="logo">📱🔧</div>
          <div>
            <h1>ManualLabs Phone AR</h1>
            <p className="tagline">
              Point your phone, load a ManualLabs doc, highlight the exact part.
            </p>
          </div>
        </div>
        <p className="status">{status}</p>
      </header>

      <main className="layout">
        <section className="controls">
          <h2>Choose a Manual</h2>

          <label htmlFor="manualSearch">Search ManualLabs</label>
          <input
            id="manualSearch"
            type="search"
            placeholder="Type to search manuals by title or summary"
            value={manualQuery}
            onChange={(event) => setManualQuery(event.target.value)}
          />

          <label htmlFor="manualSelect">ManualLabs document</label>
          <select
            id="manualSelect"
            value={selectedManualId}
            onChange={(event) => setSelectedManualId(event.target.value)}
          >
            {filteredManuals.map((manual) => (
              <option key={manual.id} value={manual.id}>
                {manual.title}
              </option>
            ))}
          </select>

          <p className="note">
            <strong>Summary:</strong> {selectedManual.summary}
          </p>

          <label htmlFor="partSearch">Search a part to highlight</label>
          <input
            id="partSearch"
            type="search"
            placeholder="Type to search parts or notes"
            value={partQuery}
            onChange={(event) => setPartQuery(event.target.value)}
          />

          <label htmlFor="partSelect">Highlightable area</label>
          <select
            id="partSelect"
            value={selectedPartId}
            onChange={(event) => setSelectedPartId(event.target.value)}
          >
            {filteredParts.map((part) => (
              <option key={part.id} value={part.id}>
                {part.label}
              </option>
            ))}
          </select>

          <button id="startAr" className="primary" onClick={startWebXR}>
            Start AR session
          </button>

          <div className="note">
            <strong>Tip:</strong> On iOS Safari or Android Chrome, open this page over HTTPS and grant camera + motion
            permissions for WebXR. If WebXR is unavailable, the camera-only preview is used.
          </div>

          <div className="callout" id="partNotes" ref={partNotesRef} />
        </section>

        <section className="viewer">
          <div id="arContainer" className="ar-container" ref={arContainerRef}>
            <div id="cameraFallback" className="camera-fallback hidden" ref={cameraFallbackRef}>
              <video id="cameraPreview" playsInline autoPlay muted ref={cameraPreviewRef} />
              <div id="overlayLabel" className="overlay-label" ref={overlayLabelRef} />
            </div>
          </div>
        </section>
      </main>

      <section className="instructions">
        <h2>How it works</h2>
        <ol>
          <li>Select a ManualLabs document and a part you want to inspect.</li>
          <li>Press <strong>Start AR session</strong> and point your phone at a clear surface.</li>
          <li>We place the 3D model in front of you and highlight the chosen part in orange.</li>
          <li>Move around to inspect the highlighted area; tap the dropdowns to switch parts.</li>
        </ol>
      </section>
    </div>
  );
}
