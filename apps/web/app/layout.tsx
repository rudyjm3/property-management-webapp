import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'PropFlow - Property Management',
  description: 'Property management platform for apartment managers',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
