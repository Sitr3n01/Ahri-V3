/**
 * Singleton API client instance para o desktop app.
 */
import { AhriApiClient } from '@ahri/shared';

const BACKEND_PORT = 8742;

export const api = new AhriApiClient({
  baseUrl: `http://localhost:${BACKEND_PORT}`,
  onTokenExpired: () => {
    // Redireciona para login quando token expirar
    window.location.hash = '#/login';
  },
});

/**
 * Salva tokens no localStorage para persistência.
 */
export function persistTokens(access: string, refresh: string) {
  localStorage.setItem('ahri_access_token', access);
  localStorage.setItem('ahri_refresh_token', refresh);
  api.setTokens(access, refresh);
}

/**
 * Restaura tokens do localStorage.
 */
export function restoreTokens(): boolean {
  const access = localStorage.getItem('ahri_access_token');
  const refresh = localStorage.getItem('ahri_refresh_token');
  if (access && refresh) {
    api.setTokens(access, refresh);
    return true;
  }
  return false;
}

/**
 * Limpa tokens.
 */
export function clearTokens() {
  localStorage.removeItem('ahri_access_token');
  localStorage.removeItem('ahri_refresh_token');
  api.setTokens('', '');
}
