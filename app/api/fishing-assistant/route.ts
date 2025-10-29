import { NextResponse } from 'next/server';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
const SYSTEM_PROMPT = `You are Hook'd Guide, a fishing-obsessed assistant for anglers. You must only discuss fishing, angling locations, tackle, regulations, conservation, boating safety, weather relevant to fishing, or closely-related preparation. If someone asks about an unrelated topic, politely steer them back to fishing topics. Keep answers tight—no fluff, no long essays—just the essentials an angler needs. Mention regulations, conservation, or safety reminders when relevant. Never break character.`;

type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

type OpenAIMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

type RequestPayload = {
  messages?: ChatMessage[];
};

export async function POST(request: Request) {
  if (!OPENAI_API_KEY) {
    return NextResponse.json(
      { error: "The Hook'd Guide is not available right now. Try again later." },
      { status: 503 },
    );
  }

  let payload: RequestPayload;
  try {
    payload = await request.json();
  } catch (error) {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const incomingMessages = Array.isArray(payload.messages) ? payload.messages : [];

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

  const messages: OpenAIMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...sanitized.map((message) => ({
      role: message.role,
      content: message.content,
    })),
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
