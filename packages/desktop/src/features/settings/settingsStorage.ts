const STORAGE_PREFIX = 'ahri_settings_';

export function loadFromStorage<T>(key: string, defaults: T): T {
  try {
    const stored = localStorage.getItem(STORAGE_PREFIX + key);
    if (stored) return { ...defaults, ...JSON.parse(stored) };
  } catch {
    // localStorage can be unavailable in tests or locked-down environments.
  }
  return defaults;
}

export function saveToStorage(key: string, data: unknown) {
  localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(data));
}
