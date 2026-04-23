import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
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
const TITLE_WIDTH = 1280;
const REGULAR_FONT_PATH = path.join(process.cwd(), "assets/fonts/DejaVuSans.ttf");
const BOLD_FONT_PATH = path.join(process.cwd(), "assets/fonts/DejaVuSans-Bold.ttf");
const CONTENT_LEFT = 370;

let cachedRegularFontBase64: string | null = null;
let cachedBoldFontBase64: string | null = null;

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

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

async function getFontsAsBase64() {
  if (!cachedRegularFontBase64) {
    const regularFontBuffer = await readFile(REGULAR_FONT_PATH);
    cachedRegularFontBase64 = regularFontBuffer.toString("base64");
  }

  if (!cachedBoldFontBase64) {
    const boldFontBuffer = await readFile(BOLD_FONT_PATH);
    cachedBoldFontBase64 = boldFontBuffer.toString("base64");
  }

  return {
    regularFontBase64: cachedRegularFontBase64,
    boldFontBase64: cachedBoldFontBase64,
  };
}

function renderMultilineText(lines: string[], x: number, y: number, lineHeight: number, className: string): string {
  return lines
    .map((line, lineIndex) => {
      const escapedLine = escapeXml(line);
      const currentY = y + lineIndex * lineHeight;
      return `<text class="${className}" x="${x}" y="${currentY}">${escapedLine}</text>`;
    })
    .join("\n");
}

function buildCardSvg(data: PoliceCardData, regularFontBase64: string, boldFontBase64: string): string {
  const fieldRows = policeCardFieldOrder
    .map((field, index) => {
      const y = 260 + index * 95;
      const textY = y;
      const label = escapeXml(`${policeCardLabels[field]}:`);
      const wrappedValueLines = wrapText(data[field]).map((line) => line.trim()).filter(Boolean);
      const valueText = renderMultilineText(wrappedValueLines, CONTENT_LEFT, textY, 38, "value");

      return `
        <text class="label" x="110" y="${textY}">${label}</text>
        ${valueText}
      `;
    })
    .join("\n");

  return `
    <svg width="${CARD_WIDTH}" height="${CARD_HEIGHT}" viewBox="0 0 ${CARD_WIDTH} ${CARD_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <style>
          @font-face {
            font-family: "PoliceCardRegular";
            src: url("data:font/ttf;base64,${regularFontBase64}") format("truetype");
          }
          @font-face {
            font-family: "PoliceCardBold";
            src: url("data:font/ttf;base64,${boldFontBase64}") format("truetype");
          }
          text {
            fill: #111827;
            dominant-baseline: hanging;
            text-rendering: geometricPrecision;
          }
          .title {
            font-family: "PoliceCardBold", "DejaVu Sans", sans-serif;
            font-size: 72px;
          }
          .label {
            font-family: "PoliceCardBold", "DejaVu Sans", sans-serif;
            font-size: 36px;
          }
          .value {
            font-family: "PoliceCardRegular", "DejaVu Sans", sans-serif;
            font-size: 34px;
          }
        </style>
      </defs>
      ${buildCardBackgroundSvg()}
      <text class="title" x="${TITLE_LEFT}" y="90" textLength="${TITLE_WIDTH}" lengthAdjust="spacingAndGlyphs">POLICE INFORMATION CARD</text>
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

    const { regularFontBase64, boldFontBase64 } = await getFontsAsBase64();
    const cardSvg = buildCardSvg(data, regularFontBase64, boldFontBase64);
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
