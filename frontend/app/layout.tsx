import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { ClerkProvider } from '@clerk/nextjs'
import './globals.css'
import { Providers } from '@/components/providers'
import { ErrorBoundary } from '@/components/error-boundary'
import { NProgressProvider } from '@/components/providers/nprogress-provider'
import { SkipLink } from '@/components/skip-link'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'iofold - Automated Eval Generation',
  description: 'Generate high-quality eval functions from trace examples',
  icons: {
    icon: '/favicon.svg',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <ClerkProvider>
      <html lang="en" suppressHydrationWarning>
        <body className={inter.className}>
          <SkipLink />
          <Providers>
            <ErrorBoundary>
              <NProgressProvider>
                {children}
              </NProgressProvider>
            </ErrorBoundary>
          </Providers>
        </body>
      </html>
    </ClerkProvider>
  )
}
