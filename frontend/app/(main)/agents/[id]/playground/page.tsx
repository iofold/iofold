'use client'

import { useState, useRef, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useRouter } from '@/hooks/use-router-with-progress'
import { useParams, useSearchParams } from 'next/navigation'
import { apiClient } from '@/lib/api-client'
import { usePlaygroundChat, type Message, type ToolCall } from '@/hooks/use-playground-chat'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ErrorState } from '@/components/ui/error-state'
import { Textarea } from '@/components/ui/textarea'
import { ArrowLeft, Send, RefreshCw, Copy, Check, Settings2, MessageSquare, Bot, User, Loader2, AlertCircle, RotateCw, Terminal, StopCircle, Edit, Eye, Link as LinkIcon, ChevronDown, ChevronRight } from 'lucide-react'
import { MessageFeedback } from '@/components/playground/MessageFeedback'
import { SessionSidebar } from '@/components/playground/SessionSidebar'
import Link from 'next/link'
import { toast } from 'sonner'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

// Model configuration - synced with backend gateway.ts MODELS registry
// All models use provider-prefixed IDs for Cloudflare AI Gateway routing
const MODEL_OPTIONS = [
  // Anthropic - Claude 4.5 series
  { provider: 'anthropic', modelId: 'anthropic/claude-sonnet-4-5', label: 'Claude Sonnet 4.5' },
  { provider: 'anthropic', modelId: 'anthropic/claude-haiku-4-5', label: 'Claude Haiku 4.5' },
  { provider: 'anthropic', modelId: 'anthropic/claude-opus-4-5', label: 'Claude Opus 4.5' },
  // OpenAI - GPT-5 series
  { provider: 'openai', modelId: 'openai/gpt-5-mini', label: 'GPT-5 Mini' },
  { provider: 'openai', modelId: 'openai/gpt-5-nano', label: 'GPT-5 Nano' },
  // Google Vertex AI - Gemini 2.5 series
  { provider: 'google', modelId: 'google-vertex-ai/google/gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
  { provider: 'google', modelId: 'google-vertex-ai/google/gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
] as const

type ModelProvider = 'anthropic' | 'openai' | 'google'

export default function AgentPlaygroundPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const agentId = params.id as string
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null)
  const [showSystemPrompt, setShowSystemPrompt] = useState(true)
  const [variableValues, setVariableValues] = useState<Record<string, string>>({})
  const [copied, setCopied] = useState(false)
  const [linkCopied, setLinkCopied] = useState(false)
  const [modelProvider, setModelProvider] = useState<ModelProvider>('anthropic')
  const [modelId, setModelId] = useState('anthropic/claude-sonnet-4-5')
  const [input, setInput] = useState('')
  const [isEditingPrompt, setIsEditingPrompt] = useState(false)
  const [editedPrompt, setEditedPrompt] = useState('')
  const [isSavingVariant, setIsSavingVariant] = useState(false)
  // Track which messages have their tool calls expanded (by message id)
  // Streaming messages are always expanded, historical ones are collapsed by default
  const [expandedToolCalls, setExpandedToolCalls] = useState<Set<string>>(new Set())
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const router = useRouter()

  // Get initial session from URL if present
  const initialSessionFromUrl = searchParams.get('session')

  // Use the new SSE streaming hook
  const {
    messages,
    sendMessage,
    isLoading,
    error: chatError,
    sessionId,
    sessionVariables,
    retry,
    stop,
    clearMessages,
    submitFeedback,
    loadSession
  } = usePlaygroundChat(agentId, apiClient.getWorkspaceId(), initialSessionFromUrl || undefined)

  const { data: agent, isLoading: agentLoading, error, refetch } = useQuery({
    queryKey: ['agent', agentId],
    queryFn: () => apiClient.getAgent(agentId),
  })

  // Utility function to extract variables from template
  function extractVariables(template: string): string[] {
    const matches = template.match(/\{\{([^}]+)\}\}/g) || []
    return [...new Set(matches.map(m => m.replace(/[{}]/g, '').trim()))]
  }

  // Set default version, variables, and model when agent loads
  useEffect(() => {
    if (agent && !selectedVersionId) {
      const activeVersion = agent.versions.find(v => v.id === agent.active_version_id)
      if (activeVersion) {
        setSelectedVersionId(activeVersion.id)
        // Initialize variable values with defaults
        const defaults: Record<string, string> = {}
        // Handle variables as either array or object
        const vars = Array.isArray(activeVersion.variables)
          ? activeVersion.variables
          : (activeVersion.variables ? Object.keys(activeVersion.variables) : [])
        vars.forEach(v => {
          defaults[v] = `[${v}]`
        })
        setVariableValues(defaults)
      }
    }
  }, [agent, selectedVersionId])

  const selectedVersion = agent?.versions.find(v => v.id === selectedVersionId)

  // Sync variableValues when sessionVariables changes (e.g., when loading a session from URL)
  useEffect(() => {
    if (sessionVariables) {
      setVariableValues(sessionVariables)
    }
  }, [sessionVariables])

  // Initialize editedPrompt when active version changes
  useEffect(() => {
    if (selectedVersion?.prompt_template) {
      setEditedPrompt(selectedVersion.prompt_template)
      setIsEditingPrompt(false)
    }
  }, [selectedVersion?.prompt_template])

  // Handle model selection change
  const handleModelChange = (value: string) => {
    const selectedModel = MODEL_OPTIONS.find(m => `${m.provider}-${m.modelId}` === value)
    if (selectedModel) {
      setModelProvider(selectedModel.provider)
      setModelId(selectedModel.modelId)
    }
  }

  // Update URL when session changes
  useEffect(() => {
    if (sessionId) {
      const currentSession = searchParams.get('session')
      if (currentSession !== sessionId) {
        const newUrl = `/agents/${agentId}/playground?session=${sessionId}`
        router.replace(newUrl, { scroll: false })
      }
    }
  }, [sessionId, agentId, router, searchParams])

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const getFilledPrompt = (): string => {
    if (!selectedVersion) return ''
    const template = isEditingPrompt ? editedPrompt : selectedVersion.prompt_template
    return template.replace(
      /\{\{(\w+)\}\}/g,
      (_, key) => variableValues[key] || `{{${key}}}`
    )
  }

  const hasPromptChanged = editedPrompt !== selectedVersion?.prompt_template

  const handleSaveVariant = async () => {
    if (!hasPromptChanged) return

    setIsSavingVariant(true)
    try {
      const variables = extractVariables(editedPrompt)
      const response = await fetch(`/v1/api/agents/${agentId}/versions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Workspace-Id': apiClient.getWorkspaceId()
        },
        body: JSON.stringify({
          prompt_template: editedPrompt,
          variables
        })
      })

      if (response.ok) {
        const newVersion = await response.json()
        toast.success(`Created version ${newVersion.version} (candidate)`)
        setIsEditingPrompt(false)
        // Refetch agent data to show new version
        await refetch()
      } else {
        toast.error('Failed to create variant')
      }
    } catch (err) {
      console.error('Failed to create variant:', err)
      toast.error('Failed to create variant')
    } finally {
      setIsSavingVariant(false)
    }
  }

  const handleResetPrompt = () => {
    if (selectedVersion?.prompt_template) {
      setEditedPrompt(selectedVersion.prompt_template)
      toast.success('Prompt reset to current version')
    }
  }

  const handleClearChat = () => {
    clearMessages()
    toast.success('Chat cleared')
  }

  const handleNewSession = () => {
    clearMessages()
    // Clear the session param from URL
    router.replace(`/agents/${agentId}/playground`, { scroll: false })
    toast.success('New session started')
  }

  const handleCopyConversation = async () => {
    const conversationText = messages.map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n\n')
    await navigator.clipboard.writeText(conversationText)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    toast.success('Conversation copied to clipboard')
  }

  const handleCopyLink = async () => {
    if (!sessionId) {
      toast.error('No session available to share')
      return
    }
    const sessionUrl = `${window.location.origin}/agents/${agentId}/playground?session=${sessionId}`
    await navigator.clipboard.writeText(sessionUrl)
    setLinkCopied(true)
    setTimeout(() => setLinkCopied(false), 2000)
    toast.success('Session link copied to clipboard')
  }

  const handleSelectSession = async (selectedSessionId: string) => {
    if (selectedSessionId === sessionId) return
    try {
      const sessionData = await loadSession(selectedSessionId)
      // Restore variables from the loaded session
      if (sessionData?.variables && typeof sessionData.variables === 'object') {
        setVariableValues(sessionData.variables as Record<string, string>)
      }
    } catch (err) {
      console.error('Failed to load session:', err)
    }
  }

  const handleSendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!input.trim() || !selectedVersionId) return

    const messageContent = input.trim()
    setInput('')

    // Call sendMessage from the hook with options
    await sendMessage(messageContent, {
      systemPrompt: getFilledPrompt(),
      modelProvider,
      modelId,
      agentVersionId: selectedVersionId,
      variables: variableValues,
    })
  }

  if (agentLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-center h-64">
          <RefreshCw className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    )
  }

  if (error || !agent) {
    return (
      <div className="container mx-auto px-4 py-8">
        <ErrorState
          title="Failed to load agent"
          message="There was an error loading the agent. Please try again."
          error={error as Error}
          onRetry={() => refetch()}
        />
      </div>
    )
  }

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <div className="border-b px-4 py-3 flex items-center justify-between bg-background">
        <div className="flex items-center gap-4">
          <Link href={`/agents/${params.id}`}>
            <Button variant="ghost" size="sm">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
          </Link>
          <div>
            <h1 className="text-lg font-semibold flex items-center gap-2">
              <Bot className="w-5 h-5" />
              {agent.name} Playground
            </h1>
            <p className="text-xs text-muted-foreground">
              Test your agent with different inputs
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Model selector */}
          <Select value={`${modelProvider}-${modelId}`} onValueChange={handleModelChange}>
            <SelectTrigger className="w-[180px] h-9">
              <SelectValue placeholder="Select model" />
            </SelectTrigger>
            <SelectContent>
              {MODEL_OPTIONS.map((option) => (
                <SelectItem key={`${option.provider}-${option.modelId}`} value={`${option.provider}-${option.modelId}`}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Version selector */}
          <select
            value={selectedVersionId || ''}
            onChange={(e) => {
              const newVersion = agent.versions.find(v => v.id === e.target.value)
              setSelectedVersionId(e.target.value)
              if (newVersion) {
                const defaults: Record<string, string> = {}
                // Handle variables as either array or object
                const vars = Array.isArray(newVersion.variables)
                  ? newVersion.variables
                  : (newVersion.variables ? Object.keys(newVersion.variables) : [])
                vars.forEach(v => {
                  defaults[v] = variableValues[v] || `[${v}]`
                })
                setVariableValues(defaults)
              }
            }}
            className="border rounded px-2 py-1 text-sm h-9"
          >
            {agent.versions.map(v => (
              <option key={v.id} value={v.id}>
                v{v.version} {v.id === agent.active_version_id ? '(active)' : ''}
              </option>
            ))}
          </select>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowSystemPrompt(!showSystemPrompt)}
          >
            <Settings2 className="w-4 h-4 mr-1" />
            {showSystemPrompt ? 'Hide' : 'Show'} Config
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleCopyConversation}
            disabled={messages.length === 0}
            title="Copy Conversation"
          >
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleCopyLink}
            disabled={!sessionId}
            title="Copy Session Link"
          >
            {linkCopied ? <Check className="w-4 h-4" /> : <LinkIcon className="w-4 h-4" />}
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleNewSession}
            disabled={isLoading}
            title="New Session"
          >
            <RefreshCw className="w-4 h-4 mr-1" />
            New
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleClearChat}
            disabled={messages.length === 0}
            title="Clear Chat"
          >
            Clear
          </Button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Session Sidebar */}
        <SessionSidebar
          agentId={agentId}
          currentSessionId={sessionId}
          onSelectSession={handleSelectSession}
          onNewSession={handleNewSession}
        />

        {/* Configuration Panel */}
        {showSystemPrompt && (
          <div className="w-96 border-r overflow-y-auto bg-muted/30">
            <div className="p-4 space-y-4">
              <div>
                <h3 className="font-medium mb-2">Model</h3>
                <div className="bg-background border rounded p-2 text-sm">
                  <p className="font-medium">{MODEL_OPTIONS.find(m => m.provider === modelProvider && m.modelId === modelId)?.label}</p>
                  <p className="text-xs text-muted-foreground mt-1">{modelProvider} / {modelId}</p>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-medium">System Prompt</h3>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsEditingPrompt(!isEditingPrompt)}
                    className="h-7 px-2"
                  >
                    {isEditingPrompt ? (
                      <>
                        <Eye className="w-3 h-3 mr-1" />
                        Preview
                      </>
                    ) : (
                      <>
                        <Edit className="w-3 h-3 mr-1" />
                        Edit
                      </>
                    )}
                  </Button>
                </div>

                {isEditingPrompt ? (
                  <>
                    <Textarea
                      value={editedPrompt}
                      onChange={(e) => setEditedPrompt(e.target.value)}
                      className="font-mono text-sm min-h-[200px] resize-y"
                      placeholder="Enter prompt template with {{variables}}..."
                    />
                    {hasPromptChanged && (
                      <div className="flex gap-2 mt-2">
                        <Button
                          size="sm"
                          onClick={handleSaveVariant}
                          disabled={isSavingVariant}
                          className="flex-1"
                        >
                          {isSavingVariant ? (
                            <>
                              <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                              Saving...
                            </>
                          ) : (
                            'Save as Variant'
                          )}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={handleResetPrompt}
                          disabled={isSavingVariant}
                        >
                          Reset
                        </Button>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="bg-background border rounded p-3 text-sm font-mono whitespace-pre-wrap max-h-64 overflow-y-auto">
                    {getFilledPrompt()}
                  </div>
                )}
              </div>

              {sessionId && (
                <div>
                  <h3 className="font-medium mb-2">Session</h3>
                  <div className="bg-background border rounded p-2 text-xs font-mono break-all">
                    {sessionId}
                  </div>
                </div>
              )}

              {selectedVersion && selectedVersion.variables.length > 0 && (
                <div>
                  <h3 className="font-medium mb-2">Variables</h3>
                  <div className="space-y-2">
                    {selectedVersion.variables.map(variable => (
                      <div key={variable}>
                        <label className="text-xs text-muted-foreground block mb-1">
                          {`{{${variable}}}`}
                        </label>
                        <input
                          type="text"
                          value={variableValues[variable] || ''}
                          onChange={(e) => setVariableValues(prev => ({
                            ...prev,
                            [variable]: e.target.value
                          }))}
                          className="w-full border rounded px-2 py-1 text-sm"
                          placeholder={`Enter ${variable}...`}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <h3 className="font-medium mb-2">Quick Actions</h3>
                <div className="space-y-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full justify-start"
                    onClick={() => setInput('Hello, how can you help me?')}
                  >
                    <MessageSquare className="w-4 h-4 mr-2" />
                    Greeting
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full justify-start"
                    onClick={() => setInput('What are your capabilities?')}
                  >
                    <MessageSquare className="w-4 h-4 mr-2" />
                    Capabilities
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full justify-start"
                    onClick={() => setInput('Can you help me with a complex task?')}
                  >
                    <MessageSquare className="w-4 h-4 mr-2" />
                    Complex Task
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Chat Area */}
        <div className="flex-1 flex flex-col">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <Bot className="w-16 h-16 mx-auto text-muted-foreground/30 mb-4" />
                  <h3 className="text-lg font-medium text-muted-foreground">Start a conversation</h3>
                  <p className="text-sm text-muted-foreground/70">
                    Test your agent by sending a message below
                  </p>
                </div>
              </div>
            ) : (
              messages.map((message, index) => {
                const hasToolCalls = message.toolCalls && message.toolCalls.length > 0
                const isUser = message.role === 'user'

                return (
                  <div
                    key={message.id || index}
                    className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[80%] rounded-lg p-3 ${
                        isUser
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted'
                      }`}
                    >
                      {/* Message Header */}
                      <div className="flex items-center gap-2 mb-1">
                        {isUser ? (
                          <User className="w-4 h-4" />
                        ) : (
                          <Bot className="w-4 h-4" />
                        )}
                        <span className="text-xs font-medium">
                          {isUser ? 'You' : agent.name}
                        </span>
                        {message.isStreaming && (
                          <span className="animate-pulse text-xs">●</span>
                        )}
                      </div>

                      {/* Message Content */}
                      {message.content && (
                        <p className="text-sm whitespace-pre-wrap">
                          {message.content}
                          {message.isStreaming && <span className="animate-pulse ml-1">▊</span>}
                        </p>
                      )}

                      {/* Tool Calls - Collapsible for historical, always expanded for streaming */}
                      {hasToolCalls && (() => {
                        const isExpanded = message.isStreaming || expandedToolCalls.has(message.id)
                        const toolCount = message.toolCalls?.length || 0
                        const toggleExpanded = () => {
                          if (message.isStreaming) return // Don't allow collapsing streaming messages
                          setExpandedToolCalls(prev => {
                            const next = new Set(prev)
                            if (next.has(message.id)) {
                              next.delete(message.id)
                            } else {
                              next.add(message.id)
                            }
                            return next
                          })
                        }

                        return (
                          <div className="mt-2">
                            {/* Collapsible Header */}
                            <button
                              onClick={toggleExpanded}
                              className={`flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors ${message.isStreaming ? 'cursor-default' : 'cursor-pointer'}`}
                              disabled={message.isStreaming}
                            >
                              {isExpanded ? (
                                <ChevronDown className="w-3 h-3" />
                              ) : (
                                <ChevronRight className="w-3 h-3" />
                              )}
                              <Terminal className="w-3 h-3" />
                              <span>{toolCount} tool call{toolCount !== 1 ? 's' : ''}</span>
                            </button>

                            {/* Tool Call Details */}
                            {isExpanded && (
                              <div className="mt-2 space-y-2">
                                {message.toolCalls?.map((tool, toolIndex) => (
                                  <div
                                    key={tool.id || toolIndex}
                                    className={`bg-background/50 border rounded p-2 text-xs ${
                                      tool.state === 'error' ? 'border-destructive/50' : ''
                                    }`}
                                  >
                                    {/* Tool Header */}
                                    <div className="flex items-center gap-1 font-medium mb-1">
                                      <Terminal className="w-3 h-3" />
                                      <span>{tool.name}</span>
                                      {tool.state === 'pending' && <span className="text-muted-foreground ml-1">(pending)</span>}
                                      {tool.state === 'executing' && <Loader2 className="w-3 h-3 animate-spin ml-1" />}
                                      {tool.state === 'completed' && <Check className="w-3 h-3 text-green-500 ml-1" />}
                                      {tool.state === 'error' && <AlertCircle className="w-3 h-3 text-destructive ml-1" />}
                                      {tool.latencyMs && (
                                        <span className="text-muted-foreground ml-auto text-[10px]">
                                          {tool.latencyMs}ms
                                        </span>
                                      )}
                                    </div>

                                    {/* Tool Arguments */}
                                    {tool.args && Object.keys(tool.args as object).length > 0 && (
                                      <div className="mt-1 font-mono text-muted-foreground">
                                        <span className="font-semibold">Args:</span>{' '}
                                        <pre className="inline whitespace-pre-wrap">{JSON.stringify(tool.args, null, 2)}</pre>
                                      </div>
                                    )}

                                    {/* Tool Result */}
                                    {tool.result !== undefined && (
                                      <div className="mt-1 font-mono">
                                        <span className="font-semibold">Result:</span>{' '}
                                        <pre className="inline whitespace-pre-wrap">
                                          {typeof tool.result === 'string'
                                            ? tool.result
                                            : JSON.stringify(tool.result, null, 2)}
                                        </pre>
                                      </div>
                                    )}

                                    {/* Tool Error */}
                                    {tool.error && (
                                      <div className="mt-1 font-mono text-destructive">
                                        <span className="font-semibold">Error:</span> {tool.error}
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )
                      })()}

                      {/* Error Message */}
                      {message.error && (
                        <div className="mt-2 flex items-start gap-2 p-2 bg-destructive/10 border border-destructive/20 rounded">
                          <AlertCircle className="w-4 h-4 text-destructive flex-shrink-0 mt-0.5" />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-destructive break-words">{message.error}</p>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => retry(message.id)}
                              className="mt-2 h-7 text-xs"
                            >
                              <RotateCw className="w-3 h-3 mr-1" />
                              Retry
                            </Button>
                          </div>
                        </div>
                      )}

                      {/* Timestamp */}
                      <p className="text-xs opacity-60 mt-1">
                        {new Date(message.timestamp).toLocaleTimeString()}
                      </p>

                      {/* Feedback UI for assistant messages */}
                      {!isUser && !message.isStreaming && message.traceId && (
                        <div className="mt-2 pt-2 border-t border-border/50">
                          <MessageFeedback
                            messageId={message.id}
                            currentRating={message.feedbackRating}
                            disabled={isLoading}
                            onSubmit={submitFeedback}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                )
              })
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div className="border-t p-4">
            <form onSubmit={handleSendMessage} className="space-y-2">
              <div className="flex gap-2">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Type your message..."
                  className="flex-1 border rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                  rows={2}
                  disabled={isLoading || !selectedVersionId}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      handleSendMessage()
                    }
                  }}
                />
                {isLoading ? (
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={stop}
                    className="self-end"
                    title="Stop generation"
                  >
                    <StopCircle className="w-4 h-4" />
                  </Button>
                ) : (
                  <Button
                    type="submit"
                    disabled={!input.trim() || !selectedVersionId}
                    className="self-end"
                  >
                    <Send className="w-4 h-4" />
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Press Enter to send, Shift+Enter for new line
              </p>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}

