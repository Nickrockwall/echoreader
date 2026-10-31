import { useEffect, useState } from 'react';
import type { VoiceCatalog } from '../../../../shared/types.ts';
import { api } from '../../lib/api.ts';

let catalog: Promise<VoiceCatalog> | null = null;

/** Voice presets from the server, fetched once per page load. */
export function useVoiceCatalog(): VoiceCatalog | null {
  const [value, setValue] = useState<VoiceCatalog | null>(null);
  useEffect(() => {
    let live = true;
    catalog ??= api.voices();
    catalog.then((c) => live && setValue(c)).catch(() => (catalog = null));
    return () => {
      live = false;
    };
  }, []);
  return value;
}
