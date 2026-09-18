/**
 * Sequential quotation numbers. Only QTE-##### counts; probe prefixes such as
 * QDOC-<timestamp> must not reset the sequence to 00001.
 */
export function nextQuoteNumber(existing: Array<string | null | undefined>): string {
  let maxSeq = 0n;
  for (const raw of existing) {
    const match = /^QTE-(\d+)$/i.exec(String(raw ?? ''));
    if (!match) continue;
    try {
      const n = BigInt(match[1]);
      if (n > maxSeq) maxSeq = n;
    } catch {
      /* ignore unparseable */
    }
  }
  return `QTE-${(maxSeq + 1n).toString().padStart(5, '0')}`;
}
