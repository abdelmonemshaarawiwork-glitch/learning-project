/** Minimal typing of the claude.ai Artifact viewer bridge (present only in the hosted preview). */
interface ClaudeDownloads {
  save(request: { filename: string; data: string | Blob | ArrayBuffer | ArrayBufferView }): Promise<{ status: 'saved' | 'delivered' }>;
}
interface ClaudeArtifactBridge {
  use(name: 'downloads'): Promise<ClaudeDownloads | null>;
}
interface Window {
  claude?: ClaudeArtifactBridge;
}
interface ImportMetaEnv {
  readonly VITE_TARGET?: 'artifact' | 'pwa';
}
