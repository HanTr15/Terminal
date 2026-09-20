/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,

  // Hapus console.log dari bundle produksi (sedikit lebih ringan)
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production' ? { exclude: ['error'] } : false,
  },

  async headers() {
    return [
      {
        // Izinkan terminal ditanam sebagai iframe di web lain.
        // Ganti * dengan domain kamu kalau mau dibatasi, contoh:
        //   "frame-ancestors 'self' https://webkamu.com"
        source: '/:path*',
        headers: [{ key: 'Content-Security-Policy', value: 'frame-ancestors *' }],
      },
      {
        // Script widget boleh diambil lintas domain & di-cache lama.
        source: '/embed.js',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Cache-Control', value: 'public, max-age=3600, s-maxage=86400' },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
