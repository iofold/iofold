'use client'

import { ReactNode } from 'react'
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
  return (
    <SidebarProvider>
      <Sidebar />
      <MainContent>{children}</MainContent>
    </SidebarProvider>
  )
}
