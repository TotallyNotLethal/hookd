import { NextResponse } from "next/server";
import * as cheerio from "cheerio";

type ScrapedPart = {
  label: string;
  note: string;
  page?: string;
};

type ManualslibResponse = {
  title: string;
  summary: string;
  parts: ScrapedPart[];
  modelUrl?: string;
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

const parseManualslib = (html: string): ManualslibResponse => {
  const $ = cheerio.load(html);
  const title = extractTitle($);
  const summary = extractSummary($);
  const parts = extractParts($);

  return { title, summary, parts };
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
    const parsed = parseManualslib(html);

    return NextResponse.json(parsed);
  } catch (error) {
    console.error("Manualslib scrape failed", error);
    return NextResponse.json(
      { error: "Failed to fetch or parse the Manualslib page." },
      { status: 500 }
    );
  }
}
