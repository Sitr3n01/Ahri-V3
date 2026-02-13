/**
 * API Client for Ahri Web (PWA)
 * Reuses AhriApiClient from @ahri/shared with mobile-specific configuration
 */

import { AhriApiClient } from '@ahri/shared';

// Mobile-specific API configuration
const API_BASE_URL = import.meta.env.PROD
  ? window.location.origin // Production: same origin as PWA
  : 'http://localhost:8742'; // Development: proxy to backend

export const api = new AhriApiClient({ baseUrl: API_BASE_URL });

// Export for direct use
export default api;
