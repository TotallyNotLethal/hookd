import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import opentype from "opentype.js";
import sharp from "sharp";

import {
  formatPhoneAsText,
  fromSearchParams,
  hasCompletePoliceCardData,
  policeCardLabels,
  PoliceCardData,
  policeCardFieldOrder,
  validatePoliceCardData,
} from "@/lib/policeCard";

export const runtime = "nodejs";

const CARD_WIDTH = 1500;
const CARD_HEIGHT = 900;
const TITLE_LEFT = 110;
const REGULAR_FONT_PATH = path.join(process.cwd(), "assets/fonts/DejaVuSans.ttf");
const BOLD_FONT_PATH = path.join(process.cwd(), "assets/fonts/DejaVuSans-Bold.ttf");
const CONTENT_LEFT = 430;
const CARD_TEXT_COLOR = "#111827";

type LoadedFont = opentype.Font;

let cachedRegularFont: LoadedFont | null = null;
let cachedBoldFont: LoadedFont | null = null;

function wrapText(value: string, maxLength = 54): string[] {
  const words = value.split(" ");
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    const candidate = `${currentLine} ${word}`.trim();
    if (candidate.length > maxLength && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = candidate;
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines.slice(0, 3);
}

function enforceEnglishAscii(value: string): string {
  return value.replace(/[^\x20-\x7E]/g, "").trim();
}

function buildCardBackgroundSvg(): string {
  return `
    <rect width="100%" height="100%" fill="#f8fafc" />
    <rect x="20" y="20" width="1460" height="860" fill="none" stroke="#0f2f6b" stroke-width="8" rx="24"/>
    <rect x="38" y="38" width="1424" height="824" fill="none" stroke="#12357a" stroke-width="3" rx="18"/>
    <line x1="110" y1="195" x2="1390" y2="195" stroke="#0f2f6b" stroke-width="3" />
    ${policeCardFieldOrder
      .map((field, index) => {
        const y = 260 + index * 95;
        const rowHeight = field === "address" ? 125 : 85;
        return `<line x1="100" y1="${y + rowHeight - 15}" x2="1400" y2="${y + rowHeight - 15}" stroke="#0f2f6b" stroke-opacity="0.45" stroke-width="2" />`;
      })
      .join("\n")}
  `;
}

async function loadFont(fontPath: string): Promise<LoadedFont> {
  const fontBuffer = await readFile(fontPath);
  const arrayBuffer = fontBuffer.buffer.slice(fontBuffer.byteOffset, fontBuffer.byteOffset + fontBuffer.byteLength);
  return opentype.parse(arrayBuffer);
}

async function getFonts() {
  if (!cachedRegularFont) {
    cachedRegularFont = await loadFont(REGULAR_FONT_PATH);
  }

  if (!cachedBoldFont) {
    cachedBoldFont = await loadFont(BOLD_FONT_PATH);
  }

  return {
    regularFont: cachedRegularFont,
    boldFont: cachedBoldFont,
  };
}

function renderTextPath(text: string, font: LoadedFont, x: number, y: number, size: number): string {
  const normalizedText = text.trim();
  if (!normalizedText) {
    return "";
  }

  const pathData = font.getPath(normalizedText, x, y, size).toPathData(2);
  return `<path fill="${CARD_TEXT_COLOR}" d="${pathData}" />`;
}

function renderMultilineText(lines: string[], font: LoadedFont, x: number, y: number, size: number, lineHeight: number): string {
  return lines
    .map((line, lineIndex) => {
      const baselineY = y + size + lineIndex * lineHeight;
      return renderTextPath(line, font, x, baselineY, size);
    })
    .filter(Boolean)
    .join("\n");
}

function buildCardSvg(data: PoliceCardData, regularFont: LoadedFont, boldFont: LoadedFont): string {
  const titlePath = renderTextPath("POLICE INFORMATION CARD", boldFont, TITLE_LEFT, 150, 72);

  const fieldRows = policeCardFieldOrder
    .map((field, index) => {
      const y = 260 + index * 95;
      const textY = y - 8;
      const labelPath = renderTextPath(`${policeCardLabels[field]}:`, boldFont, 110, textY + 36, 36);
      const wrappedValueLines = wrapText(data[field]).map((line) => line.trim()).filter(Boolean);
      const valuePath = renderMultilineText(wrappedValueLines, regularFont, CONTENT_LEFT, textY, 34, 38);

      return `
        ${labelPath}
        ${valuePath}
      `;
    })
    .join("\n");

  return `
    <svg width="${CARD_WIDTH}" height="${CARD_HEIGHT}" viewBox="0 0 ${CARD_WIDTH} ${CARD_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      ${buildCardBackgroundSvg()}
      ${titlePath}
      ${fieldRows}
    </svg>
  `;
}

export async function GET(request: NextRequest) {
  try {
    const parsed = fromSearchParams(request.nextUrl.searchParams);
    const data = {
      department: enforceEnglishAscii(parsed.department),
      officer: enforceEnglishAscii(parsed.officer),
      unit: enforceEnglishAscii(parsed.unit),
      caseNumber: enforceEnglishAscii(parsed.caseNumber),
      phone: enforceEnglishAscii(formatPhoneAsText(parsed.phone)),
      address: enforceEnglishAscii(parsed.address),
    };

    if (!hasCompletePoliceCardData(data)) {
      return NextResponse.json(
        {
          error: "Missing required fields.",
          details: validatePoliceCardData(data),
        },
        { status: 400 },
      );
    }

    const { regularFont, boldFont } = await getFonts();
    const cardSvg = buildCardSvg(data, regularFont, boldFont);
    const pngBuffer = await sharp(Buffer.from(cardSvg)).png({ compressionLevel: 9 }).toBuffer();

    return new NextResponse(pngBuffer, {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Content-Disposition": 'attachment; filename="police-information-card.png"',
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Police card image generation error", error);
    return NextResponse.json(
      { error: "Unable to generate card image at this time. Please try again." },
      { status: 500 },
    );
  }
}
