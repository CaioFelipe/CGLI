import { ptyService } from './ptyService'

export async function getApiBaseUrl(): Promise<string> {
  if (ptyService.isTauri()) {
    try {
      const port = await ptyService.getBridgePort()
      return `http://127.0.0.1:${port}`
    } catch {
      return 'http://127.0.0.1:41732'
    }
  }
  return ''
}

export async function memoryFetch(endpoint: string, init?: RequestInit): Promise<Response> {
  const baseUrl = await getApiBaseUrl()
  const targetUrl = endpoint.startsWith('http') ? endpoint : `${baseUrl}${endpoint}`
  return fetch(targetUrl, init)
}
