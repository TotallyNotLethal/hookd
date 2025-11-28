"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import "./styles.css";

type HighlightPosition = { x: number; y: number; z: number };

type BoundingBox = {
  x: number;
  y: number;
  width?: number;
  height?: number;
};

type ReferenceImage = {
  src: string;
  width?: number;
  height?: number;
  alt?: string;
  page?: string;
};

type ManualPart = {
  id: string;
  label: string;
  note: string;
  highlightPosition: HighlightPosition;
  labelOffset?: number;
  boundingBox?: BoundingBox;
  referenceImage?: ReferenceImage;
};

type ManualDocument = {
  id: string;
  title: string;
  summary: string;
  modelUrl?: string;
  parts: ManualPart[];
  manualslibUrl: string;
  referenceImage?: ReferenceImage;
};

type ScrapedManualPart = {
  label: string;
  note: string;
  page?: string;
  boundingBox?: BoundingBox;
  image?: ReferenceImage;
};

type ManualslibImportResponse = {
  title: string;
  summary: string;
  modelUrl?: string;
  parts: ScrapedManualPart[];
  referenceImages?: ReferenceImage[];
};

const MANUAL_PLANE_WIDTH = 0.7;
const FALLBACK_ASPECT_RATIO = 1.1;

const baseManualDocuments: ManualDocument[] = [
  {
    id: "manualslib-placeholder",
    title: "Manualslib AR import",
    summary: "Paste a Manualslib URL below to load real page imagery and part highlights.",
    manualslibUrl: "https://www.manualslib.com",
    parts: [
      {
        id: "placeholder-anchor",
        label: "Waiting for Manualslib import",
        note: "Add a Manualslib link to replace this placeholder with real parts and page alignment.",
        highlightPosition: { x: 0, y: 0.12, z: -0.25 },
        labelOffset: 0.08,
      },
    ],
  },
];

const slugify = (value: string, index: number) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-") || `section-${index}`;

const circularFallbackPosition = (index: number, total: number): HighlightPosition => {
  const angle = (index / Math.max(total, 1)) * Math.PI * 2;
  const radius = 0.22;
  const height = 0.08 + (index % 2) * 0.06;
  return {
    x: radius * Math.cos(angle),
    y: height,
    z: radius * Math.sin(angle) * -1,
  };
};

const derivePlaneSize = (image?: ReferenceImage) => {
  const aspect = image?.width && image?.height ? image.width / image.height : FALLBACK_ASPECT_RATIO;
  const width = MANUAL_PLANE_WIDTH;
  const height = width / aspect;
  return { width, height };
};

const positionFromBoundingBox = (
  boundingBox: BoundingBox | undefined,
  image: ReferenceImage | undefined,
  planeSize: { width: number; height: number }
): { highlightPosition: HighlightPosition; labelOffset: number } | null => {
  if (!boundingBox || !image?.width || !image?.height) return null;

  const centerX = boundingBox.x + (boundingBox.width ?? 0) / 2;
  const centerY = boundingBox.y + (boundingBox.height ?? 0) / 2;

  const normalizedX = centerX / image.width - 0.5;
  const normalizedY = 0.5 - centerY / image.height;

  const highlightPosition: HighlightPosition = {
    x: normalizedX * planeSize.width,
    y: normalizedY * planeSize.height,
    z: 0.01,
  };

  const heightRatio = image.height ? (boundingBox.height ?? 0) / image.height : 0.1;
  const labelOffset = Math.max(0.05, planeSize.height * heightRatio + 0.04);

  return { highlightPosition, labelOffset };
};

