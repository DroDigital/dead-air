import { describe, expect, it } from 'vitest';
import { defaultSettings, sanitizeSettings, SETTINGS_VERSION } from '../src/core/config';
import { MemoryStorage, SaveSlot, SETTINGS_MIGRATIONS } from '../src/core/save';

const KEY = 'deadair.settings';

describe('resolution default', () => {
  it('starts at 640×360', () => {
    expect(defaultSettings().resolutionScale).toBe(2);
    expect(sanitizeSettings(null).resolutionScale).toBe(2);
    expect(sanitizeSettings({}).resolutionScale).toBe(2);
  });

  it('keeps a chosen resolution and falls back to the default for unknown values', () => {
    expect(sanitizeSettings({ resolutionScale: 1 }).resolutionScale).toBe(1);
    expect(sanitizeSettings({ resolutionScale: 2 }).resolutionScale).toBe(2);
    expect(sanitizeSettings({ resolutionScale: 3 as never }).resolutionScale).toBe(2);
  });
});

describe('settings save migration', () => {
  it('moves a v1 save (320×180 was stored on first launch) to 640×360 and keeps the other settings', () => {
    const storage = new MemoryStorage();
    storage.setItem(KEY, JSON.stringify({ v: 1, savedAt: 0, data: { ...defaultSettings(), v: 1, resolutionScale: 1, masterVolume: 0.3 } }));
    const slot = new SaveSlot<ReturnType<typeof defaultSettings>>(KEY, SETTINGS_VERSION, SETTINGS_MIGRATIONS, storage);
    const loaded = sanitizeSettings(slot.load());
    expect(loaded.resolutionScale).toBe(2);
    expect(loaded.masterVolume).toBe(0.3);
    expect(loaded.v).toBe(SETTINGS_VERSION);
  });

  it('keeps a 320×180 choice made after the change', () => {
    const storage = new MemoryStorage();
    const slot = new SaveSlot<ReturnType<typeof defaultSettings>>(KEY, SETTINGS_VERSION, SETTINGS_MIGRATIONS, storage);
    slot.save({ ...defaultSettings(), resolutionScale: 1 });
    expect(sanitizeSettings(slot.load()).resolutionScale).toBe(1);
  });
});
