const STORAGE_KEY = 'rpg_sound_config'

export type SoundConfig = {
  bgmVolume: number
  seVolume: number
  storySeVolume: number
}

export const DEFAULT_SOUND_CONFIG: SoundConfig = {
  bgmVolume: 0.7,
  seVolume: 1.0,
  storySeVolume: 1.0,
}

export function loadSoundConfig(): SoundConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_SOUND_CONFIG }
    const parsed = JSON.parse(raw) as Partial<SoundConfig>
    return {
      bgmVolume:      parsed.bgmVolume      ?? DEFAULT_SOUND_CONFIG.bgmVolume,
      seVolume:       parsed.seVolume       ?? DEFAULT_SOUND_CONFIG.seVolume,
      storySeVolume:  parsed.storySeVolume  ?? DEFAULT_SOUND_CONFIG.storySeVolume,
    }
  } catch {
    return { ...DEFAULT_SOUND_CONFIG }
  }
}

export function saveSoundConfig(config: SoundConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
  } catch {
    // localStorage が使えない環境では無視
  }
}
