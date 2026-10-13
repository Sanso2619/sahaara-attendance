import type { Metadata } from 'next';
import '../styles/globals.css';

export const metadata: Metadata = {
  title: 'Sahaara Attendance Management Platform',
  description: 'Multi-organization digital attendance platform for NGO schools and community learning centres.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-surface-canvas text-gray-900 antialiased min-h-screen">
        {children}
      </body>
    </html>
  );
}
