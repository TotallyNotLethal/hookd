import { NextResponse } from 'next/server';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
const SYSTEM_PROMPT = `You are Hook'd Guide, a fishing-obsessed assistant for anglers. You must only discuss fishing, angling locations, tackle, regulations, conservation, boating safety, weather relevant to fishing, or closely-related preparation. If someone asks about an unrelated topic, politely steer them back to fishing topics. When an angler shares a photo, analyze it only to identify fish, coral, tackle, boats, or other fishing-relevant subjects. If the image appears unrelated to fishing, respond by reminding them that you only review fishing content. Keep answers tight—no fluff, no long essays—just the essentials an angler needs. Mention regulations, conservation, or safety reminders when relevant. Never break character.`;

type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

type UserContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

type OpenAIMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string | UserContentPart[];
};

type RequestPayload = {
  messages?: ChatMessage[];
};

const FISHING_KEYWORDS = [
  'fish',
  'fishing',
  'angler',
  'angling',
  'bait',
  'tackle',
  'rig',
  'rigs',
  'setup',
  'setups',
  'gear',
  'rod',
  'reel',
  'boat',
  'boats',
  'boating',
  'kayak',
  'charter',
  'guide',
  'guides',
  'coral',
  'reef',
  'lure',
  'hook',
  'fly',
  'spearfish',
  'salmon',
  'trout',
  'bass',
  'walleye',
  'tarpon',
  'redfish',
  'snook',
  'catfish',
  'panfish',
  'ice fishing',
  'line',
  'leader',
  'knot',
  'tide',
  'current',
  'lake',
  'river',
  'ocean',
  'offshore',
  'inshore',
  'harbor',
  'marina',
  'marine',
  'baitfish',
  'spot',
  'spots',
  'hotspot',
  'hotspots',
  'location',
  'locations',
  'report',
  'reports',
  'forecast',
  'weather',
  'wind',
  'barometer',
  'temperature',
  'regulation',
  'regulations',
  'regs',
  'license',
  'permit',
  'season',
  'seasons',
  'limit',
  'limits',
  'bag limit',
  'bag limits',
  'catch limit',
  'catch limits',
  'conservation',
  'safety',
  'weather window',
  'tip',
  'tips',
];

function isFishingTopic(content: string | undefined) {
  if (!content) return false;
  const normalized = content.toLowerCase();
  return FISHING_KEYWORDS.some((keyword) => normalized.includes(keyword));
}

export async function POST(request: Request) {
  if (!OPENAI_API_KEY) {
    return NextResponse.json(
      { error: "The Hook'd Guide is not available right now. Try again later." },
      { status: 503 },
    );
  }

  const contentType = request.headers.get('content-type') ?? '';
  let payload: RequestPayload | null = null;
  let imageFile: File | null = null;
  let imagePrompt = '';

  if (contentType.includes('multipart/form-data')) {
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch (error) {
      return NextResponse.json({ error: 'Unable to read form data.' }, { status: 400 });
    }

    const messagesField = formData.get('messages');
    if (typeof messagesField !== 'string') {
      return NextResponse.json({ error: 'Missing chat history for the guide.' }, { status: 400 });
    }

    try {
      payload = { messages: JSON.parse(messagesField) };
    } catch (error) {
      return NextResponse.json({ error: 'Invalid chat history payload.' }, { status: 400 });
    }

    const maybeImage = formData.get('image');
    if (maybeImage instanceof File && maybeImage.size > 0) {
      imageFile = maybeImage;
    }

    const promptField = formData.get('imagePrompt');
    if (typeof promptField === 'string') {
      imagePrompt = promptField;
    }
  } else {
    try {
      payload = await request.json();
    } catch (error) {
      return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
    }
  }

  const incomingMessages = Array.isArray(payload?.messages) ? payload?.messages : [];

  const sanitized: ChatMessage[] = incomingMessages
    .filter((item): item is ChatMessage => {
      if (!item || typeof item !== 'object') return false;
      if (item.role !== 'user' && item.role !== 'assistant') return false;
      return typeof item.content === 'string' && item.content.trim().length > 0;
    })
    .slice(-10)
    .map((item) => ({
      role: item.role,
      content: item.content.slice(0, 2000),
    }));

  const fishingFocused =
    sanitized.some((message) => message.role === 'user' && isFishingTopic(message.content)) ||
    Boolean(imageFile);

  if (!fishingFocused) {
    return NextResponse.json(
      {
        error:
          "Hook'd Guide can only chat about fishing topics. Add some fishing context or share a fishing photo and try again.",
      },
      { status: 400 },
    );
  }

  let encodedImage: string | null = null;
  if (imageFile) {
    if (!imageFile.type.startsWith('image/')) {
      return NextResponse.json({ error: 'Only image uploads are supported.' }, { status: 400 });
    }

    if (imageFile.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: 'Fishing photos must be 5MB or smaller.' }, { status: 400 });
    }

    try {
      const arrayBuffer = await imageFile.arrayBuffer();
      const base64 = Buffer.from(arrayBuffer).toString('base64');
      encodedImage = `data:${imageFile.type};base64,${base64}`;
    } catch (error) {
      console.error('Failed to encode fishing guide image upload', error);
      return NextResponse.json({ error: 'We could not read that photo. Try another shot.' }, { status: 422 });
    }
  }

  const messages: OpenAIMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...sanitized.map((message, index, array) => {
      if (index === array.length - 1 && message.role === 'user' && encodedImage) {
        const textContent = imagePrompt || message.content;
        const content: UserContentPart[] = [];
        if (textContent.trim().length > 0) {
          content.push({ type: 'text', text: textContent.slice(0, 2000) });
        }
        content.push({ type: 'image_url', image_url: { url: encodedImage } });
        return {
          role: 'user' as const,
          content,
        };
      }

      return {
        role: message.role,
        content: message.content,
      } as OpenAIMessage;
    }),
  ];

  try {
    const response = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages,
        max_tokens: 320,
        temperature: 0.4,
        presence_penalty: 0,
        frequency_penalty: 0.2,
      }),
    });

    if (!response.ok) {
      let detail = 'Unable to reach the fishing guide right now.';
      try {
        const error = await response.json();
        if (typeof error?.error?.message === 'string') {
          detail = error.error.message;
        }
      } catch (parseError) {
        // ignore parse errors and fall back to default detail
      }
      return NextResponse.json({ error: detail }, { status: 502 });
    }

    const result = await response.json();
    const reply: unknown = result?.choices?.[0]?.message?.content;

    if (typeof reply !== 'string' || reply.trim().length === 0) {
      return NextResponse.json({ error: 'The guide had trouble coming up with tips. Try again.' }, { status: 500 });
    }

    return NextResponse.json({ reply: reply.trim() });
  } catch (error) {
    return NextResponse.json({ error: 'We could not connect to the fishing guide. Try again later.' }, { status: 500 });
  }
}
