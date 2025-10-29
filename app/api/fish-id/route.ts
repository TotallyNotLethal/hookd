import { NextResponse } from "next/server";
import { RawImage, pipeline } from "@xenova/transformers";

declare global {
  interface GlobalThis {
    __fishIdTestHooks?: {
      setClassifierFactory: (factory?: () => Promise<ImageClassifier>) => void;
      setImageReader: (reader?: (buffer: Buffer, mimeType?: string) => Promise<unknown>) => void;
    };
  }
}

export const runtime = "nodejs";

type SpeciesMetadata = {
  species: string;
  tips?: string;
};

type ClassifierPrediction = SpeciesMetadata & {
  confidence: number;
  label: string;
};

class ImageDecodeError extends Error {}
class ClassifierLoadError extends Error {}
class ClassifierExecutionError extends Error {}

type ImageClassifier = (
  image: unknown,
  options?: { topk?: number },
) => Promise<Array<{ label: string; score: number }>>;

const MODEL_ID = "Xenova/vit-base-patch16-224";
const DEFAULT_TOPK = 5;
const LOW_CONFIDENCE_THRESHOLD = 0.55;

const KNOWN_SPECIES: Array<{ pattern: RegExp; metadata: SpeciesMetadata }> = [
  {
    pattern: /largemouth bass/i,
    metadata: {
      species: "Largemouth Bass",
      tips: "Pitch a jig to cover or slow-roll a spinnerbait along weed edges during low light.",
    },
  },
  {
    pattern: /smallmouth bass/i,
    metadata: {
      species: "Smallmouth Bass",
      tips: "Drag a green pumpkin tube across rocky points or throw a jerkbait across current seams.",
    },
  },
  {
    pattern: /bluegill|sunfish/i,
    metadata: {
      species: "Bluegill",
      tips: "Suspend a small worm or cricket under a float near shaded docks and lily pads.",
    },
  },
  {
    pattern: /crappie/i,
    metadata: {
      species: "Crappie",
      tips: "Slowly vertical jig a 1/16 oz tube over brush piles and pause to let the school reset.",
    },
  },
  {
    pattern: /catfish|channel cat/i,
    metadata: {
      species: "Channel Catfish",
      tips: "Fan-cast cut bait on a slip sinker rig along channel swings after sunset for steady action.",
    },
  },
  {
    pattern: /salmon/i,
    metadata: {
      species: "Salmon",
      tips: "Match the hatch with spoons or spinners in faster water and keep tension steady during the run.",
    },
  },
  {
    pattern: /trout/i,
    metadata: {
      species: "Trout",
      tips: "Dead-drift a small nymph through riffles or cast inline spinners to seams at dawn.",
    },
  },
];

let classifierPromise: Promise<ImageClassifier> | null = null;

async function defaultClassifierFactory(): Promise<ImageClassifier> {
  if (!classifierPromise) {
    classifierPromise = pipeline("image-classification", MODEL_ID, {
      quantized: true,
    }) as Promise<ImageClassifier>;
  }
  return classifierPromise;
}

let loadClassifier: () => Promise<ImageClassifier> = defaultClassifierFactory;

async function defaultImageReader(buffer: Buffer, mimeType?: string): Promise<unknown> {
  const blob = new Blob([buffer], { type: mimeType ?? "application/octet-stream" });
  return RawImage.fromBlob(blob);
}

let readImage: (buffer: Buffer, mimeType?: string) => Promise<unknown> = defaultImageReader;

function normalizeLabel(label: string): string {
  return label.replace(/_/g, " ").split(",")[0]?.trim() ?? label;
}

function enrichPrediction(label: string): SpeciesMetadata {
  const normalized = normalizeLabel(label);
  for (const entry of KNOWN_SPECIES) {
    if (entry.pattern.test(normalized)) {
      return entry.metadata;
    }
  }
  return { species: normalized.charAt(0).toUpperCase() + normalized.slice(1) };
}

async function classifyImage(buffer: Buffer, mimeType?: string): Promise<ClassifierPrediction[]> {
  let image: unknown;
  try {
    image = await readImage(buffer, mimeType);
  } catch (error) {
    throw new ImageDecodeError((error as Error)?.message ?? "Unable to decode image.");
  }

  let classifier: ImageClassifier;
  try {
    classifier = await loadClassifier();
  } catch (error) {
    throw new ClassifierLoadError((error as Error)?.message ?? "Unable to load classifier.");
  }

  let results: Array<{ label: string; score: number }>;
  try {
    results = await classifier(image, { topk: DEFAULT_TOPK });
  } catch (error) {
    throw new ClassifierExecutionError((error as Error)?.message ?? "Classifier inference failed.");
  }

  if (!Array.isArray(results) || results.length === 0) {
    throw new ClassifierExecutionError("Classifier returned no predictions.");
  }

  return results
    .filter((result) => Number.isFinite(result.score) && typeof result.label === "string")
    .map((result) => {
      const metadata = enrichPrediction(result.label);
      return {
        ...metadata,
        label: normalizeLabel(result.label),
        confidence: Math.max(0, Math.min(1, Number(result.score))),
      };
    })
    .sort((a, b) => b.confidence - a.confidence);
}

function setClassifierFactory(factory?: () => Promise<ImageClassifier>) {
  classifierPromise = null;
  loadClassifier = factory ?? defaultClassifierFactory;
}

function setImageReader(reader?: (buffer: Buffer, mimeType?: string) => Promise<unknown>) {
  readImage = reader ?? defaultImageReader;
}

if (process.env.NODE_ENV !== "production") {
  globalThis.__fishIdTestHooks = {
    setClassifierFactory,
    setImageReader,
  };
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
    return NextResponse.json(
      { error: "Unsupported file type. Please upload a PNG or JPG photo." },
      { status: 415 },
    );
  }

  let imageBuffer: Buffer;
  try {
    const arrayBuffer = await file.arrayBuffer();
    imageBuffer = Buffer.from(arrayBuffer);
  } catch (error) {
    return NextResponse.json({ error: "Unable to read uploaded file bytes." }, { status: 400 });
  }

  let predictions: ClassifierPrediction[];
  try {
    predictions = await classifyImage(imageBuffer, file.type);
  } catch (error) {
    console.error("Fish classifier error", error);
    if (error instanceof ImageDecodeError) {
      return NextResponse.json(
        { error: "We couldn't process that photo. Try uploading a different image." },
        { status: 422 },
      );
    }

    return NextResponse.json(
      { error: "The classifier is temporarily unavailable. Please try again soon." },
      { status: 502 },
    );
  }

  const topPrediction = predictions[0];
  const lowConfidence = !topPrediction || topPrediction.confidence < LOW_CONFIDENCE_THRESHOLD;

  return NextResponse.json({
    predictions,
    lowConfidence,
    note: lowConfidence
      ? "Confidence is low—try a brighter profile photo or a side profile so the classifier can lock on."
      : undefined,
  });
}

export async function GET() {
  return NextResponse.json({
    message: "Upload a fish photo via POST multipart/form-data with field name 'file'.",
  });
}
