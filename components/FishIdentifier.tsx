"use client";

import { useState, useRef, useEffect } from "react";
import * as ort from "onnxruntime-web";
import { getFirestore, collection, addDoc } from "firebase/firestore";
import { app } from "@/lib/firebaseClient";

export default function FishIdentifier() {
  const [detector, setDetector] = useState<ort.InferenceSession | null>(null);
  const [classifier, setClassifier] = useState<ort.InferenceSession | null>(null);
  const [labels, setLabels] = useState<string[]>([]);
  const [speciesInfo, setSpeciesInfo] = useState<any | null>(null);
  const [result, setResult] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Load Models + Label List + Species Info
  useEffect(() => {
    (async () => {
      setDetector(await ort.InferenceSession.create(`${window.location.origin}/models/fish_detector.onnx`));
      setClassifier(await ort.InferenceSession.create(`${window.location.origin}/models/fish_classifier.onnx`));
      setLabels(await (await fetch(`/models/fish_classifier_labels.json`)).json());
      setSpeciesInfo(await (await fetch(`/models/species_info.json`)).json());
    })();
  }, []);

  function toTensor(imageData: ImageData, size: number) {
    const { data, width } = imageData;
    const f32 = new Float32Array(size * size * 3);
    let i = 0;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const px = (y * width + x) * 4;
        f32[i++] = data[px] / 255;
        f32[i++] = data[px + 1] / 255;
        f32[i++] = data[px + 2] / 255;
      }
    }
    return new ort.Tensor("float32", f32, [1, 3, size, size]);
  }

  async function identify(img: HTMLImageElement) {
    if (!detector || !classifier) return;

    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;

    // Resize to detector input resolution
    canvas.width = 640;
    canvas.height = 640;
    ctx.drawImage(img, 0, 0, 640, 640);

    const detTensor = toTensor(ctx.getImageData(0, 0, 640, 640), 640);
    const detOut = await detector.run({ images: detTensor });
    const boxes = detOut[Object.keys(detOut)[0]].data;

    if (!boxes || boxes.length < 4) {
      setResult("No fish detected.");
      return;
    }

    const [x1, y1, x2, y2] = Array.from(boxes as Iterable<number>);
    const w = x2 - x1;
    const h = y2 - y1;

    // Draw bounding box on preview
    ctx.strokeStyle = "#00ff66";
    ctx.lineWidth = 4;
    ctx.strokeRect(x1, y1, w, h);

    // Crop → classifier input size
    const crop = document.createElement("canvas");
    crop.width = 224;
    crop.height = 224;
    crop.getContext("2d")!.drawImage(canvas, x1, y1, w, h, 0, 0, 224, 224);

    const clsTensor = toTensor(crop.getContext("2d")!.getImageData(0, 0, 224, 224), 224);
    const clsOut = await classifier.run({ images: clsTensor });

    const probsRaw = clsOut[Object.keys(clsOut)[0]].data;
    const probs = Array.from(probsRaw as Iterable<number>);
    const maxIndex = probs.indexOf(Math.max(...probs));

    setResult(`${labels[maxIndex]} (${(probs[maxIndex] * 100).toFixed(1)}%)`);
  }

  async function startCamera(useRear = false) {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: useRear ? { exact: "environment" } : "user" },
      audio: false
    });

    videoRef.current!.srcObject = stream;
    await videoRef.current!.play();
    requestAnimationFrame(liveIdentifyLoop);
  }

  function liveIdentifyLoop() {
    if (!videoRef.current) return;
    snapFrame();
    requestAnimationFrame(liveIdentifyLoop);
  }

  function snapFrame() {
    const video = videoRef.current!;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0);
    const img = new Image();
    img.src = canvas.toDataURL();
    img.onload = () => identify(img);
  }

  async function submitFeedback() {
    const db = getFirestore(app);
    await addDoc(collection(db, "fish_feedback"), {
      guess: result,
      timestamp: Date.now()
    });
    alert("Thanks! Your correction will help improve accuracy.");
  }

  return (
    <div className="p-4 space-y-4">

      <h2 className="text-xl font-bold">🎣 Hook'd Vision</h2>

      {/* Upload */}
      <input
        type="file"
        accept="image/*"
        onChange={(e) => {
          const img = new Image();
          img.src = URL.createObjectURL(e.target.files![0]);
          img.onload = () => identify(img);
        }}
      />

      {/* Camera Switch Buttons */}
      <div className="flex gap-3">
        <button onClick={() => startCamera(false)} className="px-3 py-2 bg-blue-600 text-white rounded">Front Camera</button>
        <button onClick={() => startCamera(true)} className="px-3 py-2 bg-blue-600 text-white rounded">Rear Camera</button>
      </div>

      <video ref={videoRef} className="rounded w-full" />
      <canvas ref={canvasRef} className="rounded w-full" />

      {result && (
        <div className="text-lg font-semibold mt-2">
          {result}
          <button onClick={submitFeedback} className="ml-3 text-sm underline text-red-400">
            Not correct?
          </button>
        </div>
      )}

      {result && speciesInfo && speciesInfo[result.split(" ")[0]] && (
        <div className="mt-4 p-3 rounded bg-slate-800 text-white space-y-1">
          <div className="text-xl font-bold">{speciesInfo[result.split(" ")[0]].commonName}</div>
          <div><b>Habitat:</b> {speciesInfo[result.split(" ")[0]].habitat}</div>
          <div><b>Bait Tips:</b> {speciesInfo[result.split(" ")[0]].baitTips}</div>
          <div>{speciesInfo[result.split(" ")[0]].notes}</div>
        </div>
      )}

    </div>
  );
}
