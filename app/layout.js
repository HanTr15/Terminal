import './globals.css';

// Ganti ke domain kamu setelah deploy supaya thumbnail link tampil benar.
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://ctf-terminal.vercel.app';

export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: 'Linux Fundamental Lab',
  description: 'Belajar command Linux dasar lewat 8 tantangan interaktif.',
  openGraph: {
    title: 'Linux Fundamental Lab',
    description: 'Belajar command Linux dasar lewat 8 tantangan interaktif.',
    url: SITE_URL,
    siteName: 'Linux Lab',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Linux Fundamental Lab',
    description: 'Belajar command Linux dasar lewat 8 tantangan interaktif.',
  },
  robots: { index: true, follow: true },
};

export const viewport = {
  themeColor: '#14161c',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
