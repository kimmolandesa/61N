export { fmiSourceAdapter } from '@/lib/intel/sources/fmi';
export { maanmittauslaitosSourceAdapter } from '@/lib/intel/sources/maanmittauslaitos';
export { opencellidSourceAdapter } from '@/lib/intel/sources/opencellid';
export { vaylaSourceAdapter } from '@/lib/intel/sources/vayla';

import { fmiSourceAdapter } from '@/lib/intel/sources/fmi';
import { maanmittauslaitosSourceAdapter } from '@/lib/intel/sources/maanmittauslaitos';
import { opencellidSourceAdapter } from '@/lib/intel/sources/opencellid';
import { vaylaSourceAdapter } from '@/lib/intel/sources/vayla';

export const intelSourceAdapters = [
  fmiSourceAdapter,
  maanmittauslaitosSourceAdapter,
  opencellidSourceAdapter,
  vaylaSourceAdapter,
];
