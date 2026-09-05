import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Orbit Thief — gravitational score attack',
  description: 'A one-button gravitational slingshot game. Tether, release, and steal momentum.',
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
