/**
 * API response types compartilhados entre desktop e mobile.
 */

export interface ApiErrorResponse {
  detail: string;
  status_code: number;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

export interface HealthResponse {
  status: string;
  version: string;
}
