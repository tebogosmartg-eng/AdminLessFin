import { triggerDownload } from '../download';

export function exportJson(
  rows: Record<string, string | number>[],
  fileName: string,
  meta?: Record<string, unknown>
): { fileName: string; contentType: string; payload: string } {
  const payload = JSON.stringify({ meta: meta ?? {}, rows }, null, 2);
  const name = fileName.endsWith('.json') ? fileName : `${fileName}.json`;
  if (typeof document !== 'undefined') {
    const blob = new Blob([payload], { type: 'application/json' });
    triggerDownload(blob, name);
  }
  return { fileName: name, contentType: 'application/json', payload };
}
