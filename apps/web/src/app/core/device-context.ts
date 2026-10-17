/**
 * Contexto do cliente enviado no header X-Mp-Ctx em toda mutação:
 * base64 de { ts, device_id, path }. O device_id é um UUID estável por navegador.
 */
const DEVICE_KEY = 'mp:device-id';

export function newUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function deviceId(): string {
  try {
    const existing = localStorage.getItem(DEVICE_KEY);
    if (existing) return existing;
    const id = newUuid();
    localStorage.setItem(DEVICE_KEY, id);
    return id;
  } catch {
    return 'volatile-' + newUuid();
  }
}

export function clientContextHeader(method: string, path: string): string {
  const payload = JSON.stringify({ ts: Date.now(), device_id: deviceId(), method, path });
  return btoa(unescape(encodeURIComponent(payload)));
}
