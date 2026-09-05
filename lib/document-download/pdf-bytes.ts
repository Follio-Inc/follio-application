/**
 * Detect a real PDF before Chrome's save dialog runs.
 * Error HTML saved as .pdf is what produced the 92KB fake file.
 */
export function hasPdfMagic(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 4 &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46
  );
}

export async function blobHasPdfMagic(blob: Blob): Promise<boolean> {
  const header = new Uint8Array(await blob.slice(0, 8).arrayBuffer());
  return hasPdfMagic(header);
}
