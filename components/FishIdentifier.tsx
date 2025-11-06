"use client";

import { useState, useRef, useEffect } from "react";
import * as ort from "onnxruntime-web";

export default function FishIdentifier() {
  const [detector, setDetector] = useState<any>(null);
  const [classifier, setClassifier] = useState<any>(null);
  const [labels, setLabels] = useState<string[]>([]);
  const [result, setResult] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    (async () => {
      setDetector(await ort.InferenceSession.create("/models/fish_detector.onnx"));
      setClassifier(await ort.InferenceSession.create("/models/fish_classifier.onnx"));
      setLabels(await (await fetch("/models/fish_classifier_labels.json")).json());
    })();
  }, []);

  // Converts HTMLImage/Canvas to Tensor
  function imageToTensor(imageData: ImageData) {
    const { data, width, height } = imageData;
    const float = new Float32Array(width * height * 3);
    for (let i = 0; i < width * height; i++) {
      float[i * 3 + 0] = data[i * 4 + 0] / 255;
      float[i * 3 + 1] = data[i * 4 + 1] / 255;
      float[i * 3 + 2] = data[i * 4 + 2] / 255;
    }
    return new ort.Tensor("float32", float, [1, 3, height, width]);
  }

  async function identifyImage(img: HTMLImageElement) {
    if (!detector || !classifier) return;

    // Draw to canvas so we can crop
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    canvas.width = img.width;
    canvas.height = img.height;
    ctx.drawImage(img, 0, 0);

    // Run detection
    const resized = ctx.getImageData(0, 0, img.width, img.height);
    const tensor = imageToTensor(resized);
    const detOut = await detector.run({ images: tensor });

    // Extract bounding box
    const boxes = detOut["output0"].data;
    if (!boxes.length) return setResult("No fish detected");

    const x1 = boxes[0];
    const y1 = boxes[1];
    const x2 = boxes[2];
    const y2 = boxes[3];

    const crop = ctx.getImageData(x1, y1, x2 - x1, y2 - y1);
    const cropCanvas = document.createElement("canvas");
    cropCanvas.width = 224;
    cropCanvas.height = 224;
    cropCanvas.getContext("2d")!.putImageData(crop, 0, 0);

    const cropData = cropCanvas.getContext("2d")!.getImageData(0, 0, 224, 224);
    const cropTensor = imageToTensor(cropData);
    const clsOut = await classifier.run({ images: cropTensor });

    const probs = clsOut["output0"].data;
    const maxIndex = probs.indexOf(Math.max(...probs));

    setResult(`${labels[maxIndex]} (${(probs[maxIndex] * 100).toFixed(1)}%)`);
  }

  async function startCamera() {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    videoRef.current!.srcObject = stream;
    videoRef.current!.play();
  }

  function captureFrame() {
    const video = videoRef.current!;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0);
    const img = new Image();
    img.src = canvas.toDataURL();
    img.onload = () => identifyImage(img);
  }

  return (
    <div className="p-4 space-y-4">
      <h2 className="text-xl font-bold">Fish Identifier</h2>

      <input
        type="file"
        accept="image/*"
        onChange={(e) => {
          const img = new Image();
          img.src = URL.createObjectURL(e.target.files![0]);
          img.onload = () => identifyImage(img);
        }}
      />

      <button onClick={startCamera} className="px-4 py-2 bg-blue-600 text-white rounded">
        Start Camera
      </button>

      <video ref={videoRef} className="w-full rounded" />

      <button onClick={captureFrame} className="px-4 py-2 bg-green-600 text-white rounded">
        Capture & Identify
      </button>

      <canvas ref={canvasRef} className="hidden" />

      {result && (
        <div className="text-lg font-semibold mt-2">
          🎣 {result}
        </div>
      )}
    </div>
  );
}
