"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import "./styles.css";
import * as tf from "@tensorflow/tfjs";
import * as cocoSsd from "@tensorflow-models/coco-ssd";

type Detection = cocoSsd.DetectedObject & {
  id: string;
  life: number;
  misses: number;
  lastSeen: number;
};

type CustomLabelMap = Record<string, string>;

type SpeechRecognitionEvent = Event & {
  results: ArrayLike<{ 0: { transcript: string } }>;
};

type SpeechRecognitionErrorEvent = Event & {
  error: string;
};

type SpeechRecognitionInstance = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;

const getSpeechRecognition = (): SpeechRecognitionConstructor | null => {
  if (typeof window === "undefined") return null;
  return (
    (window as any).SpeechRecognition ||
    (window as any).webkitSpeechRecognition ||
    null
  );
};

const detectionColors = ["#ff8c42", "#8fb3ff", "#4ade80", "#f472b6", "#facc15"];
const SMOOTHING = 0.45;
const FRAME_INTERVAL_MS = 70; // ~14 FPS for smoother canvas updates without overwhelming the GPU
const MAX_LIFE = 4;
const STRONG_IOU = 0.55;
const HYSTERESIS_IOU = 0.4;
const SCORE_HYSTERESIS = 0.1;
const EMPTY_RESULT_GRACE_MS = 350;
const DETECTION_STALE_MS = 800;

