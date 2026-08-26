import './globals.css';
import './challenge.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'HeatRx',
  description: 'Playable urban cooling simulator and intervention optimizer',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