const mapScrapedPartsToManualParts = (
  parts: ScrapedManualPart[],
  referenceImage?: ReferenceImage
): ManualPart[] => {
  const normalizeBoundingBox = (box?: BoundingBox) => {
    if (!box) return undefined;
    const x = Number(box.x);
    const y = Number(box.y);
    if (Number.isNaN(x) || Number.isNaN(y)) return undefined;

    const width = box.width !== undefined ? Number(box.width) : undefined;
    const height = box.height !== undefined ? Number(box.height) : undefined;

    return {
      x,
      y,
      width: Number.isNaN(width ?? NaN) ? undefined : width,
      height: Number.isNaN(height ?? NaN) ? undefined : height,
    } satisfies BoundingBox;
  };

  const normalized = parts.length
    ? parts
    : [
        {
          label: "Manual overview",
          note: "Imported from Manualslib; use this to anchor the overlay.",
        },
      ];

  const planeSize = derivePlaneSize(referenceImage);

  return normalized.map((part, index) => {
    const id = slugify(part.label || `section-${index + 1}`, index);
    const boundingBox = normalizeBoundingBox(part.boundingBox);
    const placement = positionFromBoundingBox(boundingBox, part.image || referenceImage, planeSize);

    return {
      id,
      label: part.label || `Section ${index + 1}`,
      note: part.note || "Section imported from Manualslib.",
      highlightPosition: placement?.highlightPosition || circularFallbackPosition(index, normalized.length),
      labelOffset: placement?.labelOffset,
      boundingBox,
      referenceImage: part.image || referenceImage,
    };
  });
};

