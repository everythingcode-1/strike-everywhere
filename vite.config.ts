import { defineConfig } from 'vite';
import { crx, type ManifestV3Export } from '@crxjs/vite-plugin';
import manifestJson from './manifest.json';

const manifest = manifestJson as unknown as ManifestV3Export;

export default defineConfig({
  plugins: [crx({ manifest })],
  build: {
    target: 'chrome110',
  },
});
