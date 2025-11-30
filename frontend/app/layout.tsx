import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Providers } from '@/components/providers'
import { MainLayout } from '@/components/layout'
import { ErrorBoundary } from '@/components/error-boundary'
import { NProgressProvider } from '@/components/providers/nprogress-provider'

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
            <NProgressProvider>
              <MainLayout>
                {children}
              </MainLayout>
            </NProgressProvider>
          </ErrorBoundary>
        </Providers>
      </body>
    </html>
  )
}
