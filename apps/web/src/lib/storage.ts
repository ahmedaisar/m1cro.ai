import { del, put } from "@vercel/blob";

function assertStorageConfigured(): void {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error("Vercel Blob is not configured. Connect the m1cro-artifacts store to this project.");
  }
}

export async function storePrivateArtifact(pathname: string, body: Blob | Buffer | ReadableStream<Uint8Array>) {
  assertStorageConfigured();
  if (!pathname || pathname.startsWith("/") || pathname.split("/").some(part => part === "..")) {
    throw new Error("Artifact path must be a relative, traversal-safe path");
  }
  return put(pathname, body, {
    access: "private",
    addRandomSuffix: true,
    cacheControlMaxAge: 60 * 60 * 24 * 30,
  });
}

export async function deletePrivateArtifact(url: string): Promise<void> {
  assertStorageConfigured();
  const parsed = new URL(url);
  if (!parsed.hostname.endsWith(".blob.vercel-storage.com")) {
    throw new Error("Refusing to delete a non-Vercel Blob URL");
  }
  await del(url);
}
