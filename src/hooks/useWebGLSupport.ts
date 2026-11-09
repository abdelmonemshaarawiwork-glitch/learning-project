let cached: boolean | null = null;

/** Detects whether WebGL can create a context on this device. */
export function detectWebGL(): boolean {
  if (cached !== null) return cached;
  try {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('webgl2') ?? canvas.getContext('webgl') ?? canvas.getContext('experimental-webgl');
    cached = !!ctx;
  } catch {
    cached = false;
  }
  return cached;
}

export function useWebGLSupport(): boolean {
  return detectWebGL();
}
