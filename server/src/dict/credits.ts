import type { Credit } from '../../../shared/types.ts';

const CC_BY_SA_3 = 'https://creativecommons.org/licenses/by-sa/3.0/';
const CC_BY_SA_4 = 'https://creativecommons.org/licenses/by-sa/4.0/';

/** EDRDG asks that applications acknowledge JMdict and link to its licence. */
export const JMDICT: Credit = {
  name: 'JMdict（EDRDG）',
  url: 'https://www.edrdg.org/wiki/index.php/JMdict-EDICT_Dictionary_Project',
  license: 'CC BY-SA 4.0',
  licenseUrl: 'https://www.edrdg.org/edrdg/licence.html',
};

/** Chinese Wiktionary entry for a word, credited to its contributors. */
export const zhWiktionary = (word: string): Credit => ({
  name: '维基词典贡献者',
  url: `https://zh.wiktionary.org/wiki/${encodeURIComponent(word)}`,
  license: 'CC BY-SA 4.0',
  licenseUrl: CC_BY_SA_4,
});

/** English definitions come from Wiktionary via the Free Dictionary API. */
export const enWiktionary = (sourceUrl?: string, license?: { name: string; url: string }): Credit => ({
  name: '英文维基词典贡献者（经 Free Dictionary API）',
  url: sourceUrl,
  license: license?.name ?? 'CC BY-SA 3.0',
  licenseUrl: license?.url ?? CC_BY_SA_3,
});
