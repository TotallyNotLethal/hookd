import { NextResponse } from "next/server";
import * as cheerio from "cheerio";
import OpenAI from "openai";

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

type ScrapedPart = {
  label: string;
  note: string;
  page?: string;
  boundingBox?: BoundingBox;
  image?: ReferenceImage;
};

type ManualslibResponse = {
  title: string;
  summary: string;
  parts: ScrapedPart[];
  modelUrl?: string;
  referenceImages?: ReferenceImage[];
};

const userAgent =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";

const cleanText = (text: string) =>
  text
    .replace(/\s+/g, " ")
    .replace(/\s*:\s*/g, ": ")
    .trim();

const extractTitle = ($: cheerio.CheerioAPI) => {
  const selectors = [
    "h1[itemprop='name']",
    "meta[property='og:title']",
    "meta[name='title']",
    "title",
  ];

  for (const selector of selectors) {
    const value = selector.startsWith("meta")
      ? $(selector).attr("content")
      : $(selector).first().text();
    if (value) return cleanText(value);
  }

  return "Manualslib manual";
};

const extractSummary = ($: cheerio.CheerioAPI) => {
  const metaDescription =
    $("meta[property='og:description']").attr("content") ||
    $("meta[name='description']").attr("content");
  if (metaDescription) return cleanText(metaDescription);

  const firstParagraph = $("p").first().text();
  if (firstParagraph) return cleanText(firstParagraph);

  return "Imported from Manualslib. Use the AR controls to highlight sections.";
};

const extractParts = ($: cheerio.CheerioAPI) => {
  const parts: ScrapedPart[] = [];

  const tocSelectors = ["nav.toc a", "#toc a", ".toc a", "ul.toc a"];
  for (const selector of tocSelectors) {
    $(selector).each((_, element) => {
      const link = $(element);
      const label = cleanText(link.text());
      if (!label) return;
      const page = link.attr("data-page") || link.attr("href")?.match(/page=(\d+)/)?.[1];
      parts.push({
        label,
        note: page ? `Table of contents entry (page ${page}).` : "Table of contents entry from Manualslib.",
        page,
      });
    });
    if (parts.length) break;
  }

  if (!parts.length) {
    $("h2, h3, h4").each((index, element) => {
      const label = cleanText($(element).text());
      if (!label) return;
      parts.push({
        label,
        note: `Section heading ${index + 1} from the manual text.`,
      });
    });
  }

  if (!parts.length) {
    $("figure img[alt], img[alt]").each((index, element) => {
      const label = cleanText($(element).attr("alt") ?? "");
      if (!label) return;
      parts.push({
        label,
        note: `Diagram ${index + 1}: ${label}`,
      });
    });
  }

  if (!parts.length) {
    parts.push({
      label: "Manual overview",
      note: "Highlight the main section of this manual.",
    });
  }

  return parts.slice(0, 25);
};

const extractReferenceImages = ($: cheerio.CheerioAPI, baseUrl?: string) => {
  const images: ReferenceImage[] = [];

  const resolveSrc = (src?: string) => {
    if (!src) return undefined;
    try {
      return new URL(src, baseUrl).toString();
    } catch {
      return src;
    }
  };

  const ogImage = $("meta[property='og:image']").attr("content");
  if (ogImage) {
    images.push({ src: resolveSrc(ogImage) ?? ogImage, alt: "Manual cover" });
  }

  $("img").each((index, element) => {
    const src = $(element).attr("data-original") || $(element).attr("src");
    if (!src) return;
    const resolved = resolveSrc(src);
    if (!resolved) return;

    const width = Number($(element).attr("width")) || undefined;
    const height = Number($(element).attr("height")) || undefined;
    const alt = $(element).attr("alt") || undefined;

    images.push({
      src: resolved,
      width,
      height,
      alt,
    });

    if (images.length >= 5) return false;
  });

  return images;
};

const parseManualslib = (html: string, baseUrl?: string): ManualslibResponse => {
  const $ = cheerio.load(html);
  const title = extractTitle($);
  const summary = extractSummary($);
  const parts = extractParts($);
  const referenceImages = extractReferenceImages($, baseUrl);

  return { title, summary, parts, referenceImages };
};

