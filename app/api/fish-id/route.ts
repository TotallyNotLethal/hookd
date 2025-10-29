import { NextResponse } from "next/server";
import * as tf from "@tensorflow/tfjs-node";

export const runtime = "nodejs";

type SpeciesMetadata = {
  species: string;
  tips: string;
};

type ClassifierPrediction = SpeciesMetadata & {
  confidence: number;
};

const SPECIES: SpeciesMetadata[] = [
  {
    species: "Largemouth Bass",
    tips: "Work a slow-rolled spinnerbait through submerged grass or pitch a jig to timber transitions.",
  },
  {
    species: "Channel Catfish",
    tips: "Set a slip-sinker rig with fresh cut shad just off the channel ledge at dusk for consistent bites.",
  },
  {
    species: "Black Crappie",
    tips: "Target shaded docks with 1/16 oz tube jigs and pause often to let the school regroup.",
  },
];

const CLASSIFIER_WEIGHTS = tf.tensor2d(
  [
    -0.4, 0.9, 1.4,
    1.5, 0.6, 0.4,
    0.2, 0.6, -1.3,
  ],
  [3, SPECIES.length],
);

const CLASSIFIER_BIASES = tf.tensor1d([-0.2, -0.5, 0.2]);

const LOW_CONFIDENCE_THRESHOLD = 0.5;

function runClassifier(imageBuffer: Buffer): number[] {
  const probabilities = Array.from(
    tf.tidy(() => {
      const decoded = tf.node.decodeImage(imageBuffer, 3);
      if (decoded.shape.length !== 3 || decoded.shape[2] !== 3) {
        decoded.dispose();
        throw new Error("Image must contain RGB channels.");
      }
      const resized = tf.image.resizeBilinear(decoded, [64, 64], true);
      const normalized = resized.toFloat().div(255);
      const channelMeans = normalized.mean([0, 1]);
      const logits = channelMeans.reshape([1, 3]).matMul(CLASSIFIER_WEIGHTS).add(CLASSIFIER_BIASES);
      const softmax = tf.softmax(logits);
      return softmax.dataSync();
    }),
  );

  if (probabilities.length !== SPECIES.length || probabilities.some((value) => !Number.isFinite(value))) {
    throw new Error("Classifier returned invalid probabilities.");
  }

  return probabilities;
}

export async function POST(request: Request) {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch (error) {
    return NextResponse.json({ error: "Malformed multipart form data." }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing image upload." }, { status: 400 });
  }

  if (file.size === 0) {
    return NextResponse.json({ error: "The uploaded file is empty." }, { status: 400 });
  }

  if (file.type && !file.type.startsWith("image/")) {
    return NextResponse.json({ error: "Unsupported file type. Please upload a PNG or JPG photo." }, { status: 415 });
  }

  let imageBuffer: Buffer;
  try {
    const arrayBuffer = await file.arrayBuffer();
    imageBuffer = Buffer.from(arrayBuffer);
  } catch (error) {
    return NextResponse.json({ error: "Unable to read uploaded file bytes." }, { status: 400 });
  }

  let probabilities: number[];
  try {
    probabilities = runClassifier(imageBuffer);
  } catch (error) {
    console.error("Fish classifier error", error);
    return NextResponse.json(
      { error: "We couldn't process that photo. Try uploading a different image." },
      { status: 422 },
    );
  }

  const predictions: ClassifierPrediction[] = SPECIES.map((metadata, index) => ({
    ...metadata,
    confidence: Number(probabilities[index]),
  })).sort((a, b) => b.confidence - a.confidence);

  const topPrediction = predictions[0];
  const lowConfidence = topPrediction ? topPrediction.confidence < LOW_CONFIDENCE_THRESHOLD : true;

  return NextResponse.json({
    predictions,
    lowConfidence,
    note: lowConfidence
      ? "Confidence is low—try a brighter profile photo or a different angle so the classifier can lock on."
      : undefined,
  });
}

export async function GET() {
  return NextResponse.json({
    message: "Upload a fish photo via POST multipart/form-data with field name 'file'.",
  });
}
