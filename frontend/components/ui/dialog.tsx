import * as React from "react"
import { cn } from "@/lib/utils"
import { X } from "lucide-react"

interface DialogContextValue {
  open: boolean
  onOpenChange: (open: boolean) => void
  titleId: string
}

const DialogContext = React.createContext<DialogContextValue | undefined>(undefined)

function useDialog() {
  const context = React.useContext(DialogContext)
  if (!context) {
    throw new Error("Dialog components must be used within a Dialog")
  }
  return context
}

interface DialogProps {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  children: React.ReactNode
}

export function Dialog({ open, onOpenChange, children }: DialogProps) {
  const titleId = React.useId()

  return (
    <DialogContext.Provider value={{ open: open || false, onOpenChange: onOpenChange || (() => {}), titleId }}>
      {children}
    </DialogContext.Provider>
  )
}

interface DialogTriggerProps {
  asChild?: boolean
  children: React.ReactNode
}

export function DialogTrigger({ asChild, children }: DialogTriggerProps) {
  const { onOpenChange } = useDialog()

  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children, {
      onClick: () => onOpenChange(true),
    } as any)
  }

  return (
    <button onClick={() => onOpenChange(true)}>
      {children}
    </button>
  )
}

interface DialogContentProps {
  className?: string
  children: React.ReactNode
}

export function DialogContent({ className, children }: DialogContentProps) {
  const { open, onOpenChange, titleId } = useDialog()
  const dialogRef = React.useRef<HTMLDivElement>(null)
  const previousFocusRef = React.useRef<HTMLElement | null>(null)

  React.useEffect(() => {
    if (!open) return

    // Store previously focused element
    previousFocusRef.current = document.activeElement as HTMLElement

    // Focus first focusable element in modal
    const focusableElements = dialogRef.current?.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    )
    if (focusableElements && focusableElements.length > 0) {
      (focusableElements[0] as HTMLElement).focus()
    }

    // Trap focus within modal
    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return

      const focusable = Array.from(focusableElements || []) as HTMLElement[]
      const firstFocusable = focusable[0]
      const lastFocusable = focusable[focusable.length - 1]

      if (e.shiftKey) {
        if (document.activeElement === firstFocusable) {
          e.preventDefault()
          lastFocusable.focus()
        }
      } else {
        if (document.activeElement === lastFocusable) {
          e.preventDefault()
          firstFocusable.focus()
        }
      }
    }

    // Handle escape key
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onOpenChange(false)
      }
    }

    document.addEventListener('keydown', handleTab)
    document.addEventListener('keydown', handleEscape)

    return () => {
      document.removeEventListener('keydown', handleTab)
      document.removeEventListener('keydown', handleEscape)
      // Restore focus on close
      previousFocusRef.current?.focus()
    }
  }, [open, onOpenChange])

  if (!open) return null

  return (
    <>
      <div
        className="fixed inset-0 z-50 bg-black/50"
        onClick={() => onOpenChange(false)}
        aria-hidden="true"
      />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          className={cn(
            "relative w-full max-w-lg bg-white rounded-lg shadow-lg",
            className
          )}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => onOpenChange(false)}
            aria-label="Close dialog"
            className="absolute right-4 top-4 rounded-sm opacity-70 hover:opacity-100 transition-opacity"
          >
            <X className="h-4 w-4" aria-hidden="true" />
            <span className="sr-only">Close</span>
          </button>
          {children}
        </div>
      </div>
    </>
  )
}

export function DialogHeader({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("flex flex-col space-y-1.5 px-6 py-4", className)}>
      {children}
    </div>
  )
}

export function DialogTitle({ className, children }: { className?: string; children: React.ReactNode }) {
  const { titleId } = useDialog()

  return (
    <h2 id={titleId} className={cn("text-lg font-semibold leading-none tracking-tight", className)}>
      {children}
    </h2>
  )
}

export function DialogDescription({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <p className={cn("text-sm text-muted-foreground", className)}>
      {children}
    </p>
  )
}

export function DialogFooter({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("flex justify-end gap-2 px-6 py-4", className)}>
      {children}
    </div>
  )
}
