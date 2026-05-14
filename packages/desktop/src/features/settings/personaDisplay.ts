import { getPersonaTheme, mergePersonaTheme } from '@ahri/shared';

const PERSONA_IMAGE_POSITIONS: Record<string, string> = {
  ahri: '50% 35%',
  kafka: '50% 35%',
  robin: '50% 35%',
  furina: '50% 35%',
  sparkle: '50% 35%',
  frieren: '50% 35%',
  herta: '50% 35%',
  shorekeeper: '50% 35%',
  cantarella: '50% 35%',
  maomao: '50% 35%',
  'yae miko': '50% 35%',
  rakan: '50% 35%',
  'march 7th': '50% 35%',
  cartethyia: '50% 35%',
  cyrene: '50% 35%',
  'carlotta montelli': '50% 35%',
};

export function personaDisplayTheme(persona: { name: string; theme?: any } | undefined, fallbackName = 'ahri') {
  const staticTheme = getPersonaTheme(persona?.name ?? fallbackName);
  return mergePersonaTheme(staticTheme, persona?.theme);
}

export function getImagePosition(name: string): string {
  return PERSONA_IMAGE_POSITIONS[name.toLowerCase().replace(/_/g, ' ')] || '50% 20%';
}
