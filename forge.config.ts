import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerDMG } from '@electron-forge/maker-dmg';
import { MakerZIP } from '@electron-forge/maker-zip';
import { VitePlugin } from '@electron-forge/plugin-vite';

const config: ForgeConfig = {
  packagerConfig: {
    name: 'NextTick',
    appBundleId: 'net.nextplatform.nexttick',
    asar: true,
  },
  rebuildConfig: {},
  makers: [
    new MakerDMG({
      format: 'ULFO',
      overwrite: true,
      title: 'NextTick 1.0.0',
      iconSize: 96,
      additionalDMGOptions: {
        'background-color': '#050505',
        window: { size: { width: 540, height: 360 } },
      },
    }),
    new MakerZIP({}, ['darwin']),
  ],
  plugins: [
    new VitePlugin({
      build: [
        { entry: 'src/main/main.ts', config: 'vite.main.config.ts', target: 'main' },
        { entry: 'src/preload/preload.ts', config: 'vite.preload.config.ts', target: 'preload' },
      ],
      renderer: [{ name: 'main_window', config: 'vite.renderer.config.ts' }],
    }),
  ],
};

export default config;
