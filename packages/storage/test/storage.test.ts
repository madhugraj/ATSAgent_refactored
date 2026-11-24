/**
 * Pure smoke tests for the @ats/storage server surface.
 *
 * Run: DATABASE_URL=postgres://…/atsagent_test SESSION_SECRET=… bun test packages/storage/test/
 *
 * The S3 SDK is mocked away entirely: `send` throws, so any accidental
 * attempt to reach real object storage fails the test loudly. The local
 * `.local-storage` fallback is exercised against a fresh temp directory
 * (LOCAL_STORAGE_DIR is read at module init, so it is set before the
 * first import of the package).
 */
import { afterAll, describe, expect, mock, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const LOCAL_DIR = mkdtempSync(path.join(tmpdir(), "ats-storage-test-"));
process.env["LOCAL_STORAGE_DIR"] = LOCAL_DIR;

const s3Commands: string[] = [];

mock.module("@aws-sdk/client-s3", () => {
  const record = (name: string) =>
    class {
      constructor(_input: unknown) {
        s3Commands.push(name);
      }
    };
  return {
    S3Client: class {
      async send(_command: unknown): Promise<never> {
        throw new Error("tests must not touch real object storage");
      }
    },
    PutObjectCommand: record("PutObject"),
    GetObjectCommand: record("GetObject"),
    DeleteObjectCommand: record("DeleteObject"),
    ListObjectsV2Command: record("ListObjectsV2"),
    DeleteObjectsCommand: record("DeleteObjects"),
  };
});

const storage = await import("@ats/storage/server");

afterAll(() => {
  rmSync(LOCAL_DIR, { recursive: true, force: true });
});

describe("exported surface", () => {
  test("exposes the storage helpers", () => {
    for (const name of [
      "isStorageConfigured",
      "safeFileName",
      "resumeObjectPath",
      "putObject",
      "getObject",
      "deleteObject",
      "deletePrefix",
      "contentTypeFor",
    ] as const) {
      expect(typeof storage[name]).toBe("function");
    }
    // Storage always degrades to the local fallback — it never reports "off".
    expect(storage.isStorageConfigured()).toBe(true);
  });
});

describe("safeFileName", () => {
  test("replaces runs of unsafe characters (dots are safe, slashes are not)", () => {
    expect(storage.safeFileName("../../evil.pdf")).toBe(".._.._evil.pdf");
    expect(storage.safeFileName("a/b:c*d?.pdf")).toBe("a_b_c_d_.pdf");
  });

  test("truncates to 120 characters and falls back on empty input", () => {
    expect(storage.safeFileName("x".repeat(300)).length).toBe(120);
    expect(storage.safeFileName("")).toBe("resume.pdf");
  });
});

describe("resumeObjectPath", () => {
  test("composes the org-scoped key with a sanitised filename", () => {
    expect(storage.resumeObjectPath("org1", "cand2", "../../cv final.pdf")).toBe(
      "org1/cand2/.._.._cv final.pdf",
    );
  });
});

describe("contentTypeFor", () => {
  test("maps common extensions and falls back to octet-stream", () => {
    expect(storage.contentTypeFor("cv.pdf")).toBe("application/pdf");
    expect(storage.contentTypeFor("photo.PNG")).toBe("image/png");
    expect(storage.contentTypeFor("notes.md")).toBe("text/plain");
    expect(storage.contentTypeFor("sheet.xlsx")).toBe("application/octet-stream");
  });
});

describe("local fallback (no S3 configured)", () => {
  test("put/get roundtrip preserves bytes and content type", async () => {
    const key = storage.resumeObjectPath("orgA", "candA", "resume.pdf");
    const bytes = new TextEncoder().encode("%PDF-smoke");
    await storage.putObject(key, bytes, "application/pdf");
    const got = await storage.getObject(key);
    expect(got).not.toBeNull();
    expect(new TextDecoder().decode(got!.bytes)).toBe("%PDF-smoke");
    expect(got!.contentType).toBe("application/pdf");
  });

  test("getObject returns null for a missing key", async () => {
    expect(await storage.getObject("orgA/candA/never-uploaded.pdf")).toBeNull();
  });

  test("key traversal outside the root is refused", async () => {
    expect(
      storage.putObject("../../evil.pdf", new Uint8Array(4), "application/pdf"),
    ).rejects.toThrow("Invalid storage key");
    expect(storage.getObject("../../evil.pdf")).rejects.toThrow("Invalid storage key");
  });

  test("deleteObject removes the object", async () => {
    const key = "orgA/candA/gone.pdf";
    await storage.putObject(key, new Uint8Array([1, 2, 3]), "application/pdf");
    await storage.deleteObject(key);
    expect(await storage.getObject(key)).toBeNull();
  });

  test("deletePrefix removes everything under the prefix", async () => {
    const prefix = "orgA/wipe/";
    await storage.putObject(prefix + "a.pdf", new Uint8Array(1), "application/pdf");
    await storage.putObject(prefix + "b.txt", new Uint8Array(1), "text/plain");
    await storage.deletePrefix(prefix);
    expect(await storage.getObject(prefix + "a.pdf")).toBeNull();
    expect(await storage.getObject(prefix + "b.txt")).toBeNull();
  });

  test("no S3 command was ever constructed", () => {
    expect(s3Commands).toEqual([]);
  });
});
