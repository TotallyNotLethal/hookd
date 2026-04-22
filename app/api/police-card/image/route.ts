import { NextRequest, NextResponse } from "next/server";
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

function escapeSvgText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

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

function renderValueLines(value: string): string {
  const safeLines = wrapText(value).map((line) => escapeSvgText(line));
  return safeLines
    .map((line, index) => `<tspan x="370" dy="${index === 0 ? 0 : 34}">${line}</tspan>`)
    .join("");
}

function buildCardSvg(data: PoliceCardData): string {
  const rows = policeCardFieldOrder
    .map((field, index) => {
      const y = 260 + index * 95;
      const isAddress = field === "address";
      const rowHeight = isAddress ? 125 : 85;
      const textY = y + 8;

      return `
        <g>
          <text x="110" y="${textY}" font-size="36" font-weight="700" fill="#0f2f6b" font-family="Arial, sans-serif">${policeCardLabels[field]}:</text>
          <text x="370" y="${textY}" font-size="34" fill="#0f2f6b" font-family="Arial, sans-serif">${renderValueLines(data[field])}</text>
          <line x1="100" y1="${y + rowHeight - 15}" x2="1400" y2="${y + rowHeight - 15}" stroke="#0f2f6b" stroke-opacity="0.45" stroke-width="2" />
        </g>
      `;
    })
    .join("\n");

  return `
    <svg width="${CARD_WIDTH}" height="${CARD_HEIGHT}" viewBox="0 0 ${CARD_WIDTH} ${CARD_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="#f8fafc" />
      <rect x="20" y="20" width="1460" height="860" fill="none" stroke="#0f2f6b" stroke-width="8" rx="24"/>
      <rect x="38" y="38" width="1424" height="824" fill="none" stroke="#12357a" stroke-width="3" rx="18"/>

      <text x="750" y="155" text-anchor="middle" font-size="72" font-weight="700" letter-spacing="8" fill="#0f2f6b" font-family="Arial, sans-serif">POLICE INFORMATION CARD</text>
      <line x1="110" y1="195" x2="1390" y2="195" stroke="#0f2f6b" stroke-width="3" />

      ${rows}
    </svg>
  `;
}

export async function GET(request: NextRequest) {
  try {
    const parsed = fromSearchParams(request.nextUrl.searchParams);
    const data = {
      ...parsed,
      phone: formatPhoneAsText(parsed.phone),
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

    const svgBuffer = Buffer.from(buildCardSvg(data));
    const pngBuffer = await sharp(svgBuffer).png({ compressionLevel: 9 }).toBuffer();

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
