import { beforeEach, describe, expect, it } from 'vitest';
import { api, clearTokens, persistTokens, restoreTokens } from './client';

describe('desktop API token persistence', () => {
  beforeEach(() => {
    localStorage.clear();
    api.setTokens('', '');
  });

  it('persists, restores, and clears API tokens', () => {
    persistTokens('access-token', 'refresh-token');

    expect(localStorage.getItem('ahri_access_token')).toBe('access-token');
    expect(api.getAccessToken()).toBe('access-token');

    api.setTokens('', '');
    expect(restoreTokens()).toBe(true);
    expect(api.getAccessToken()).toBe('access-token');

    clearTokens();
    expect(localStorage.getItem('ahri_access_token')).toBeNull();
    expect(api.getAccessToken()).toBe('');
  });
});
