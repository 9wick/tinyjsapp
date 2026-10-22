// The native audio filter rows the bridge sends (AUDIOFILTERS / SET).
// Headless, any OS:   bin/tjs run test/audio-filter-rows/check.js
//
// gain is dB for the EQ shapes (0 = flat) but a linear multiplier for type
// 'gain' (1 = unchanged). A missing gain used to default to 0 for every
// type, so { type: 'gain' } silenced the app natively while the page chain
// passed it through.
const { audioFilterRow, filterGain } = await import(tjs.env.BRIDGE_JS || '../../runtime/bridge.js');

const cases = [
  [{ type: 'gain' }, 'linear,1000,1,1'],                       // unity, not silence
  [{ type: 'gain', gain: 0.5 }, 'linear,1000,1,0.5'],
  [{ type: 'gain', gainR: 0.4 }, 'linear,1000,1,1,0.4'],       // panned left
  [{ type: 'gain', gainR: 1 }, 'linear,1000,1,1'],             // same both sides: 4 fields
  [{ type: 'peaking', freq: 60, q: 1.1 }, 'bq_peaking,60,1.1,0'],   // EQ: 0 dB = flat
  [{ type: 'lowshelf', gain: 4 }, 'bq_lowshelf,1000,1,4'],
];
let fail = 0;
for (const [f, want] of cases) {
  const got = audioFilterRow(f);
  if (got !== want) { fail++; console.log('FAIL', JSON.stringify(f), 'want', want, 'got', got); }
}
if (filterGain({ type: 'gain' }) !== 1 || filterGain({ type: 'highshelf' }) !== 0) { fail++; console.log('FAIL filterGain defaults'); }
console.log(fail ? `${fail} FAILED` : `PASS ${cases.length + 1} cases`);
tjs.exit(fail ? 1 : 0);
