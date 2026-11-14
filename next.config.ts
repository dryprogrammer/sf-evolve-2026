import type { NextConfig } from 'next';
const config: NextConfig = {
 async redirects() {
  return process.env.DRIFT_DEMO === '1' ? [{ source: '/', destination: '/drift-room', permanent: false }] : [];
 },
};
export default config;