export default function Page() {
  const [manualQuery, setManualQuery] = useState("");
  const [partQuery, setPartQuery] = useState("");
  const [manualslibQuery, setManualslibQuery] = useState("");
  const [manualslibUrl, setManualslibUrl] = useState("");
  const [manualslibTitle, setManualslibTitle] = useState("");
  const [manualslibSummary, setManualslibSummary] = useState("");
  const [manuals, setManuals] = useState<ManualDocument[]>(baseManualDocuments);
  const [selectedManualId, setSelectedManualId] = useState(baseManualDocuments[0]?.id ?? "");
  const [selectedPartId, setSelectedPartId] = useState(baseManualDocuments[0]?.parts[0]?.id ?? "");
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
  const anchorGroupRef = useRef<any>(null);
  const anchorRef = useRef<any>(null);
  const hitTestSourceRef = useRef<any>(null);
  const viewerSpaceRef = useRef<any>(null);
  const labelRendererRef = useRef<any>(null);
  const css2dHelpersRef = useRef<{ CSS2DObject?: any } | null>(null);
  const labelObjectRef = useRef<any>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const arSessionStartedRef = useRef(false);

  const selectedManual = useMemo<ManualDocument>(() => {
    const manual = manuals.find((entry) => entry.id === selectedManualId) ?? manuals[0];
    return manual ?? baseManualDocuments[0];
  }, [manuals, selectedManualId]);

  const filteredManuals = useMemo(() => {
    if (!manualQuery.trim()) return manuals;
    const query = manualQuery.toLowerCase();
    const results = manuals.filter(
      (manual) =>
        manual.title.toLowerCase().includes(query) ||
        manual.summary.toLowerCase().includes(query) ||
        manual.manualslibUrl.toLowerCase().includes(query)
    );
    return results.length ? results : manuals;
  }, [manualQuery, manuals]);

  const filteredParts = useMemo(() => {
    if (!selectedManual) return [] as ManualPart[];
    if (!partQuery.trim()) return selectedManual.parts;
    const query = partQuery.toLowerCase();
    const results = selectedManual.parts.filter(
      (part) => part.label.toLowerCase().includes(query) || part.note.toLowerCase().includes(query)
    );
    return results.length ? results : selectedManual.parts;
  }, [selectedManual, partQuery]);

  const manualslibSearchLink = useMemo(() => {
    const query = manualslibQuery.trim() || selectedManual?.title || "manual";
    return `https://www.manualslib.com/search.html?q=${encodeURIComponent(query)}`;
  }, [manualslibQuery, selectedManual]);

  const handleManualslibAdd = async () => {
    if (!manualslibUrl.trim()) {
      setStatus("Paste a Manualslib URL to add it to AR.");
      return;
    }

    setStatus("Fetching Manualslib content…");

    try {
      const response = await fetch("/api/manualslib", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: manualslibUrl.trim() }),
      });

      const parsed: ManualslibImportResponse | { error?: string } = await response.json();

      if (!response.ok || !("parts" in parsed)) {
        const message = (parsed as { error?: string }).error || "Could not read the Manualslib page.";
        throw new Error(message);
      }

      const referenceImage = parsed.referenceImages?.[0] || parsed.parts.find((part) => part.image)?.image;
      const parsedParts = mapScrapedPartsToManualParts(parsed.parts, referenceImage);
      const newManual: ManualDocument = {
        id: `manualslib-${Date.now()}`,
        title: manualslibTitle.trim() || parsed.title,
        summary:
          manualslibSummary.trim() || parsed.summary || "Linked from Manualslib. Use the AR controls to position the highlight.",
        manualslibUrl: manualslibUrl.trim(),
        modelUrl: parsed.modelUrl,
        referenceImage,
        parts: parsedParts,
      };

      setManuals((prev) => [...prev, newManual]);
      setSelectedManualId(newManual.id);
      setSelectedPartId(newManual.parts[0]?.id ?? "");
      setManualslibUrl("");
      setManualslibTitle("");
      setManualslibSummary("");
      setStatus("Manualslib link added with parsed sections. Start AR to view the overlay.");
    } catch (error: any) {
      console.error("Manualslib import failed", error);
      setStatus(error?.message || "Could not import Manualslib content.");
    }
  };

  useEffect(() => {
    if (!filteredManuals.find((manual) => manual.id === selectedManualId)) {
      const fallbackManual = filteredManuals[0] ?? manuals[0];
      if (fallbackManual) {
        setSelectedManualId(fallbackManual.id);
        setSelectedPartId(fallbackManual.parts[0]?.id ?? "");
      }
    }
  }, [filteredManuals, manuals, selectedManualId]);

  useEffect(() => {
    if (!selectedManual) return;
    const manualPartIds = selectedManual.parts.map((part) => part.id);
    if (!manualPartIds.includes(selectedPartId)) {
      setSelectedPartId(selectedManual.parts[0]?.id ?? "");
    }
  }, [selectedManual, selectedPartId]);

  useEffect(() => {
    if (!selectedManual) return;
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
    if (labelObjectRef.current && part.highlightPosition) {
      const offset = part.labelOffset ?? 0.08;
      labelObjectRef.current.position.set(part.highlightPosition.x, part.highlightPosition.y + offset, part.highlightPosition.z);
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
    if (!arContainerRef.current || !selectedManual) return;

    const [{ default: THREE }] = await Promise.all([import("three")]);
    const referenceImage = selectedManual.referenceImage || selectedManual.parts.find((part) => part.referenceImage)?.referenceImage;
    const planeSize = derivePlaneSize(referenceImage);

    if (!anchorGroupRef.current) {
      anchorGroupRef.current = new THREE.Group();
      anchorGroupRef.current.matrixAutoUpdate = false;
      anchorGroupRef.current.visible = false;
      sceneRef.current.add(anchorGroupRef.current);
    }

    if (modelRef.current) {
      anchorGroupRef.current.remove(modelRef.current);
      modelRef.current = null;
    }

    setStatus(`Loading ${selectedManual.title}…`);

    const loadModelUrl = async () => {
      if (!selectedManual?.modelUrl) {
        setStatus("No 3D asset provided; consider using a Manualslib page image instead.");
        return;
      }

      const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
      const loader = new GLTFLoader();

      loader.load(
        selectedManual.modelUrl,
        (gltf) => {
          if (modelRef.current) {
            anchorGroupRef.current?.remove(modelRef.current);
          }
          modelRef.current = gltf.scene;
          modelRef.current.scale.set(0.8, 0.8, 0.8);
          modelRef.current.position.set(0, -0.35, -1);
          anchorGroupRef.current?.add(modelRef.current);
          setStatus("3D model placed. Move your phone to inspect the highlight.");

          const firstPart = selectedManual.parts[0];
          if (firstPart) {
            createHighlightSphere(THREE, firstPart);
          }
        },
        undefined,
        (error) => {
          console.error("Error loading model", error);
          setStatus("Could not load the provided model; try another Manualslib link.");
        }
      );
    };

    if (referenceImage?.src) {
      const loader = new THREE.TextureLoader();
      loader.load(
        referenceImage.src,
        (texture) => {
          const aspect =
            referenceImage.width && referenceImage.height
              ? referenceImage.width / referenceImage.height
              : texture.image?.width && texture.image?.height
                ? texture.image.width / texture.image.height
                : planeSize.width / planeSize.height;

          const width = MANUAL_PLANE_WIDTH;
          const height = width / aspect;
          const geometry = new THREE.PlaneGeometry(width, height);
          const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.DoubleSide });
          modelRef.current = new THREE.Mesh(geometry, material);
          modelRef.current.position.set(0, 0, -0.6);
          anchorGroupRef.current?.add(modelRef.current);

          const resolvedImage: ReferenceImage | undefined = referenceImage
            ? {
                ...referenceImage,
                width: referenceImage.width ?? (texture.image?.width as number | undefined),
                height: referenceImage.height ?? (texture.image?.height as number | undefined),
              }
            : undefined;

          const needsDimensionUpdate = Boolean(referenceImage && (!referenceImage.width || !referenceImage.height));
          if (needsDimensionUpdate && resolvedImage) {
            setManuals((prevManuals) =>
              prevManuals.map((manual) => {
                if (manual.id !== selectedManual.id) return manual;
                const recalculatedParts = manual.parts.map((part) => {
                  const placement = positionFromBoundingBox(
                    part.boundingBox,
                    part.referenceImage || resolvedImage,
                    { width, height }
                  );
                  if (!placement) return part;
                  return {
                    ...part,
                    highlightPosition: placement.highlightPosition,
                    labelOffset: placement.labelOffset,
                    referenceImage: part.referenceImage || resolvedImage,
                  };
                });
                return { ...manual, referenceImage: resolvedImage, parts: recalculatedParts };
              })
            );
          }
          setStatus("Manual page anchored. Align your phone to match the highlighted part.");

          const firstPart = selectedManual.parts[0];
          if (firstPart) {
            createHighlightSphere(THREE, firstPart);
          }
        },
        undefined,
        async (error) => {
          console.error("Manual image load failed", error);
          await loadModelUrl();
        }
      );
      return;
    }

    await loadModelUrl();
  };

  const createHighlightSphere = (THREE: any, part: ManualPart) => {
    if (!anchorGroupRef.current) return;

    const geo = new THREE.SphereGeometry(0.03, 24, 24);
    const mat = new THREE.MeshBasicMaterial({ color: 0xff8c42, transparent: true, opacity: 0.9 });

    if (highlightRef.current) {
      anchorGroupRef.current.remove(highlightRef.current);
    }

    highlightRef.current = new THREE.Mesh(geo, mat);
    highlightRef.current.position.set(part.highlightPosition.x, part.highlightPosition.y, part.highlightPosition.z);
    anchorGroupRef.current.add(highlightRef.current);

    if (overlayLabelRef.current && css2dHelpersRef.current?.CSS2DObject) {
      if (labelObjectRef.current) {
        labelObjectRef.current.removeFromParent();
      }
      labelObjectRef.current = new css2dHelpersRef.current.CSS2DObject(overlayLabelRef.current);
      const offset = part.labelOffset ?? 0.08;
      labelObjectRef.current.position.set(part.highlightPosition.x, part.highlightPosition.y + offset, part.highlightPosition.z);
      anchorGroupRef.current.add(labelObjectRef.current);
    }
  };

  useEffect(() => {
    if (arSessionStartedRef.current) {
      loadManualModel();
    }
  }, [selectedManualId]);

  const startArRenderLoop = () => {
    if (!rendererRef.current) return;

    rendererRef.current.setAnimationLoop((_: number, frame: any) => {
      if (!frame || !sceneRef.current || !cameraRef.current) return;

      const referenceSpace = rendererRef.current.xr.getReferenceSpace();
      const hitTestSource = hitTestSourceRef.current;
      const anchorGroup = anchorGroupRef.current;

      if (!referenceSpace || !anchorGroup) {
        rendererRef.current.render(sceneRef.current, cameraRef.current);
        labelRendererRef.current?.render(sceneRef.current, cameraRef.current);
        return;
      }

      const hitTestResults = hitTestSource ? frame.getHitTestResults(hitTestSource) : [];

      if (!anchorRef.current && hitTestResults.length > 0) {
        const hit = hitTestResults[0];
        if (typeof (hit as any).createAnchor === "function") {
          (hit as any)
            .createAnchor()
            .then((anchor: any) => {
              anchorRef.current = anchor;
              anchor.addEventListener("remove", () => {
                anchorRef.current = null;
                anchorGroup.visible = false;
              });
            })
            .catch((error: any) => {
              console.error("Anchor creation failed", error);
            });
        }
      }

      let pose: any = null;

      if (anchorRef.current) {
        pose = frame.getPose(anchorRef.current.anchorSpace, referenceSpace);
      }

      if (!pose && hitTestResults.length > 0) {
        const hitPose = hitTestResults[0].getPose(referenceSpace);
        if (hitPose) {
          pose = hitPose;
        }
      }

      if (pose) {
        anchorGroup.matrix.fromArray(pose.transform.matrix);
        anchorGroup.matrix.decompose(anchorGroup.position, anchorGroup.quaternion, anchorGroup.scale);
        anchorGroup.visible = true;
      }

      rendererRef.current.render(sceneRef.current, cameraRef.current);
      labelRendererRef.current?.render(sceneRef.current, cameraRef.current);
    });
  };

  const initThree = async () => {
    if (!arContainerRef.current) return;
    if (rendererRef.current) return;

    const THREE = await import("three");
    const { CSS2DRenderer, CSS2DObject } = await import(
      "three/examples/jsm/renderers/CSS2DRenderer.js"
    );
    css2dHelpersRef.current = { CSS2DObject };

    sceneRef.current = new THREE.Scene();
    sceneRef.current.background = null;

    cameraRef.current = new THREE.PerspectiveCamera();

    rendererRef.current = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    rendererRef.current.setSize(arContainerRef.current.clientWidth, arContainerRef.current.clientHeight);
    rendererRef.current.xr.enabled = true;
    arContainerRef.current.appendChild(rendererRef.current.domElement);

    labelRendererRef.current = new CSS2DRenderer();
    labelRendererRef.current.setSize(arContainerRef.current.clientWidth, arContainerRef.current.clientHeight);
    labelRendererRef.current.domElement.style.position = "absolute";
    labelRendererRef.current.domElement.style.top = "0";
    labelRendererRef.current.domElement.style.left = "0";
    labelRendererRef.current.domElement.style.pointerEvents = "none";
    arContainerRef.current.appendChild(labelRendererRef.current.domElement);

    const light = new THREE.HemisphereLight(0xffffff, 0xbbbbff, 1.1);
    sceneRef.current.add(light);
  };

  const ensureCameraPreview = async (showContainer = false) => {
    if (!cameraFallbackRef.current || !cameraPreviewRef.current) return false;
    const buildConstraints = (facingMode: "environment" | "user") => {
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
        navigator.userAgent
      );

      return {
        width: { ideal: isMobile ? 1920 : 1280 },
        height: { ideal: isMobile ? 1080 : 720 },
        aspectRatio: { ideal: 16 / 9 },
        facingMode: { ideal: facingMode },
      } satisfies MediaTrackConstraints;
    };

    const revealCameraFallback = () => {
      cameraFallbackRef.current?.classList.remove("hidden");
    };

    const applyStreamToPreview = (stream: MediaStream) => {
      if (!cameraPreviewRef.current || !cameraFallbackRef.current) return;

      const [videoTrack] = stream.getVideoTracks();
      const settings = videoTrack?.getSettings?.();
      const aspectFromSettings = settings?.aspectRatio as number | undefined;
      const derivedAspect =
        typeof aspectFromSettings === "number"
          ? aspectFromSettings
          : settings?.width && settings?.height
            ? settings.width / settings.height
            : undefined;

      if (derivedAspect) {
        cameraFallbackRef.current.style.setProperty("--camera-aspect", derivedAspect.toString());
      }

      cameraPreviewRef.current.style.objectFit = "contain";
    };

    const requestCameraStream = async () => {
      try {
        return await navigator.mediaDevices.getUserMedia({
          video: buildConstraints("environment"),
          audio: false,
        });
      } catch (error) {
        console.warn("Environment camera unavailable, falling back to user-facing camera", error);
        return navigator.mediaDevices.getUserMedia({
          video: buildConstraints("user"),
          audio: false,
        });
      }
    };

    if (showContainer) {
      revealCameraFallback();
    }
    if (streamRef.current) {
      applyStreamToPreview(streamRef.current);
      return true;
    }
    try {
      streamRef.current = await requestCameraStream();
      cameraPreviewRef.current.srcObject = streamRef.current;
      await cameraPreviewRef.current.play();
      applyStreamToPreview(streamRef.current);
      revealCameraFallback();
      setStatus("Camera preview active. Move the phone to align with the highlighted part label.");
      return true;
    } catch (error) {
      console.error("Camera access failed", error);
      setStatus("Camera permissions needed to show preview.");
      return false;
    }
  };

  const startCameraFallback = async () => {
    await ensureCameraPreview(true);
  };

  const startWebXR = async () => {
    const cameraReady = await ensureCameraPreview(true);
    if (!cameraReady) return;

    if (arSessionStartedRef.current) {
      const part = selectedManual?.parts.find((p) => p.id === selectedPartId);
      if (part && highlightRef.current) {
        highlightRef.current.position.set(part.highlightPosition.x, part.highlightPosition.y, part.highlightPosition.z);
      }
      if (part && labelObjectRef.current) {
        const offset = part.labelOffset ?? 0.08;
        labelObjectRef.current.position.set(part.highlightPosition.x, part.highlightPosition.y + offset, part.highlightPosition.z);
      }
      return;
    }

    if (!(navigator as any).xr) {
      setStatus("WebXR not available. Using camera preview.");
      startCameraFallback();
      return;
    }

    try {
      await initThree();
      const [{ ARButton }] = await Promise.all([import("three/examples/jsm/webxr/ARButton.js")]);

      const arButton = ARButton.createButton(rendererRef.current, {
        requiredFeatures: ["hit-test"],
        optionalFeatures: ["dom-overlay"],
        domOverlay: { root: document.body },
      });
      arButton.classList.add("hidden");
      document.body.appendChild(arButton);

      rendererRef.current.xr.addEventListener("sessionstart", async () => {
        arSessionStartedRef.current = true;
        setStatus("AR session started. Anchoring model…");
        cameraFallbackRef.current?.classList.add("hidden");

        const session = rendererRef.current.xr.getSession();
        try {
          if (session) {
            const viewerSpace = await session.requestReferenceSpace("viewer");
            viewerSpaceRef.current = viewerSpace;
            hitTestSourceRef.current = await session.requestHitTestSource({ space: viewerSpace });
          }
        } catch (error) {
          console.error("Hit test setup failed", error);
          setStatus("Could not start hit testing; try moving the device closer to a surface.");
        }

        anchorRef.current = null;
        loadManualModel();
        startArRenderLoop();
      });

      rendererRef.current.xr.addEventListener("sessionend", () => {
        arSessionStartedRef.current = false;
        anchorRef.current = null;
        if (hitTestSourceRef.current?.cancel) {
          hitTestSourceRef.current.cancel();
        }
        hitTestSourceRef.current = null;
        viewerSpaceRef.current = null;
        if (anchorGroupRef.current) {
          anchorGroupRef.current.visible = false;
        }
        if (labelObjectRef.current) {
          labelObjectRef.current.removeFromParent();
          labelObjectRef.current = null;
        }
        if (overlayLabelRef.current && cameraFallbackRef.current) {
          cameraFallbackRef.current.appendChild(overlayLabelRef.current);
        }
        rendererRef.current?.setAnimationLoop(null);
        setStatus("AR session ended. Tap start to re-enter.");
        startCameraFallback();
      });

      rendererRef.current.xr.setSession(null);
      arButton.click();
    } catch (error) {
      console.error("WebXR start failed", error);
      setStatus("Could not start WebXR; staying on camera preview.");
      startCameraFallback();
    }
  };

  useEffect(() => {
    const handleResize = () => {
      if (!rendererRef.current || !arContainerRef.current) return;
      rendererRef.current.setSize(arContainerRef.current.clientWidth, arContainerRef.current.clientHeight);
      labelRendererRef.current?.setSize(
        arContainerRef.current.clientWidth,
        arContainerRef.current.clientHeight
      );
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return (
    <div className="phoneArPage">
      <header className="app-header">
        <div className="branding">
          <div className="logo">📱🔧</div>
          <div>
            <h1>Manualslib Phone AR</h1>
            <p className="tagline">Point your phone, load a Manualslib manual, highlight the exact part.</p>
          </div>
        </div>
        <p id="status" className="status" aria-live="polite">
          {status}
        </p>
      </header>

      <main className="layout">
        <section className="controls">
          <h2>Choose a Manual</h2>

          <label htmlFor="manualSearch">Search Manualslib manuals</label>
          <input
            id="manualSearch"
            type="search"
            placeholder="Type to search manuals by title, summary, or URL"
            value={manualQuery}
            onChange={(event) => setManualQuery(event.target.value)}
          />

          <label htmlFor="manualslibSearch">Search on Manualslib.com</label>
          <div className="manualslib-row">
            <input
              id="manualslibSearch"
              type="search"
              placeholder="Example: Bosch SilencePlus or iPhone 13"
              value={manualslibQuery}
              onChange={(event) => setManualslibQuery(event.target.value)}
            />
            <a className="secondary" href={manualslibSearchLink} target="_blank" rel="noreferrer">
              Open search
            </a>
          </div>
          <p className="note">
            We open Manualslib in a new tab so you can find the exact guide, then paste the link below to add it to
            augmented reality.
          </p>

          <label htmlFor="manualSelect">Manualslib document</label>
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
            <br />
            <a className="inline-link" href={selectedManual.manualslibUrl} target="_blank" rel="noreferrer">
              View on Manualslib
            </a>
          </p>

          <label htmlFor="manualslibUrl">Add a Manualslib link to AR</label>
          <input
            id="manualslibUrl"
            type="url"
            placeholder="https://www.manualslib.com/manual/..."
            value={manualslibUrl}
            onChange={(event) => setManualslibUrl(event.target.value)}
          />

          <label htmlFor="manualslibTitle">Display name (optional)</label>
          <input
            id="manualslibTitle"
            type="text"
            placeholder="How this manual should appear in AR"
            value={manualslibTitle}
            onChange={(event) => setManualslibTitle(event.target.value)}
          />

          <label htmlFor="manualslibSummary">Quick note (optional)</label>
          <textarea
            id="manualslibSummary"
            rows={2}
            placeholder="Add a note about the manual or the part you plan to highlight"
            value={manualslibSummary}
            onChange={(event) => setManualslibSummary(event.target.value)}
          />

          <button className="secondary" type="button" onClick={handleManualslibAdd}>
            Add Manualslib manual to AR list
          </button>

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
          <li>Search on Manualslib.com, add the URL, then pick the manual and part you want to inspect.</li>
          <li>Press <strong>Start AR session</strong> and grant camera permission when asked.</li>
          <li>We place the 3D model in front of you, highlight the chosen part in orange, and keep the camera preview on.
          </li>
          <li>Move around to inspect the highlighted area; tap the dropdowns to switch parts.</li>
        </ol>
      </section>
    </div>
  );
}
