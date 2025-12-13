'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Clock, MessageSquare, Plus, Sparkles, Trash2, FileJson, FileText, Loader2, MoreVertical } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { exportSessionAsJson, exportSessionAsMarkdown } from '@/lib/session-utils'

export interface PlaygroundSession {
  id: string
  agentVersionId: string
  modelProvider: string
  modelId: string
  messageCount?: number
  createdAt: string
  updatedAt: string
}

interface SessionSidebarProps {
  agentId: string
  currentSessionId?: string
  onSelectSession: (sessionId: string) => void
  onNewSession: () => void
}

// Format date to relative time
function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// Get model display name - synced with backend gateway.ts MODELS registry
function getModelLabel(provider: string, modelId: string): string {
  const modelMap: Record<string, string> = {
    // Anthropic - Claude 4.5 series
    'anthropic/claude-sonnet-4-5': 'Claude Sonnet 4.5',
    'anthropic/claude-haiku-4-5': 'Claude Haiku 4.5',
    'anthropic/claude-opus-4-5': 'Claude Opus 4.5',
    // OpenAI - GPT-5 series
    'openai/gpt-5-mini': 'GPT-5 Mini',
    'openai/gpt-5-nano': 'GPT-5 Nano',
    // Google Vertex AI - Gemini 2.5 series
    'google-vertex-ai/google/gemini-2.5-flash': 'Gemini 2.5 Flash',
    'google-vertex-ai/google/gemini-2.5-pro': 'Gemini 2.5 Pro',
  }
  return modelMap[modelId] || modelId
}

export function SessionSidebar({
  agentId,
  currentSessionId,
  onSelectSession,
  onNewSession,
}: SessionSidebarProps) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [sessionToDelete, setSessionToDelete] = useState<string | null>(null)
  const queryClient = useQueryClient()

  const { data, isLoading, error } = useQuery({
    queryKey: ['playground-sessions', agentId],
    queryFn: () => apiClient.listPlaygroundSessions(agentId),
    refetchInterval: 30000, // Refetch every 30 seconds
  })

  const sessions = data?.sessions || []

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (sessionId: string) => apiClient.deletePlaygroundSession(agentId, sessionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['playground-sessions', agentId] })
      toast.success('Session deleted successfully')
      setDeleteDialogOpen(false)
      setSessionToDelete(null)
    },
    onError: (error: Error) => {
      toast.error('Failed to delete session', {
        description: error.message,
      })
    },
  })

  // Handle delete click
  const handleDeleteClick = (sessionId: string) => {
    setSessionToDelete(sessionId)
    setDeleteDialogOpen(true)
  }

  // Handle delete confirm
  const handleDeleteConfirm = () => {
    if (sessionToDelete) {
      deleteMutation.mutate(sessionToDelete)
    }
  }

  return (
    <div className="w-80 border-r bg-muted/30 flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b bg-background">
        <Button
          onClick={onNewSession}
          className="w-full"
          size="sm"
        >
          <Plus className="w-4 h-4 mr-2" />
          New Session
        </Button>
      </div>

      {/* Sessions List */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-2 space-y-1">
          {isLoading ? (
            // Loading state
            <div className="space-y-2 p-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              ))}
            </div>
          ) : error ? (
            // Error state
            <div className="p-4 text-center">
              <p className="text-sm text-muted-foreground mb-2">
                Failed to load sessions
              </p>
              <p className="text-xs text-muted-foreground">
                {error instanceof Error ? error.message : 'Unknown error'}
              </p>
            </div>
          ) : sessions.length === 0 ? (
            // Empty state
            <div className="p-6 text-center">
              <Sparkles className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
              <p className="text-sm font-medium text-muted-foreground mb-1">
                No sessions yet
              </p>
              <p className="text-xs text-muted-foreground">
                Start a new session to begin testing your agent
              </p>
            </div>
          ) : (
            // Sessions list
            sessions.map((session) => (
              <SessionItem
                key={session.id}
                session={session}
                agentId={agentId}
                isActive={session.id === currentSessionId}
                onClick={() => onSelectSession(session.id)}
                onDelete={() => handleDeleteClick(session.id)}
              />
            ))
          )}
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Session</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this session? This action cannot be undone.
              All messages and history will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={deleteMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Delete'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

interface SessionItemProps {
  session: PlaygroundSession
  agentId: string
  isActive: boolean
  onClick: () => void
  onDelete: () => void
}

function SessionItem({ session, agentId, isActive, onClick, onDelete }: SessionItemProps) {
  const [exportingFormat, setExportingFormat] = useState<'json' | 'markdown' | null>(null)

  // Optionally fetch message count for each session
  const { data: details } = useQuery({
    queryKey: ['session-details', session.id],
    queryFn: () => apiClient.getPlaygroundSession(agentId, session.id),
    enabled: isActive, // Only fetch for active session to reduce load
  })

  // Handle export
  const handleExport = async (format: 'json' | 'markdown') => {
    setExportingFormat(format)
    try {
      // Fetch session with messages
      const sessionData = await apiClient.getPlaygroundSession(agentId, session.id)

      if (!sessionData || !sessionData.messages || sessionData.messages.length === 0) {
        toast.error('Cannot export empty session')
        return
      }

      // Export based on format
      if (format === 'json') {
        exportSessionAsJson(sessionData.messages, 'Agent', session.id)
        toast.success('Session exported as JSON')
      } else {
        exportSessionAsMarkdown(sessionData.messages, 'Agent', session.id)
        toast.success('Session exported as Markdown')
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      toast.error('Failed to export session', {
        description: errorMessage,
      })
    } finally {
      setExportingFormat(null)
    }
  }

  return (
    <div
      className={cn(
        'w-full group rounded-lg transition-all relative',
        'hover:bg-accent/50',
        isActive && 'bg-accent border border-border shadow-sm'
      )}
    >
      <button
        onClick={onClick}
        className="w-full text-left p-3 pr-10"
      >
        {/* Session info */}
        <div className="space-y-1.5">
          {/* Top row - Model and time */}
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium truncate flex-1">
              {getModelLabel(session.modelProvider, session.modelId)}
            </span>
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              <Clock className="w-3 h-3 inline mr-1" />
              {formatRelativeTime(session.updatedAt)}
            </span>
          </div>

          {/* Bottom row - Message count */}
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <MessageSquare className="w-3 h-3" />
            <span>
              {details?.messages?.length !== undefined
                ? `${details.messages.length} messages`
                : 'Session'}
            </span>
          </div>

          {/* Session ID preview (for debugging) */}
          <div className="text-[10px] text-muted-foreground/60 font-mono truncate">
            {session.id}
          </div>
        </div>
      </button>

      {/* Actions Menu */}
      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreVertical className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation()
                handleExport('json')
              }}
              disabled={exportingFormat !== null}
            >
              {exportingFormat === 'json' ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <FileJson className="w-4 h-4 mr-2" />
              )}
              Export as JSON
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation()
                handleExport('markdown')
              }}
              disabled={exportingFormat !== null}
            >
              {exportingFormat === 'markdown' ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <FileText className="w-4 h-4 mr-2" />
              )}
              Export as Markdown
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation()
                onDelete()
              }}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete Session
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}
