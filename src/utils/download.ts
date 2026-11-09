/**
 * Saves in-memory content as a file on this device. Nothing is uploaded.
 * In the hosted preview (claude.ai Artifact viewer) direct downloads are blocked, so the file is
 * offered through the viewer's `downloads` capability, which asks the user to confirm.
 */
export class DownloadCancelledError extends Error {
  constructor(message = 'The download was cancelled.') {
    super(message);
    this.name = 'DownloadCancelledError';
  }
}

async function viewerDownloads() {
  try {
    return (await window.claude?.use('downloads')) ?? null;
  } catch {
    return null;
  }
}

export async function downloadBlob(blob: Blob, filename: string): Promise<void> {
  if (window.claude?.use) {
    const downloads = await viewerDownloads();
    if (!downloads) throw new Error('Saving files is not available in this preview. Install the full app to download files.');
    try {
      await downloads.save({ filename, data: blob });
    } catch (e) {
      const code = (e as { code?: string })?.code;
      if (code === 'declined') throw new DownloadCancelledError();
      throw new Error((e as { message?: string })?.message || 'The file could not be saved.');
    }
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function safeFilename(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/_+/g, '_').slice(0, 80);
}

/** True when running inside the hosted preview rather than the installed app. */
export const IS_HOSTED_PREVIEW = import.meta.env.VITE_TARGET === 'artifact';
