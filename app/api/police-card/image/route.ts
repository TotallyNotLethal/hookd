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

const CARD_WIDTH = 1800;
const CARD_HEIGHT = 1120;
const REGULAR_FONT_PATH = path.join(process.cwd(), "assets/fonts/DejaVuSans.ttf");
const BOLD_FONT_PATH = path.join(process.cwd(), "assets/fonts/DejaVuSans-Bold.ttf");
const CARD_TEXT_COLOR = "#0b2558";

type LoadedFont = opentype.Font;

let cachedRegularFont: LoadedFont | null = null;
let cachedBoldFont: LoadedFont | null = null;

function wrapText(value: string, maxLength = 72): string[] {
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

  return lines.slice(0, 2);
}

function enforceEnglishAscii(value: string): string {
  return value.replace(/[^ -~]/g, "").trim();
}

function buildCardBackgroundSvg(): string {
  const rows = policeCardFieldOrder
    .map((field, index) => {
      const y = 415 + index * 110;
      const rightEdge = 1720;
      const iconY = y - 48;

      return `
        <polygon points="86,${iconY} 180,${iconY} 197,${iconY + 28} 180,${iconY + 56} 86,${iconY + 56}" fill="#07295f" />
        <circle cx="116" cy="${iconY + 28}" r="12" fill="#f8fbff" />
        <line x1="355" y1="${y}" x2="${rightEdge}" y2="${y}" stroke="#5e6b81" stroke-opacity="0.55" stroke-width="3" />
      `;
    })
    .join("\n");

  return `
    <defs>
      <linearGradient id="headerGradient" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="#0d2f6a"/>
        <stop offset="52%" stop-color="#072253"/>
        <stop offset="100%" stop-color="#03173f"/>
      </linearGradient>
      <linearGradient id="footerGradient" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="#0d2f6a"/>
        <stop offset="52%" stop-color="#072253"/>
        <stop offset="100%" stop-color="#03173f"/>
      </linearGradient>
      <radialGradient id="watermark" cx="50%" cy="50%" r="55%">
        <stop offset="0%" stop-color="#cfd5df" stop-opacity="0.22"/>
        <stop offset="100%" stop-color="#cfd5df" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="100%" height="100%" fill="#011845" />
    <rect x="18" y="18" width="1764" height="1084" fill="#f4f7fb" stroke="#d9dee8" stroke-width="9" rx="52"/>
    <rect x="27" y="27" width="1746" height="1066" fill="none" stroke="#e8edf5" stroke-width="3" rx="46"/>
    <rect x="27" y="27" width="1746" height="305" fill="url(#headerGradient)" rx="42"/>
    <line x1="355" y1="84" x2="1708" y2="84" stroke="#d6deed" stroke-width="2" opacity="0.8"/>
    <line x1="355" y1="246" x2="1708" y2="246" stroke="#d6deed" stroke-width="2" opacity="0.8"/>

    <rect x="76" y="68" width="186" height="186" fill="#072258" stroke="#d6deed" stroke-width="4" rx="30"/>
    <polygon points="168,102 183,132 216,137 192,160 197,193 168,178 139,193 144,160 120,137 153,132" fill="#e9edf6"/>

    <text x="915" y="295" text-anchor="middle" fill="#dbe4f2" font-size="44" font-family="Arial" letter-spacing="18">* * * OHIO * * *</text>

    <rect x="1112" y="410" width="560" height="520" fill="url(#watermark)"/>

    ${rows}

    <rect x="27" y="1037" width="1746" height="56" fill="url(#footerGradient)"/>
    <polygon points="804,1030 996,1030 1034,1071 960,1094 840,1094 766,1071" fill="#dfe4ee" stroke="#b4bfcd" stroke-width="3"/>
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

function renderTextPath(text: string, font: LoadedFont, x: number, y: number, size: number, fill = CARD_TEXT_COLOR): string {
  const normalizedText = text.trim();
  if (!normalizedText) {
    return "";
  }

  const pathData = font.getPath(normalizedText, x, y, size).toPathData(2);
  return `<path fill="${fill}" d="${pathData}" />`;
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
  const titlePath = renderTextPath("POLICE INFORMATION CARD", boldFont, 350, 180, 92, "#eef3fb");

  const fieldRows = policeCardFieldOrder
    .map((field, index) => {
      const y = 415 + index * 110;
      const labelPath = renderTextPath(`${policeCardLabels[field]}:`, boldFont, 205, y - 18, 55);
      const wrappedValueLines = wrapText(data[field]).map((line) => line.trim()).filter(Boolean);
      const valuePath = renderMultilineText(wrappedValueLines, regularFont, 365, y - 62, 45, 50);

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
