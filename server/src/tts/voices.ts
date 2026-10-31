import type { Lang, VoicePreset } from '../../../shared/types.ts';

/**
 * Voice presets offered to the reader. Each is an Edge read-aloud voice plus a pitch offset, so a
 * few real voices can play several roles. Only voices the free Edge endpoint actually serves are
 * listed: for Japanese that is Nanami and Keita (Aoi, Daichi, Mayu and Shiori are Azure-only),
 * plus the multilingual voices, which can speak Japanese with a slight accent.
 */
export const VOICE_PRESETS: VoicePreset[] = [
  // ---- Japanese ----
  { id: 'ja-nanami', lang: 'ja', name: 'Nanami', description: '清澈女声', voice: 'ja-JP-NanamiNeural', pitch: 0, gender: 'female', styleTags: ['默认', '旁白'] },
  { id: 'ja-keita', lang: 'ja', name: 'Keita', description: '自然男声', voice: 'ja-JP-KeitaNeural', pitch: 0, gender: 'male', styleTags: ['旁白'] },
  { id: 'ja-genki', lang: 'ja', name: '元气少女', description: 'Nanami 升调，轻小说女主角', voice: 'ja-JP-NanamiNeural', pitch: 14, gender: 'female', styleTags: ['台词'] },
  { id: 'ja-shonen', lang: 'ja', name: '清亮少年', description: 'Keita 升调，轻小说男主角', voice: 'ja-JP-KeitaNeural', pitch: 12, gender: 'male', styleTags: ['台词'] },
  { id: 'ja-gentle', lang: 'ja', name: '温柔姐姐', description: 'Nanami 略降调，抒情', voice: 'ja-JP-NanamiNeural', pitch: -6, gender: 'female', styleTags: ['旁白', '台词'] },
  { id: 'ja-deep', lang: 'ja', name: '低沉旁白', description: 'Keita 降调，沉稳叙事', voice: 'ja-JP-KeitaNeural', pitch: -10, gender: 'male', styleTags: ['旁白'] },
  { id: 'ja-ava', lang: 'ja', name: 'Ava 多语言', description: '知性女声，带一点外语口音', voice: 'en-US-AvaMultilingualNeural', pitch: 0, gender: 'female', styleTags: ['实验'], experimental: true },
  { id: 'ja-emma', lang: 'ja', name: 'Emma 多语言', description: '明快女声，带一点外语口音', voice: 'en-US-EmmaMultilingualNeural', pitch: 0, gender: 'female', styleTags: ['实验'], experimental: true },

  // ---- English ----
  { id: 'en-jenny', lang: 'en', name: 'Jenny', description: '自然美音女声', voice: 'en-US-JennyNeural', pitch: 0, gender: 'female', styleTags: ['默认', '旁白'] },
  { id: 'en-guy', lang: 'en', name: 'Guy', description: '标准美音男声', voice: 'en-US-GuyNeural', pitch: 0, gender: 'male', styleTags: ['旁白'] },
  { id: 'en-aria', lang: 'en', name: 'Aria', description: '戏剧感女声，抑扬顿挫', voice: 'en-US-AriaNeural', pitch: 0, gender: 'female', styleTags: ['台词', '叙事'] },
  { id: 'en-christopher', lang: 'en', name: 'Christopher', description: '深沉男声', voice: 'en-US-ChristopherNeural', pitch: 0, gender: 'male', styleTags: ['旁白'] },
  { id: 'en-ryan', lang: 'en', name: 'Ryan', description: '英伦绅士，适合古典名著', voice: 'en-GB-RyanNeural', pitch: 0, gender: 'male', styleTags: ['旁白', '古典'] },
  { id: 'en-sonia', lang: 'en', name: 'Sonia', description: '优雅英音女声', voice: 'en-GB-SoniaNeural', pitch: 0, gender: 'female', styleTags: ['台词', '古典'] },
  { id: 'en-william', lang: 'en', name: 'William', description: '随性澳洲男声', voice: 'en-AU-WilliamNeural', pitch: 0, gender: 'male', styleTags: ['台词'] },
  { id: 'en-andrew', lang: 'en', name: 'Andrew', description: '温暖男声', voice: 'en-US-AndrewNeural', pitch: 0, gender: 'male', styleTags: ['旁白'] },
  { id: 'en-emma', lang: 'en', name: 'Emma', description: '明快女声', voice: 'en-US-EmmaNeural', pitch: 0, gender: 'female', styleTags: ['台词'] },
];

export const DEFAULT_PRESET: Record<Lang, string> = { ja: 'ja-nanami', en: 'en-jenny' };

/** Presets saved before presets existed were plain Edge voice names. */
const LEGACY: Record<string, string> = {
  'ja-JP-NanamiNeural': 'ja-nanami',
  'ja-JP-KeitaNeural': 'ja-keita',
  'en-US-JennyNeural': 'en-jenny',
  'en-GB-RyanNeural': 'en-ryan',
};

export function resolvePreset(id: string | undefined, lang: Lang): VoicePreset | undefined {
  const key = id ? (LEGACY[id] ?? id) : DEFAULT_PRESET[lang];
  return VOICE_PRESETS.find((p) => p.id === key && p.lang === lang);
}

/** A short line for the preview button. */
export const PREVIEW_TEXT: Record<Lang, string> = {
  ja: 'こんにちは。今日はどんな物語を読みましょうか。',
  en: 'Hello there. Shall we read a story together?',
};
