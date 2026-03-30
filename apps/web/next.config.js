/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@propflow/shared'],
  generateBuildId: async () => {
    return `build-${Date.now()}`;
  },
  async headers() {
    const isDev = process.env.NODE_ENV !== 'production';
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

    // Supabase origin — allow any *.supabase.co subdomain since the project URL
    // varies per environment. WSS is needed for Supabase Realtime.
    const supabaseSrc = 'https://*.supabase.co wss://*.supabase.co';
    const s3UploadSrc = 'https://*.s3.us-east-1.amazonaws.com https://s3.us-east-1.amazonaws.com';

    const csp = [
      "default-src 'self'",
      // Next.js requires unsafe-inline for its hydration scripts.
      // unsafe-eval is required by Next.js hot-module-replacement in dev.
      `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''} https://js.stripe.com https://connect-js.stripe.com https://hcaptcha.com https://*.hcaptcha.com`,
      // connect-src controls fetch/XHR/WebSocket targets.
      // localhost:* covers the API dev server and Next.js HMR websocket.
      `connect-src 'self' ${apiUrl}${isDev ? ' ws://localhost:* http://localhost:*' : ''} https://api.stripe.com https://connect-js.stripe.com https://js.stripe.com ${supabaseSrc} ${s3UploadSrc}`,
      // Stripe hosts payment forms and the Express dashboard in iframes.
      'frame-src https://js.stripe.com https://hooks.stripe.com https://connect-js.stripe.com',
      "img-src 'self' data: blob: https://*.stripe.com",
      // React inline styles require unsafe-inline.
      "style-src 'self' 'unsafe-inline'",
      "font-src 'self' data:",
      "worker-src 'self' blob:",
    ].join('; ');

    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
