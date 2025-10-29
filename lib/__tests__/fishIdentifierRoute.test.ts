import { strict as assert } from "node:assert";
import test from "node:test";

import { POST } from "@/app/api/fish-id/route";

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
  const request = buildFormRequest(GREEN_PNG, "green.png");
  const response = await POST(request);
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.ok(Array.isArray(payload.predictions));
  assert.equal(payload.predictions.length, 3);
  assert.equal(payload.lowConfidence, false);
  assert.equal(payload.predictions[0].species, "Largemouth Bass");
  assert(payload.predictions[0].confidence > payload.predictions[1].confidence);
});

test("POST flags low-confidence predictions when candidates tie", async () => {
  const request = buildFormRequest(GREY_PNG, "grey.png");
  const response = await POST(request);
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.lowConfidence, true);
  assert.ok(typeof payload.note === "string" && payload.note.length > 0);
  assert.equal(payload.predictions.length, 3);
});

test("POST surfaces decode errors for unsupported payloads", async () => {
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
  const response = await POST(request);
  console.error = originalConsoleError;
  assert.equal(response.status, 422);
  const payload = await response.json();
  assert.deepEqual(payload, {
    error: "We couldn't process that photo. Try uploading a different image.",
  });
});
