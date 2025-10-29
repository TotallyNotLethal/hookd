"use client";

import { ChangeEvent, FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Bot, ImagePlus, Loader2, RefreshCcw, Send, X } from "lucide-react";

import NavBar from "@/components/NavBar";
import { useProAccess } from "@/hooks/useProAccess";

type ChatRole = "user" | "assistant";

type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  imageDataUrl?: string;
};

const INTRO_MESSAGE: ChatMessage = {
  id: "intro",
  role: "assistant",
  content:
    "Hey angler! I\'m Hook\'d Guide, dialed in on fishing spots, seasonal tactics, and regs. Ask about baits, patterns, or trip prep and I\'ll keep it short and sharp.",
};

function createMessageId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function FishingAssistantPage() {
  const { isPro, loading: proLoading, profile } = useProAccess();
  const [messages, setMessages] = useState<ChatMessage[]>([INTRO_MESSAGE]);
  const [input, setInput] = useState("");
  const [attachedImage, setAttachedImage] = useState<File | null>(null);
  const [attachedImagePreview, setAttachedImagePreview] = useState<string | null>(null);
  const [attachedImageName, setAttachedImageName] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollAnchorRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const hasConversation = useMemo(() => messages.length > 0, [messages.length]);

  useEffect(() => {
    if (scrollAnchorRef.current) {
      scrollAnchorRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [messages.length, isSending]);

  const resetConversation = () => {
    setMessages([INTRO_MESSAGE]);
    setInput("");
    setError(null);
    setAttachedImage(null);
    setAttachedImagePreview(null);
    setAttachedImageName(null);
  };

  const clearAttachedImage = () => {
    setAttachedImage(null);
    setAttachedImagePreview(null);
    setAttachedImageName(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleImageSelection = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setError("Only image uploads are supported for the Hook'd Guide.");
      clearAttachedImage();
      return;
    }

    const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
    if (file.size > MAX_FILE_SIZE) {
      setError("Please choose an image under 5MB.");
      clearAttachedImage();
      return;
    }

    setError(null);
    setAttachedImage(file);
    setAttachedImageName(file.name);

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setAttachedImagePreview(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const sendMessage = async () => {
    const trimmed = input.trim();
    if ((trimmed.length === 0 && !attachedImage) || isSending) return;

    const fallbackPrompt = "Please help identify the fishing subject in this photo.";
    const messageContent = trimmed.length > 0 ? trimmed : fallbackPrompt;
    const imageForUpload = attachedImage;
    const imagePreview = attachedImagePreview;

    const userMessage: ChatMessage = {
      id: createMessageId("user"),
      role: "user",
      content: trimmed.length > 0 ? trimmed : "Shared an image for identification.",
      imageDataUrl: imagePreview ?? undefined,
    };

    const nextHistory = [...messages, userMessage];
    setMessages(nextHistory);
    setInput("");
    setAttachedImage(null);
    setAttachedImagePreview(null);
    setAttachedImageName(null);
    setIsSending(true);
    setError(null);

    try {
      let response: Response;

      if (imageForUpload) {
        const formData = new FormData();
        formData.append(
          "messages",
          JSON.stringify(
            nextHistory.map(({ role, content }) => ({
              role,
              content,
            })),
          ),
        );
        formData.append("image", imageForUpload);
        formData.append("imagePrompt", messageContent);
        response = await fetch("/api/fishing-assistant", {
          method: "POST",
          body: formData,
        });
      } else {
        response = await fetch("/api/fishing-assistant", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messages: nextHistory.map(({ role, content }) => ({ role, content })),
          }),
        });
      }

      const data = await response.json();

      if (!response.ok) {
        throw new Error(typeof data?.error === "string" ? data.error : "The guide is taking a break.");
      }

      const assistantMessage: ChatMessage = {
        id: createMessageId("assistant"),
        role: "assistant",
        content: typeof data?.reply === "string" ? data.reply : "I\'m ready with fishing tips whenever you are.",
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong reaching the guide.");
    } finally {
      setIsSending(false);
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void sendMessage();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendMessage();
    }
  };

  return (
    <main>
      <NavBar />
      <section className="container space-y-10 pt-28 pb-16">
        <header className="max-w-3xl space-y-4">
          <p className="text-sm uppercase tracking-[0.3em] text-white/60">Hook&apos;d Pro Tool</p>
          <h1 className="text-3xl font-semibold text-white md:text-4xl">Rapid-fire fishing guidance, tuned for Hook&apos;d</h1>
          <p className="text-white/70">
            Chat with Hook&apos;d Guide for quick bait picks, seasonal patterns, and safety reminders. Every answer stays laser focused
            on fishing so you can plan your next outing without fluff.
          </p>
        </header>

        {proLoading ? (
          <div className="flex items-center gap-3 rounded-3xl border border-white/10 bg-white/5 p-6 text-white/70">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Checking your Hook&apos;d Pro access…</span>
          </div>
        ) : !isPro ? (
          <div className="space-y-4 rounded-3xl border border-amber-400/20 bg-amber-500/10 p-6 text-amber-100">
            <h2 className="text-lg font-semibold">Hook&apos;d Guide is a Pro-only deckhand</h2>
            <p className="text-sm text-amber-100/80">
              Upgrade to Hook&apos;d Pro to unlock the AI fishing guide along with premium map layers, team creation, and advanced
              planning widgets.
            </p>
            <div className="flex flex-wrap gap-3">
              {profile ? (
                <Link href="/profile" className="btn-primary inline-flex items-center gap-2 px-4 py-2 text-sm">
                  Manage membership
                </Link>
              ) : (
                <Link href="/login" className="btn-primary inline-flex items-center gap-2 px-4 py-2 text-sm">
                  Sign in to upgrade
                </Link>
              )}
              <Link
                href="/map"
                className="inline-flex items-center gap-2 rounded-xl border border-amber-300/40 px-4 py-2 text-sm text-amber-100 transition hover:border-amber-200/60 hover:text-amber-50"
              >
                Preview Pro map layers
              </Link>
            </div>
          </div>
        ) : (
          <div className="grid gap-8 lg:grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)]">
            <section className="glass flex h-full flex-col rounded-3xl border border-white/10 bg-white/5 p-6">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-brand-500/20 text-brand-200">
                    <Bot className="h-6 w-6" />
                  </span>
                  <div>
                    <h2 className="text-lg font-semibold text-white">Hook&apos;d Guide</h2>
                    <p className="text-xs uppercase tracking-[0.3em] text-white/60">AI deckhand · Fishing topics only</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={resetConversation}
                  className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs font-medium text-white/80 transition hover:border-white/30 hover:text-white"
                  disabled={isSending || messages.length <= 1}
                >
                  <RefreshCcw className="h-4 w-4" />
                  Reset
                </button>
              </div>

              <div className="flex-1 overflow-hidden">
                <div className="flex h-full flex-col gap-4 overflow-y-auto pr-1">
                  {hasConversation ? (
                    messages.map((message) => (
                      <div
                        key={message.id}
                        className={`max-w-[85%] whitespace-pre-wrap rounded-3xl border px-4 py-3 text-sm leading-relaxed shadow-inner ${
                          message.role === "assistant"
                            ? "self-start border-brand-400/30 bg-brand-500/10 text-brand-50"
                            : "self-end border-white/15 bg-white/10 text-white"
                        }`}
                      >
                        {message.imageDataUrl ? (
                          <div className="mb-2 overflow-hidden rounded-2xl border border-white/10">
                            <img
                              src={message.imageDataUrl}
                              alt="Uploaded fishing reference"
                              className="max-h-56 w-full object-cover"
                            />
                          </div>
                        ) : null}
                        {message.content ? message.content : null}
                      </div>
                    ))
                  ) : (
                    <p className="rounded-3xl border border-white/10 bg-white/5 p-4 text-sm text-white/70">
                      Ask Hook&apos;d Guide anything about fishing spots, tactics, or safety to get started.
                    </p>
                  )}
                  {isSending ? (
                    <div className="flex items-center gap-2 self-start rounded-3xl border border-brand-400/30 bg-brand-500/10 px-4 py-3 text-sm text-brand-100">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Reeling in a tip…</span>
                    </div>
                  ) : null}
                  <div ref={scrollAnchorRef} />
                </div>
              </div>

              <form onSubmit={handleSubmit} className="mt-4 space-y-3">
                <label htmlFor="guide-question" className="sr-only">
                  Ask the Hook&apos;d Guide a fishing question
                </label>
                <textarea
                  id="guide-question"
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask about spring smallmouth, trolling spreads, or boating prep…"
                  className="h-28 w-full resize-none rounded-3xl border border-white/15 bg-slate-950/60 px-4 py-3 text-sm text-white placeholder:text-white/40 focus:border-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-300/40"
                />
                {attachedImagePreview ? (
                  <div className="flex items-center justify-between gap-3 rounded-3xl border border-white/10 bg-white/5 p-3 text-xs text-white/70">
                    <div className="flex items-center gap-3">
                      <span className="inline-flex h-8 w-8 items-center justify-center rounded-2xl bg-brand-500/20 text-brand-200">
                        <ImagePlus className="h-4 w-4" />
                      </span>
                      <div>
                        <p className="font-medium text-white">{attachedImageName ?? "Fishing photo attached"}</p>
                        <p className="text-white/60">Hook&apos;d Guide uses photos for fishing IDs only.</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={clearAttachedImage}
                      className="inline-flex items-center justify-center rounded-full border border-white/20 p-1 text-white/70 transition hover:border-white/40 hover:text-white"
                    >
                      <X className="h-4 w-4" />
                      <span className="sr-only">Remove attached image</span>
                    </button>
                  </div>
                ) : null}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleImageSelection}
                />
                <div className="flex flex-wrap items-center justify-between gap-3">
                  {error ? <p className="text-sm text-rose-300">{error}</p> : <span className="text-xs text-white/40">Shift + Enter for a new line</span>}
                  <button
                    type="submit"
                    className="inline-flex items-center gap-2 rounded-2xl bg-brand-400 px-4 py-2 text-sm font-medium text-slate-950 transition hover:bg-brand-300 disabled:opacity-60"
                    disabled={isSending || (input.trim().length === 0 && !attachedImage)}
                  >
                    {isSending ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Sending
                      </>
                    ) : (
                      <>
                        <Send className="h-4 w-4" />
                        Ask the guide
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-2 rounded-2xl border border-white/15 px-4 py-2 text-sm text-white/80 transition hover:border-white/30 hover:text-white"
                    disabled={isSending}
                  >
                    <ImagePlus className="h-4 w-4" />
                    Add fishing photo
                  </button>
                </div>
              </form>
            </section>

            <aside className="flex flex-col gap-4 rounded-3xl border border-white/10 bg-white/5 p-6 text-sm text-white/70">
              <h3 className="text-base font-semibold text-white">Keep the guide dialed in</h3>
              <ul className="space-y-3">
                <li className="rounded-2xl border border-white/10 bg-white/5 p-3">
                  <p className="font-medium text-white">Stick to fishing-only chat</p>
                  <p className="text-xs text-white/60">Regulations, tackle, watercraft prep, and conservation questions are welcome.</p>
                </li>
                <li className="rounded-2xl border border-white/10 bg-white/5 p-3">
                  <p className="font-medium text-white">Share context</p>
                  <p className="text-xs text-white/60">Include waterbody, season, target species, and any gear details for sharper tips.</p>
                </li>
                <li className="rounded-2xl border border-white/10 bg-white/5 p-3">
                  <p className="font-medium text-white">Stay safe & legal</p>
                  <p className="text-xs text-white/60">The guide will remind you to check local regs and weather—double-check before you launch.</p>
                </li>
              </ul>
            </aside>
          </div>
        )}
      </section>
    </main>
  );
}
