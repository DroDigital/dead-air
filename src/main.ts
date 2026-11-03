/**
 * DEAD AIR — entry point.
 */
import { App } from './app';
import { IS_DEV } from './core/config';
import { PHYS } from './game/wheel';
import { BALANCE } from './game/balance';
import { PSX_SHARED } from './render/psxMaterial';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const app = new App(canvas);
(window as unknown as { deadAir: App }).deadAir = app;

app.boot().then(async () => {
  // Dev-only tuning panel; tree-shaken out of production builds.
  if (IS_DEV && new URLSearchParams(location.search).has('gui')) {
    const { default: GUI } = await import('lil-gui');
    const gui = new GUI({ title: 'DEAD AIR tuning' });
    const f1 = gui.addFolder('Wheel physics');
    for (const k of ['linDrag', 'coulomb', 'flapK', 'flapSlip', 'contactK', 'fastPegLoss', 'ringLinDrag', 'ringCouple', 'biasDecel'] as const) f1.add(PHYS, k);
    const f2 = gui.addFolder('Balance');
    for (const k of ['streakStep', 'sweetHalfWidth', 'tokenRate', 'interestRate'] as const) f2.add(BALANCE, k);
    const f3 = gui.addFolder('PSX');
    f3.add(PSX_SHARED.uWarp, 'value', 0, 1).name('warp');
    f3.add(PSX_SHARED.uSnap, 'value', 0, 1).name('snap');
    f3.add(PSX_SHARED.uFogNear, 'value', 0, 10).name('fog near');
    f3.add(PSX_SHARED.uFogFar, 'value', 1, 30).name('fog far');
  }
});
