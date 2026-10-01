/** Bridge to the app's main process (src/preload/index.js). Replaces the HTTP API. */
export interface PandaRequest {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  path: string
  query?: Record<string, unknown>
  body?: unknown
}

export type PandaResponse<T = unknown> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; message: string; details?: unknown }

declare global {
  interface Window {
    panda: { request: <T = unknown>(request: PandaRequest) => Promise<PandaResponse<T>> }
  }
}
