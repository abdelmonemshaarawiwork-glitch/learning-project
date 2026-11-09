import { useEffect, useState } from 'react';

/** Object URL for stored image bytes; revoked automatically. Nothing leaves the device. */
export function usePhotoUrl(data: ArrayBuffer | undefined, mimeType = 'image/jpeg'): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!data) {
      setUrl(null);
      return;
    }
    const u = URL.createObjectURL(new Blob([data], { type: mimeType }));
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [data, mimeType]);
  return url;
}
