'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import NProgress from 'nprogress'
import { cn } from '@/lib/utils'

const navItems = [
  { href: '/', label: 'Home' },
  { href: '/integrations', label: 'Integrations' },
  { href: '/agents', label: 'Agents' },
  { href: '/traces', label: 'Traces' },
  { href: '/evals', label: 'Evals' },
  { href: '/analytics', label: 'Analytics' },
]

export function Navigation() {
  const pathname = usePathname()

  return (
    <nav className="border-b bg-background">
      <div className="container mx-auto px-4">
        <div className="flex h-16 items-center justify-between">
          <div className="flex items-center gap-6">
            <Link
              href="/"
              className="text-xl font-bold transition-colors duration-200 hover:text-primary"
              onClick={() => NProgress.start()}
            >
              iofold
            </Link>
            <div className="flex gap-1">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => NProgress.start()}
                  className={cn(
                    "px-3 py-2 rounded-md text-sm font-medium transition-colors duration-200",
                    pathname === item.href
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  )}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-4">
            {/* Add user menu here when implementing auth */}
          </div>
        </div>
      </div>
    </nav>
  )
}
