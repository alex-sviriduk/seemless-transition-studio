import { CATALOG } from "../dist/catalog.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
test("bundled catalog has unique identities and redistributable attribution licenses", () => {
  assert.equal(CATALOG.length, 22);
  assert.equal(new Set(CATALOG.map((t) => t.id)).size, 22);
  for (const t of CATALOG) {
    assert.ok(t.title && t.artist && t.genre);
    assert.match(
      t.licenseUrl,
      /^https:\/\/creativecommons.org\/licenses\/by\//,
    );
    assert.match(t.sourceUrl, /^https:\/\/freemusicarchive.org\//);
    assert.match(t.audioUrl, /^\.\/music\/\d{6}\.mp3$/);
    assert.equal(t.catalog, true);
  }
});
test("every bundled excerpt matches its recorded SHA-256", async () => {
  for (const t of CATALOG) {
    const b = await readFile(new URL("../dist/" + t.audioUrl, import.meta.url));
    assert.equal(createHash("sha256").update(b).digest("hex"), t.sha256, t.id);
    assert.ok(b.length > 100000 && b.length < 2000000);
  }
});
