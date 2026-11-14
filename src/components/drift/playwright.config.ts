import { resolve } from 'node:path';
import { defineConfig } from '@playwright/test';

// These tests mock GET /api/drift. They verify UI behavior, not live collection.
const external = process.env.DRIFT_UI_BASE_URL;
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
export default defineConfig({
 testDir: '.', testMatch: 'DriftRoom.spec.ts', workers: 1,
 use: {
  baseURL: external || 'http://localhost:3100', headless: true,
  launchOptions: executablePath ? { executablePath } : {},
 },
 webServer: external ? undefined : {
  command: 'npm run dev -- --webpack --port 3100',
  cwd: resolve(__dirname, '../../..'), url: 'http://localhost:3100/drift-room',
  reuseExistingServer: false, timeout: 60000,
 },
});
