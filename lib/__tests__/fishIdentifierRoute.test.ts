import { strict as assert } from "node:assert";
import test from "node:test";

import { POST } from "@/app/api/fish-id/route";

type FishIdTestHooks = {
  setClassifierFactory: (factory?: () => Promise<(image: unknown) => Promise<unknown>>) => void;
  setImageReader: (reader?: (buffer: Buffer, mimeType?: string) => Promise<unknown>) => void;
};

declare global {
  interface GlobalThis {
    __fishIdTestHooks?: FishIdTestHooks;
  }
}

function getHooks(): FishIdTestHooks {
  const hooks = globalThis.__fishIdTestHooks;
  if (!hooks) {
    throw new Error("Fish ID test hooks are unavailable.");
  }
  return hooks;
}

const GREEN_PNG = "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAFElEQVR4nGNk2GLDgA0wYRUdtBIAwGwBALtio2AAAAAASUVORK5CYII=";
const GREY_PNG = "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAFElEQVR4nGOsqKhgwAaYsIoOWgkAHYcBeHFoDCsAAAAASUVORK5CYII=";

function buildFormRequest(base64Image: string, filename: string) {
  const file = new File([Buffer.from(base64Image, "base64")], filename, {
    type: "image/png",
  });
  const formData = new FormData();
  formData.append("file", file);
  return new Request("http://localhost/api/fish-id", {
    method: "POST",
    body: formData,
  });
}

test("POST returns ranked predictions for recognizable images", async () => {
  const mockImage = Symbol("image");
  const hooks = getHooks();
  hooks.setImageReader(async () => mockImage);
  hooks.setClassifierFactory(async () => async () => [
    { label: "largemouth_bass", score: 0.82 },
    { label: "bluegill", score: 0.14 },
    { label: "tench", score: 0.04 },
  ]);

  try {
    const request = buildFormRequest(GREEN_PNG, "green.png");
    const response = await POST(request);
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.ok(Array.isArray(payload.predictions));
    assert.equal(payload.predictions.length, 3);
    assert.equal(payload.lowConfidence, false);
    assert.equal(payload.predictions[0].species, "Largemouth Bass");
    assert(payload.predictions[0].confidence > payload.predictions[1].confidence);
  } finally {
    hooks.setClassifierFactory();
    hooks.setImageReader();
  }
});

test("POST flags low-confidence predictions when top score is weak", async () => {
  const mockImage = Symbol("image");
  const hooks = getHooks();
  hooks.setImageReader(async () => mockImage);
  hooks.setClassifierFactory(async () => async () => [
    { label: "crappie", score: 0.4 },
    { label: "bluegill", score: 0.38 },
    { label: "largemouth bass", score: 0.22 },
  ]);

  try {
    const request = buildFormRequest(GREY_PNG, "grey.png");
    const response = await POST(request);
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.lowConfidence, true);
    assert.ok(typeof payload.note === "string" && payload.note.length > 0);
    assert.equal(payload.predictions.length, 3);
    assert.equal(payload.predictions[0].species, "Crappie");
  } finally {
    hooks.setClassifierFactory();
    hooks.setImageReader();
  }
});

test("POST surfaces decode errors for unsupported payloads", async () => {
  const hooks = getHooks();
  hooks.setImageReader(async () => {
    throw new Error("decode failure");
  });

  const formData = new FormData();
  const bogusFile = new File([Buffer.from("not-an-image", "utf8")], "bogus.png", {
    type: "image/png",
  });
  formData.append("file", bogusFile);
  const request = new Request("http://localhost/api/fish-id", {
    method: "POST",
    body: formData,
  });

  const originalConsoleError = console.error;
  console.error = () => {};
  try {
    const response = await POST(request);
    assert.equal(response.status, 422);
    const payload = await response.json();
    assert.deepEqual(payload, {
      error: "We couldn't process that photo. Try uploading a different image.",
    });
  } finally {
    console.error = originalConsoleError;
    hooks.setImageReader();
    hooks.setClassifierFactory();
  }
});

test("POST returns a gateway error when the classifier fails", async () => {
  const hooks = getHooks();
  hooks.setImageReader(async () => Symbol("image"));
  hooks.setClassifierFactory(async () => async () => {
    throw new Error("runtime failure");
  });

  const request = buildFormRequest(GREEN_PNG, "green.png");

  const originalConsoleError = console.error;
  console.error = () => {};
  try {
    const response = await POST(request);
    assert.equal(response.status, 502);
    const payload = await response.json();
    assert.deepEqual(payload, {
      error: "The classifier is temporarily unavailable. Please try again soon.",
    });
  } finally {
    console.error = originalConsoleError;
    hooks.setClassifierFactory();
    hooks.setImageReader();
  }
});
