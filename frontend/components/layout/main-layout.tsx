'use client'

import { ReactNode } from 'react'
import { useAuth } from '@clerk/nextjs'
import { Sidebar, SidebarProvider, useSidebar } from '@/components/sidebar'
import { cn } from '@/lib/utils'

function MainContent({ children }: { children: ReactNode }) {
  const { isExpanded } = useSidebar()

  return (
    <main
      className={cn(
        'min-h-screen transition-all duration-300 ease-in-out bg-background',
        isExpanded ? 'ml-64' : 'ml-[72px]'
      )}
    >
      {children}
    </main>
  )
}

export function MainLayout({ children }: { children: ReactNode }) {
  const { isLoaded } = useAuth()

  // Show loading while Clerk initializes
  if (!isLoaded) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    )
  }

  return (
    <SidebarProvider>
      <Sidebar />
      <MainContent>{children}</MainContent>
    </SidebarProvider>
  )
}