type ModelAnalysis = {
  title?: string;
  summary?: string;
  modelUrl?: string;
  referenceImages?: ReferenceImage[];
  parts?: ScrapedPart[];
};

const buildOpenAiClient = () => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  return new OpenAI({ apiKey });
};

const analyzeWithOpenAI = async (html: string): Promise<ModelAnalysis | null> => {
  const client = buildOpenAiClient();
  if (!client) {
    console.warn("OPENAI_API_KEY not configured; skipping Manualslib analysis");
    return null;
  }

  const trimmedHtml = html.slice(0, 50000);
  try {
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "Extract structured manual data from provided Manualslib HTML. Return JSON with keys: title (string), summary (string), modelUrl (string optional), referenceImages (array of {src, width, height, alt, page}), parts (array of {label, note, page, boundingBox:{x,y,width,height} where numbers are pixel offsets from top-left of the source image, image:{src,width,height,alt,page}}). Prefer real image dimensions if present; keep arrays compact (max 12 parts).",
        },
        {
          role: "user",
          content: `Manualslib HTML (trimmed):\n${trimmedHtml}`,
        },
      ],
      temperature: 0.2,
    });

    const rawContent = completion.choices[0]?.message?.content;
    if (!rawContent) return null;
    const parsed = JSON.parse(rawContent) as ModelAnalysis;
    return parsed;
  } catch (error) {
    console.error("OpenAI Manualslib analysis failed", error);
    return null;
  }
};

const coerceBoundingBox = (box?: BoundingBox): BoundingBox | undefined => {
  if (!box || typeof box.x !== "number" || typeof box.y !== "number") return undefined;
  return {
    x: box.x,
    y: box.y,
    width: typeof box.width === "number" ? box.width : undefined,
    height: typeof box.height === "number" ? box.height : undefined,
  };
};

const coerceImage = (image?: ReferenceImage): ReferenceImage | undefined => {
  if (!image?.src) return undefined;
  return {
    src: image.src,
    width: typeof image.width === "number" ? image.width : undefined,
    height: typeof image.height === "number" ? image.height : undefined,
    alt: image.alt,
    page: image.page,
  };
};

const mergeManualData = (
  fallback: ManualslibResponse,
  modelAnalysis: ModelAnalysis | null
): ManualslibResponse => {
  if (!modelAnalysis) return fallback;

  const mergedParts = (modelAnalysis.parts || fallback.parts || []).map((part, index) => ({
    label: part.label || fallback.parts[index]?.label || `Section ${index + 1}`,
    note:
      part.note ||
      fallback.parts[index]?.note ||
      "Section imported from Manualslib; tap to place the overlay.",
    page: part.page || fallback.parts[index]?.page,
    boundingBox: coerceBoundingBox(part.boundingBox),
    image: coerceImage(part.image),
  }));

  const referenceImages =
    modelAnalysis.referenceImages
      ?.map(coerceImage)
      .filter((image): image is ReferenceImage => Boolean(image)) || fallback.referenceImages;

  return {
    title: modelAnalysis.title || fallback.title,
    summary: modelAnalysis.summary || fallback.summary,
    modelUrl: modelAnalysis.modelUrl || fallback.modelUrl,
    parts: mergedParts.length ? mergedParts.slice(0, 25) : fallback.parts,
    referenceImages,
  };
};

export async function POST(request: Request) {
  try {
    const { url } = (await request.json()) as { url?: string };
    if (!url || !/^https?:\/\/\S+manualslib\.com\//i.test(url)) {
      return NextResponse.json(
        { error: "Provide a valid Manualslib URL to import." },
        { status: 400 }
      );
    }

    const response = await fetch(url, {
      headers: { "User-Agent": userAgent },
      cache: "no-store",
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `Manualslib responded with status ${response.status}.` },
        { status: 502 }
      );
    }

    const html = await response.text();
    const parsed = parseManualslib(html, url);
    const aiAnalysis = await analyzeWithOpenAI(html);
    const merged = mergeManualData(parsed, aiAnalysis);

    return NextResponse.json(merged);
  } catch (error) {
    console.error("Manualslib scrape failed", error);
    return NextResponse.json(
      { error: "Failed to fetch or parse the Manualslib page." },
      { status: 500 }
    );
  }
}
