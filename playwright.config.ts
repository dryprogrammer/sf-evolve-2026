import { defineConfig } from '@playwright/test';
export default defineConfig({ testDir:'./tests/browser', workers:1, use:{baseURL:'http://localhost:3100',headless:true}, webServer:{command:'npm run start:fixture -- --port 3100',url:'http://localhost:3100',reuseExistingServer:false,env:{FACTORY_DATA_DIR:`.data/browser-${Date.now()}`},timeout:60000} });
