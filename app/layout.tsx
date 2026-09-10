import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Nox Certamen — Solo Field Prototype',
  description:
    'Program five orders, conceal your strongholds, and conquer the Shattered Marches.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
