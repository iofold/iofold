import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Providers } from '@/components/providers'
import { Navigation } from '@/components/navigation'
import { ErrorBoundary } from '@/components/error-boundary'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'iofold - Automated Eval Generation',
  description: 'Generate high-quality eval functions from trace examples',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <Providers>
          <ErrorBoundary>
            <div className="min-h-screen flex flex-col">
              <Navigation />
              <main className="flex-1">
                {children}
              </main>
            </div>
          </ErrorBoundary>
        </Providers>
      </body>
    </html>
  )
}
