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
        <nav className="border-b">
          <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
            <a href="/" className="text-lg font-semibold">
              ⏱ Internet Zeiten
            </a>
            <div className="flex gap-4 text-sm">
              <a href="/" className="hover:text-primary transition-colors">Heute</a>
              <a href="/settings" className="hover:text-primary transition-colors">Einstellungen</a>
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
