import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PersonaSummary } from '@ahri/shared';
import { api } from '../api/client';
import { usePersonaStore } from './persona-store';

vi.mock('../api/client', () => ({
  api: {
    listPersonas: vi.fn(),
    activatePersona: vi.fn(),
  },
}));

const ahri: PersonaSummary = {
  name: 'ahri',
  display_name: 'Ahri',
  archetype: 'Companion',
  universe: 'Runeterra',
  theme: {
    primary: '',
    secondary: '',
    shadow: '',
    glow: '',
    avatar: '',
    background: '',
    backgroundMobile: '',
  },
};

const herta: PersonaSummary = {
  ...ahri,
  name: 'herta',
  display_name: 'Herta',
};

describe('web persona store', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(api.listPersonas).mockReset();
    vi.mocked(api.activatePersona).mockReset();
    usePersonaStore.setState({
      personas: [],
      activePersona: null,
      isLoading: false,
    });
  });

  it('loads personas and selects the backend active persona', async () => {
    vi.mocked(api.listPersonas).mockResolvedValue({ personas: [ahri, herta], active: 'herta' });

    await usePersonaStore.getState().loadPersonas();

    expect(usePersonaStore.getState().personas).toHaveLength(2);
    expect(usePersonaStore.getState().activePersona?.name).toBe('herta');
    expect(usePersonaStore.getState().isLoading).toBe(false);
  });

  it('activates a persona and reloads the list', async () => {
    vi.mocked(api.activatePersona).mockResolvedValue({ active: 'ahri' });
    vi.mocked(api.listPersonas).mockResolvedValue({ personas: [ahri, herta], active: 'ahri' });

    await usePersonaStore.getState().activatePersona('ahri');

    expect(api.activatePersona).toHaveBeenCalledWith('ahri');
    expect(api.listPersonas).toHaveBeenCalledOnce();
    expect(usePersonaStore.getState().activePersona?.name).toBe('ahri');
  });
});
