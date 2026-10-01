import axios, { AxiosHeaders, type AxiosAdapter } from 'axios'

/** Normalised error surfaced to callers. */
export class ApiError extends Error {
  constructor(
    message: string,
    public status?: number,
    public data?: unknown,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message
  if (error instanceof Error) return error.message
  return 'Something went wrong'
}

/**
 * Sends each request to the app's main process over the preload bridge instead of HTTP —
 * there is no server. Routes keep the old API's names ('/accounts/:id', …), so the services
 * and hooks are unchanged. No login: the app runs locally for its owner.
 */
const desktopAdapter: AxiosAdapter = async (config) => {
  if (!window.panda) throw new ApiError('Open this in the Panda Bot app')

  const response = await window.panda.request({
    method: (config.method ?? 'get').toUpperCase() as 'GET',
    // Same query-string encoding axios would use over HTTP
    path: api.getUri({ url: config.url, params: config.params, paramsSerializer: config.paramsSerializer }),
    body: config.data ?? undefined,
  })

  if (!response.ok) throw new ApiError(response.message, response.status, response.details)
  return { data: response.data, status: response.status, statusText: 'OK', headers: new AxiosHeaders(), config, request: null }
}

export const api = axios.create({
  adapter: desktopAdapter,
  // Bodies go over IPC as objects; don't turn them into JSON strings
  transformRequest: [(data) => data],
})
