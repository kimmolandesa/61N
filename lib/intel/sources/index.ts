export { fingridSourceAdapter } from '@/lib/intel/sources/fingrid';
export { fmiSourceAdapter, fmiClimateSourceAdapter } from '@/lib/intel/sources/fmi';
export { maanmittauslaitosSourceAdapter } from '@/lib/intel/sources/maanmittauslaitos';
export { opencellidSourceAdapter } from '@/lib/intel/sources/opencellid';
export { vaylaSourceAdapter } from '@/lib/intel/sources/vayla';

import { fingridSourceAdapter } from '@/lib/intel/sources/fingrid';
import { fmiClimateSourceAdapter, fmiSourceAdapter } from '@/lib/intel/sources/fmi';
import { maanmittauslaitosSourceAdapter } from '@/lib/intel/sources/maanmittauslaitos';
import { opencellidSourceAdapter } from '@/lib/intel/sources/opencellid';
import { vaylaSourceAdapter } from '@/lib/intel/sources/vayla';

export const intelSourceAdapters = [
  fingridSourceAdapter,
  fmiSourceAdapter,
  fmiClimateSourceAdapter,
  maanmittauslaitosSourceAdapter,
  opencellidSourceAdapter,
  vaylaSourceAdapter,
];
