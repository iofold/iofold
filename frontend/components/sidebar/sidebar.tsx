'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import NProgress from 'nprogress'
import { cn } from '@/lib/utils'
import { useSidebar } from './sidebar-context'
import { UserButton, useUser } from '@clerk/nextjs'
import {
  LayoutDashboard,
  Search,
  BarChart3,
  Activity,
  DollarSign,
  HelpCircle,
  Zap,
  Grid3X3,
  Plug,
  Settings,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Bot,
  Gamepad2,
  TrendingUp,
} from 'lucide-react'
import { useState, useRef } from 'react'

interface NavItem {
  href: string
  label: string
  icon: React.ComponentType<{ size?: number | string; className?: string }>
}

interface NavSection {
  title: string
  items: NavItem[]
  defaultExpanded?: boolean
}

const navSections: NavSection[] = [
  {
    title: 'NAVIGATION',
    defaultExpanded: true,
    items: [
      { href: '/', label: 'Overview', icon: LayoutDashboard },
      { href: '/playground', label: 'Playground', icon: Gamepad2 },
      { href: '/agents', label: 'Agents', icon: Bot },
      { href: '/traces', label: 'Traces', icon: Search },
      { href: '/evals', label: 'Evals', icon: BarChart3 },
      { href: '/analytics', label: 'Analytics', icon: TrendingUp },
    ],
  },
  {
    title: 'WORKFLOWS',
    defaultExpanded: true,
    items: [
      { href: '/setup', label: 'Setup Guide', icon: HelpCircle },
      { href: '/review', label: 'Quick Review', icon: Zap },
      { href: '/matrix', label: 'Matrix Analysis', icon: Grid3X3 },
      { href: '/integrations', label: 'IOFold Integration', icon: Plug },
    ],
  },
  {
    title: 'SYSTEM',
    defaultExpanded: true,
    items: [
      { href: '/system', label: 'Monitoring', icon: Activity },
      { href: '/resources', label: 'Resources', icon: DollarSign },
    ],
  },
]

function NavSectionComponent({
  section,
  isExpanded: sidebarExpanded,
}: {
  section: NavSection
  isExpanded: boolean
}) {
  const pathname = usePathname()
  const [isOpen, setIsOpen] = useState(section.defaultExpanded ?? true)

  return (
    <div className="mb-2">
      {sidebarExpanded && (
        <button
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            setIsOpen(!isOpen)
          }}
          type="button"
          className="flex items-center justify-between w-full px-3 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors duration-200"
        >
          <span>{section.title}</span>
          {isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      )}
      {(isOpen || !sidebarExpanded) && (
        <div className="space-y-2">
          {section.items.map((item) => {
            const Icon = item.icon
            const isActive = pathname === item.href ||
              (item.href !== '/' && pathname.startsWith(item.href))

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => NProgress.start()}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors duration-200',
                  isActive
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                  !sidebarExpanded && 'justify-center px-2'
                )}
                title={!sidebarExpanded ? item.label : undefined}
              >
                <Icon size={18} className="flex-shrink-0" />
                {sidebarExpanded && <span>{item.label}</span>}
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}

export function Sidebar() {
  const { isExpanded, toggle } = useSidebar()
  const { user, isLoaded } = useUser()
  const userButtonRef = useRef<HTMLDivElement>(null)

  return (
    <aside
      className={cn(
        'fixed left-0 top-0 h-screen bg-card border-r border-border flex flex-col transition-all duration-300 ease-in-out z-40',
        isExpanded ? 'w-64' : 'w-[72px]'
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
            <Zap size={18} className="text-primary-foreground" />
          </div>
          {isExpanded && (
            <div className="flex flex-col">
              <span className="font-bold text-foreground">iofold</span>
              <span className="text-xs text-muted-foreground">Evaluation Platform</span>
            </div>
          )}
        </div>
        <button
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            toggle()
          }}
          type="button"
          className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors duration-200"
          aria-label={isExpanded ? 'Collapse sidebar' : 'Expand sidebar'}
        >
          {isExpanded ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto p-3 scrollbar-thin">
        {navSections.map((section) => (
          <NavSectionComponent
            key={section.title}
            section={section}
            isExpanded={isExpanded}
          />
        ))}
      </nav>

      {/* User Section */}
      <div className="border-t border-border p-3">
        <button
          type="button"
          onClick={() => {
            // Programmatically trigger the UserButton click
            const button = userButtonRef.current?.querySelector('button')
            if (button) {
              button.click()
            }
          }}
          className={cn(
            'w-full flex items-center gap-3 p-2 rounded-lg hover:bg-accent transition-colors duration-200 cursor-pointer',
            !isExpanded && 'justify-center'
          )}
          aria-label="Open user menu"
        >
          <div ref={userButtonRef} className="flex-shrink-0">
            <UserButton
              afterSignOutUrl="/sign-in"
              appearance={{
                elements: {
                  avatarBox: 'w-8 h-8',
                  rootBox: 'static',
                },
              }}
            >
              <UserButton.MenuItems>
                <UserButton.Link
                  href="/settings"
                  label="Settings"
                  labelIcon={<Settings size={16} />}
                />
              </UserButton.MenuItems>
            </UserButton>
          </div>
          {isExpanded && isLoaded && user && (
            <div className="flex-1 min-w-0 text-left">
              <p className="text-sm font-medium text-foreground truncate">
                {user.fullName || 'User'}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {user.primaryEmailAddress?.emailAddress}
              </p>
            </div>
          )}
        </button>
      </div>
    </aside>
  )
}
