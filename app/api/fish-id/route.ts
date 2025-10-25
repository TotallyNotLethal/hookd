import { NextRequest, NextResponse } from "next/server";

const heuristics: { keyword: RegExp; species: string; confidence: number; tips: string }[] = [
  {
    keyword: /bass|largemouth|smallmouth/i,
    species: "Largemouth Bass",
    confidence: 0.82,
    tips: "Focus on docks and vegetation with texas-rigged plastics in low light.",
  },
  {
    keyword: /cat|whisker/i,
    species: "Channel Catfish",
    confidence: 0.76,
    tips: "Fresh cut bait on slip sinker rigs draws the most consistent bites.",
  },
  {
    keyword: /crappie|panfish/i,
    species: "Black Crappie",
    confidence: 0.74,
    tips: "Slowly swim 1/16 oz jigs around submerged brush or docks.",
  },
];

export async function POST(request: NextRequest) {
  const data = await request.formData();
  const file = data.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing image upload." }, { status: 400 });
  }

  const filename = file.name;
  const match = heuristics.find((rule) => rule.keyword.test(filename));

  if (!match) {
    return NextResponse.json({
      species: "Unknown",
      confidence: 0.45,
      tips: "Try snapping a clearer profile photo of the fish for better results.",
    });
  }

  return NextResponse.json({
    species: match.species,
    confidence: match.confidence,
    tips: match.tips,
  });
}

export async function GET() {
  return NextResponse.json({
    message: "Upload a fish photo via POST multipart/form-data with field name 'file'.",
  });
}