export default function Page() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const modelRef = useRef<cocoSsd.ObjectDetection | null>(null);
  const isProcessingRef = useRef(false);
  const lastDetectionTsRef = useRef(0);
  const lastNonEmptyDetectionTsRef = useRef(0);

  const [status, setStatus] = useState("Load the model to begin object recognition.");
  const [modelReady, setModelReady] = useState(false);
  const [detections, setDetections] = useState<Detection[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [customLabels, setCustomLabels] = useState<CustomLabelMap>({});
  const [listening, setListening] = useState(false);
  const [detectionActive, setDetectionActive] = useState(false);
  const [typedLabel, setTypedLabel] = useState("");

  const selectedDetection = useMemo(
    () => detections.find((item) => item.id === selectedId),
    [detections, selectedId]
  );

  const detectionHistoryRef = useRef<Detection[]>([]);

  const filterFreshDetections = (items: Detection[], timestamp: number) =>
    items.filter((item) => timestamp - item.lastSeen <= DETECTION_STALE_MS);

  const iou = (a: number[], b: number[]) => {
    const [ax, ay, aw, ah] = a;
    const [bx, by, bw, bh] = b;
    const x1 = Math.max(ax, bx);
    const y1 = Math.max(ay, by);
    const x2 = Math.min(ax + aw, bx + bw);
    const y2 = Math.min(ay + ah, by + bh);
    const intersection = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
    const union = aw * ah + bw * bh - intersection;
    return union === 0 ? 0 : intersection / union;
  };

  const assignDetectionIds = (
    previous: Detection[],
    predictions: cocoSsd.DetectedObject[],
    timestamp: number
  ) => {
    const matchedIds = new Set<string>();

    const updated: Detection[] = predictions.map((item) => {
      let bestMatch: Detection | null = null;
      let bestIoU = 0;

      previous.forEach((prior) => {
        if (prior.class !== item.class) return;

        const overlap = iou(prior.bbox, item.bbox);
        const strongMatch = overlap >= STRONG_IOU;
        const scoreStable = item.score >= prior.score - SCORE_HYSTERESIS;
        const hysteresisMatch = overlap >= HYSTERESIS_IOU && scoreStable;

        if ((strongMatch || hysteresisMatch) && overlap > bestIoU) {
          bestIoU = overlap;
          bestMatch = prior;
        }
      });

      const smoothedBox = bestMatch
        ? item.bbox.map(
            (coord, index) => bestMatch!.bbox[index] + SMOOTHING * (coord - bestMatch!.bbox[index])
          )
        : item.bbox;

      if (bestMatch) {
        matchedIds.add(bestMatch.id);
      }

      return {
        ...item,
        id: bestMatch?.id || crypto.randomUUID(),
        bbox: smoothedBox as [number, number, number, number],
        life: MAX_LIFE,
        misses: 0,
        lastSeen: timestamp,
      };
    });

    const carriedForward: Detection[] = previous
      .filter((prior) => !matchedIds.has(prior.id) && prior.life > 1)
      .map((prior) => ({
        ...prior,
        life: prior.life - 1,
        misses: prior.misses + 1,
      }));

    const nextDetections = [...updated, ...carriedForward].filter(
      (item) => timestamp - item.lastSeen <= DETECTION_STALE_MS
    );
    detectionHistoryRef.current = nextDetections;
    return nextDetections;
  };

  const stopStream = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  };

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      stopStream();
      recognitionRef.current?.stop();
    };
  }, []);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 960 }, height: { ideal: 540 } },
        audio: false,
      });
      streamRef.current = stream;
      if (!videoRef.current) return false;
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      return true;
    } catch (error) {
      console.error("Camera access failed", error);
      setStatus("Camera permission is required for object recognition.");
      return false;
    }
  };

  const loadModel = async () => {
    if (modelReady || modelRef.current) return true;
    setStatus("Loading lightweight detection model…");
    try {
      if (tf.getBackend() !== "webgpu") {
        try {
          await tf.setBackend("webgpu");
          await tf.ready();
        } catch (error) {
          console.warn("WebGPU backend unavailable, falling back to WebGL", error);
        }
      }

      if (tf.getBackend() !== "webgpu" && tf.getBackend() !== "webgl") {
        await tf.setBackend("webgl");
        await tf.ready();
      }

      modelRef.current = await cocoSsd.load({ base: "mobilenet_v2" });
      const dummy = tf.zeros<tf.Rank.R3>([300, 300, 3]);
      await modelRef.current.detect(dummy);
      dummy.dispose();
      setModelReady(true);
      setStatus(
        `${tf.getBackend()} backend ready. Start the camera to recognize objects with a stronger model.`
      );
      return true;
    } catch (error) {
      console.error("Model load failed", error);
      setStatus("Could not load the detection model. Please retry.");
      return false;
    }
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  const drawDetections = (items: Detection[]) => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = video.videoWidth;
    const height = video.videoHeight;

    canvas.width = width;
    canvas.height = height;

    ctx.clearRect(0, 0, width, height);

    items.forEach((item, index) => {
      const [x, y, w, h] = item.bbox;
      const isSelected = item.id === selectedId;
      const color = detectionColors[index % detectionColors.length];
      const fadeFactor = item.misses > 0 ? Math.max(0.25, item.life / MAX_LIFE) : 1;
      const boxAlpha = isSelected ? 1 : 0.35 + 0.65 * fadeFactor;

      ctx.save();
      ctx.globalAlpha = boxAlpha;
      ctx.strokeStyle = isSelected ? "#22d3ee" : color;
      ctx.lineWidth = isSelected ? 5 : 3;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.rect(x, y, w, h);
      ctx.fill();
      ctx.stroke();
      ctx.restore();

      const label = customLabels[item.class] || item.class;
      const confidence = Math.round(item.score * 100);
      const labelText = `${label} (${confidence}%)`;

      ctx.save();
      ctx.globalAlpha = boxAlpha;
      ctx.fillStyle = isSelected ? "#0f172a" : "#0b1021";
      ctx.strokeStyle = isSelected ? "#22d3ee" : color;
      ctx.lineWidth = 2;

      ctx.font = "16px Inter, system-ui, sans-serif";
      const textWidth = ctx.measureText(labelText).width + 12;
      const textX = x;
      const textY = Math.max(20, y - 10);

      ctx.fillRect(textX, textY - 20, textWidth, 24);
      ctx.strokeRect(textX, textY - 20, textWidth, 24);
      ctx.fillStyle = "#e8ecff";
      ctx.fillText(labelText, textX + 6, textY);
      ctx.restore();
    });
  };

  const renderCachedDetections = (timestamp: number) => {
    const fresh = filterFreshDetections(detectionHistoryRef.current, timestamp);
    if (fresh.length === 0) {
      clearCanvas();
      setDetections([]);
      return;
    }

    setDetections(fresh);
    drawDetections(fresh);
  };

  const detectionLoop = async (timestamp: number) => {
    if (!modelRef.current || !videoRef.current) return;
    if (isProcessingRef.current || timestamp - lastDetectionTsRef.current < FRAME_INTERVAL_MS) {
      renderCachedDetections(timestamp);
      rafRef.current = requestAnimationFrame(detectionLoop);
      return;
    }
    isProcessingRef.current = true;
    try {
      const predictions = await modelRef.current.detect(videoRef.current);
      const enriched = assignDetectionIds(detectionHistoryRef.current, predictions, timestamp);
      const fresh = filterFreshDetections(enriched, timestamp);

      const hasFreshDetections = fresh.length > 0;
      const withinGraceWindow = timestamp - lastNonEmptyDetectionTsRef.current < EMPTY_RESULT_GRACE_MS;
      const shouldReuseCached = !hasFreshDetections && withinGraceWindow;
      const toRender = shouldReuseCached
        ? filterFreshDetections(detectionHistoryRef.current, timestamp)
        : fresh;

      if (toRender.length > 0) {
        setDetections(toRender);
        if (!selectedId && toRender[0]) {
          setSelectedId(toRender[0].id);
        }
        drawDetections(toRender);
        if (hasFreshDetections) {
          lastNonEmptyDetectionTsRef.current = timestamp;
        }
      } else {
        clearCanvas();
        setDetections([]);
      }

      lastDetectionTsRef.current = timestamp;
    } catch (error) {
      console.error("Detection loop failed", error);
      setStatus("Detection stopped due to an error. Try restarting.");
      setDetectionActive(false);
      isProcessingRef.current = false;
      return;
    }
    isProcessingRef.current = false;
    rafRef.current = requestAnimationFrame(detectionLoop);
  };

  const startDetection = async () => {
    const modelLoaded = await loadModel();
    if (!modelLoaded) return;
    const cameraStarted = await startCamera();
    if (!cameraStarted) return;
    detectionHistoryRef.current = [];
    isProcessingRef.current = false;
    lastDetectionTsRef.current = 0;
    lastNonEmptyDetectionTsRef.current = 0;
    setSelectedId(null);
    setDetectionActive(true);
    setStatus("Camera on. Scanning for objects…");
    rafRef.current = requestAnimationFrame(detectionLoop);
  };

  const stopDetection = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    stopStream();
    detectionHistoryRef.current = [];
    setDetections([]);
    setSelectedId(null);
    setDetectionActive(false);
    setStatus("Detection paused. Restart to scan again.");
  };

  const handleCanvasClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const hit = detections.find((item) => {
      const [bx, by, bw, bh] = item.bbox;
      return x >= bx && x <= bx + bw && y >= by && y <= by + bh;
    });
    if (hit) {
      setSelectedId(hit.id);
      setStatus(`Selected ${customLabels[hit.class] || hit.class}. Say a new name to teach it.`);
    }
  };

  const startLabelListening = () => {
    const target = selectedDetection;
    if (!target) {
      setStatus("Select an object box before labeling it.");
      return;
    }

    const SpeechRecognition = getSpeechRecognition();
    if (!SpeechRecognition) {
      setStatus("Speech recognition not supported in this browser.");
      return;
    }

    const recognizer: SpeechRecognitionInstance = new SpeechRecognition();
    recognitionRef.current = recognizer;
    recognizer.lang = "en-US";
    recognizer.continuous = false;
    recognizer.interimResults = false;

    recognizer.onresult = (event: SpeechRecognitionEvent) => {
      const transcript = event.results?.[0]?.[0]?.transcript?.trim();
      if (transcript) {
        setCustomLabels((prev) => ({ ...prev, [target.class]: transcript }));
        setStatus(`Learned that ${target.class} should be called "${transcript}".`);
      } else {
        setStatus("No words captured. Try again.");
      }
      setListening(false);
    };

    recognizer.onerror = (event) => {
      console.error("Speech recognition error", event.error);
      setStatus("Voice labeling failed. Check microphone permissions.");
      setListening(false);
    };

    recognizer.onend = () => {
      setListening(false);
    };

    recognizer.start();
    setListening(true);
    setStatus("Listening… say what this object is.");
  };

  const applyTypedLabel = () => {
    const target = selectedDetection;
    if (!target) {
      setStatus("Select an object box before labeling it.");
      return;
    }

    const trimmed = typedLabel.trim();
    if (!trimmed) {
      setStatus("Type a name before applying it.");
      return;
    }

    setCustomLabels((prev) => ({ ...prev, [target.class]: trimmed }));
    setTypedLabel("");
    setStatus(`Learned that ${target.class} should be called "${trimmed}".`);
  };

  return (
    <div className="phoneArPage">
      <header className="app-header">
        <div className="branding">
          <div className="logo">🤖📱</div>
          <div>
            <h1>Phone AR Learner</h1>
            <p className="tagline">Recognize objects, draw bounding boxes, and teach new names with your voice.</p>
          </div>
        </div>
        <p className="status" aria-live="polite">
          {status}
        </p>
      </header>

      <main className="layout">
        <section className="viewer">
          <div className="ar-container">
            <video ref={videoRef} className="camera-feed" playsInline muted />
            <canvas ref={canvasRef} className="overlay" onClick={handleCanvasClick} />
            {!detectionActive && (
              <div className="placeholder">
                <p>
                  Start detection to stream the camera feed, run the COCO-SSD model in the browser, and visualize bounding boxes
                  in real time.
                </p>
              </div>
            )}
          </div>
        </section>

        <section className="controls">
          <h2>Controls</h2>
          <div className="button-row">
            <button className="primary" type="button" onClick={startDetection} disabled={detectionActive}>
              {detectionActive ? "Detecting…" : "Start detection"}
            </button>
            <button className="secondary" type="button" onClick={stopDetection} disabled={!detectionActive}>
              Stop
            </button>
          </div>

          <button className="secondary" type="button" onClick={loadModel} disabled={modelReady}>
            {modelReady ? "Model loaded" : "Load model without camera"}
          </button>

          <div className="callout">
            <strong>Teach the model</strong>
            <p>
              Tap a bounding box in the video, then type or say what the object is. The new name will replace the detected
              class for similar objects.
            </p>
            <div className="label-actions">
              <div className="text-labeler">
                <label htmlFor="typedLabel">Type a label</label>
                <div className="input-row">
                  <input
                    id="typedLabel"
                    type="text"
                    value={typedLabel}
                    onChange={(event) => setTypedLabel(event.target.value)}
                    placeholder="e.g. my water bottle"
                  />
                  <button type="button" onClick={applyTypedLabel} disabled={!detections.length}>
                    Apply
                  </button>
                </div>
              </div>
              <button
                className="primary"
                type="button"
                onClick={startLabelListening}
                disabled={!detections.length || listening}
              >
                {listening ? "Listening…" : "Record label"}
              </button>
            </div>
          </div>

          <div className="note">
            <strong>Detected objects</strong>
            {!detections.length && <p>No detections yet. Aim the camera at everyday objects.</p>}
            <ul className="detection-list">
              {detections.map((item) => {
                const label = customLabels[item.class] || item.class;
                return (
                  <li key={item.id} className={item.id === selectedId ? "active" : ""}>
                    <button type="button" onClick={() => setSelectedId(item.id)}>
                      {label} — {(item.score * 100).toFixed(1)}%
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>
      </main>

      <section className="instructions">
        <h2>How it works</h2>
        <ol>
          <li>Load the built-in COCO-SSD model and start the camera stream.</li>
          <li>Bounding boxes are drawn on the overlay canvas with confidence scores.</li>
          <li>Tap a box to select an object, then use your voice to rename it.</li>
          <li>Custom labels persist while the page is open, helping the model feel personal.</li>
        </ol>
      </section>
    </div>
  );
}
