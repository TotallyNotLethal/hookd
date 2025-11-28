"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import "./styles.css";
import "@tensorflow/tfjs";
import * as cocoSsd from "@tensorflow-models/coco-ssd";

type Detection = cocoSsd.DetectedObject & { id: string };

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

export default function Page() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const modelRef = useRef<cocoSsd.ObjectDetection | null>(null);

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

  const assignDetectionIds = (previous: Detection[], predictions: cocoSsd.DetectedObject[]) => {
    const updated: Detection[] = predictions.map((item) => {
      const match = previous.find(
        (prior) => prior.class === item.class && iou(prior.bbox, item.bbox) > 0.4
      );
      return {
        ...item,
        id: match?.id || crypto.randomUUID(),
      };
    });
    detectionHistoryRef.current = updated;
    return updated;
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
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
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
      modelRef.current = await cocoSsd.load({ base: "lite_mobilenet_v2" });
      setModelReady(true);
      setStatus("Model ready. Start the camera to recognize objects.");
      return true;
    } catch (error) {
      console.error("Model load failed", error);
      setStatus("Could not load the detection model. Please retry.");
      return false;
    }
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

      ctx.strokeStyle = isSelected ? "#22d3ee" : color;
      ctx.lineWidth = isSelected ? 5 : 3;
      ctx.fillStyle = `${color}20`;
      ctx.beginPath();
      ctx.rect(x, y, w, h);
      ctx.fill();
      ctx.stroke();

      const label = customLabels[item.class] || item.class;
      const confidence = Math.round(item.score * 100);
      const labelText = `${label} (${confidence}%)`;

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
    });
  };

  const detectionLoop = async () => {
    if (!modelRef.current || !videoRef.current) return;
    try {
      const predictions = await modelRef.current.detect(videoRef.current);
      const enriched = assignDetectionIds(detectionHistoryRef.current, predictions);
      setDetections(enriched);
      if (!selectedId && enriched[0]) {
        setSelectedId(enriched[0].id);
      }
      drawDetections(enriched);
    } catch (error) {
      console.error("Detection loop failed", error);
      setStatus("Detection stopped due to an error. Try restarting.");
      setDetectionActive(false);
      return;
    }
    rafRef.current = requestAnimationFrame(detectionLoop);
  };

  const startDetection = async () => {
    const modelLoaded = await loadModel();
    if (!modelLoaded) return;
    const cameraStarted = await startCamera();
    if (!cameraStarted) return;
    detectionHistoryRef.current = [];
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
              <button className="primary" type="button" onClick={startLabelListening} disabled={!detections.length || listening}>
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
