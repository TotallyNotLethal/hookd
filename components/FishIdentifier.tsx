"use client";

import { useState, useRef, useEffect } from "react";
import * as ort from "onnxruntime-web";

export default function FishIdentifier() {
  const [detector, setDetector] = useState<ort.InferenceSession | null>(null);
  const [classifier, setClassifier] = useState<ort.InferenceSession | null>(null);
  const [labels, setLabels] = useState<string[]>([]);
  const [result, setResult] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    (async () => {
      setDetector(await ort.InferenceSession.create(`${window.location.origin}/models/fish_detector.onnx`));
      setClassifier(await ort.InferenceSession.create(`${window.location.origin}/models/fish_classifier.onnx`));
      setLabels(await (await fetch(`/models/fish_classifier_labels.json`)).json());
    })();
  }, []);

  function toTensor(imageData: ImageData, size: number) {
    const { data, width, height } = imageData;
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

    // Resize to detector input size
    canvas.width = 640;
    canvas.height = 640;
    ctx.drawImage(img, 0, 0, 640, 640);

    const detTensor = toTensor(ctx.getImageData(0, 0, 640, 640), 640);
    const detOut = await detector.run({ images: detTensor });

    // YOLO ONNX convention: output0 holds bounding boxes
    const boxes = detOut[Object.keys(detOut)[0]].data;
    if (!boxes || boxes.length < 4) return setResult("No fish detected.");

    const [x1, y1, x2, y2] = Array.from(boxes as Iterable<number>);

    // Crop and resize to 224x224 for classifier
    const w = x2 - x1;
    const h = y2 - y1;

    const cropCanvas = document.createElement("canvas");
    cropCanvas.width = 224;
    cropCanvas.height = 224;
    const cropCtx = cropCanvas.getContext("2d")!;
    cropCtx.drawImage(canvas, x1, y1, w, h, 0, 0, 224, 224);

    const clsTensor = toTensor(cropCtx.getImageData(0, 0, 224, 224), 224);
    const clsOut = await classifier.run({ images: clsTensor });

    const probs = clsOut[Object.keys(clsOut)[0]].data;
    const maxIndex = probs.indexOf(Math.max(...probs));

    setResult(`${labels[maxIndex]} (${(probs[maxIndex] * 100).toFixed(1)}%)`);
  }

  async function startCamera() {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    videoRef.current!.srcObject = stream;
    await videoRef.current!.play();
  }

  function snapFrame() {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const video = videoRef.current!;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0);
    const img = new Image();
    img.src = canvas.toDataURL();
    img.onload = () => identify(img);
  }

  return (
    <div className="p-4 space-y-4">

      <h2 className="text-xl font-bold">Fish Identifier</h2>

      {/* Upload Image */}
      <input
        type="file"
        accept="image/*"
        onChange={(e) => {
          const img = new Image();
          img.src = URL.createObjectURL(e.target.files![0]);
          img.onload = () => identify(img);
        }}
      />

      {/* Camera Mode */}
      <button onClick={startCamera} className="px-4 py-2 bg-blue-600 text-white rounded">
        Start Camera
      </button>
      <video ref={videoRef} className="rounded w-full" />

      <button onClick={snapFrame} className="px-4 py-2 bg-green-600 text-white rounded">
        Capture & Identify
      </button>

      <canvas ref={canvasRef} className="hidden" />

      {result && <div className="text-lg font-semibold mt-2">🎣 {result}</div>}
    </div>
  );
}
