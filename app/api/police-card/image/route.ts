import { NextRequest, NextResponse } from "next/server";
import sharp, { OverlayOptions } from "sharp";

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
    <svg width="${CARD_WIDTH}" height="${CARD_HEIGHT}" viewBox="0 0 ${CARD_WIDTH} ${CARD_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
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
    </svg>
  `;
}

function createTextOverlay(text: string, font: string, left: number, top: number, width?: number): OverlayOptions {
  return {
    input: {
      text: {
        text,
        font,
        rgba: true,
        dpi: 300,
        ...(width ? { width } : {}),
      },
    },
    left,
    top,
  };
}

function buildTextOverlays(data: PoliceCardData): OverlayOptions[] {
  const overlays: OverlayOptions[] = [
    createTextOverlay("POLICE INFORMATION CARD", "Arial Bold 72", TITLE_LEFT, 90, TITLE_WIDTH),
  ];

  for (const [index, field] of policeCardFieldOrder.entries()) {
    const y = 260 + index * 95;
    const textY = y - 30;

    overlays.push(createTextOverlay(`${policeCardLabels[field]}:`, "Arial Bold 36", 110, textY));

    const wrappedValue = wrapText(data[field]).join("\n");
    overlays.push(createTextOverlay(wrappedValue, "Arial 34", 370, textY, 970));
  }

  return overlays;
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

    const baseCardBuffer = await sharp(Buffer.from(buildCardBackgroundSvg())).png().toBuffer();
    const pngBuffer = await sharp(baseCardBuffer).composite(buildTextOverlays(data)).png({ compressionLevel: 9 }).toBuffer();

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
