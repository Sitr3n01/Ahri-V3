import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AhriApiClient } from './index';

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response;
}

describe('AhriApiClient', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('sends bearer auth for protected requests', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, { personas: [], active: 'ahri' }));
    vi.stubGlobal('fetch', fetchMock);

    const client = new AhriApiClient({ baseUrl: 'http://localhost:8742/' });
    client.setTokens('access-token', 'refresh-token');

    await client.listPersonas();

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8742/personas',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer access-token',
        }),
      }),
    );
  });

  it('refreshes access token once and retries the original request', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(401, { detail: 'expired' }))
      .mockResolvedValueOnce(jsonResponse(200, {
        access_token: 'new-access',
        refresh_token: 'new-refresh',
        token_type: 'bearer',
      }))
      .mockResolvedValueOnce(jsonResponse(200, { personas: [], active: 'ahri' }));
    vi.stubGlobal('fetch', fetchMock);

    const client = new AhriApiClient({ baseUrl: 'http://localhost:8742' });
    client.setTokens('old-access', 'old-refresh');

    const response = await client.listPersonas();

    expect(response.active).toBe('ahri');
    expect(client.getAccessToken()).toBe('new-access');
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'http://localhost:8742/personas',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer new-access',
        }),
      }),
    );
  });
});
