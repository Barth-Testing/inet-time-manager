import './globals.css'
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Internet Zeiten Manager',
  description: 'Verwaltung der Internet-Zeiten für Kinder',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="de">
      <body className={inter.className}>
        <nav className="border-b bg-white sticky top-0 z-40">
          <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
            <a href="/" className="flex items-center gap-2 text-lg font-semibold">
              <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-primary"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              Internet Zeiten
            </a>
            <div className="flex gap-1 text-sm">
              <a href="/" className="px-3 py-1.5 rounded-md hover:bg-accent transition-colors font-medium">
                Heute
              </a>
              <a href="/settings" className="px-3 py-1.5 rounded-md hover:bg-accent transition-colors font-medium">
                Einstellungen
              </a>
            </div>
          </div>
        </nav>
        <main className="max-w-4xl mx-auto px-4 py-6">
          {children}
        </main>
      </body>
    </html>
  )
}
