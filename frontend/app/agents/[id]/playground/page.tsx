'use client'

import { useState, useRef, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useRouter, useParams } from 'next/navigation'
// Note: useChat will be fully integrated once the backend API is implemented
// import { useChat } from '@ai-sdk/react'
import { apiClient } from '@/lib/api-client'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ErrorState } from '@/components/ui/error-state'
import { ArrowLeft, Send, RefreshCw, Copy, Check, Settings2, MessageSquare, Bot, User, Loader2, Wrench } from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface Message {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: Date
  toolCalls?: Array<{
    id: string
    name: string
    args: Record<string, any>
    result?: any
    state?: 'call' | 'result'
  }>
}

// Model configuration matching design doc
const MODEL_OPTIONS = [
  { provider: 'anthropic', modelId: 'claude-sonnet-4-5-20250929', label: 'Claude Sonnet 4.5' },
  { provider: 'openai', modelId: 'gpt-4o', label: 'GPT-4o' },
  { provider: 'google', modelId: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
] as const

type ModelProvider = 'anthropic' | 'openai' | 'google'

export default function AgentPlaygroundPage() {
  const params = useParams()
  const agentId = params.id as string
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null)
  const [showSystemPrompt, setShowSystemPrompt] = useState(true)
  const [variableValues, setVariableValues] = useState<Record<string, string>>({})
  const [copied, setCopied] = useState(false)
  const [sessionId, setSessionId] = useState<string | undefined>()
  const [modelProvider, setModelProvider] = useState<ModelProvider>('anthropic')
  const [modelId, setModelId] = useState('claude-sonnet-4-5-20250929')
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const router = useRouter()

  // Note: Once the backend API endpoint is implemented, we'll integrate useChat from @ai-sdk/react
  // For now, we're using a basic fetch implementation with the correct API structure

  const { data: agent, isLoading: agentLoading, error, refetch } = useQuery({
    queryKey: ['agent', agentId],
    queryFn: () => apiClient.getAgent(agentId),
  })

  // Set default version, variables, and model when agent loads
  useEffect(() => {
    if (agent && !selectedVersionId) {
      const activeVersion = agent.versions.find(v => v.id === agent.active_version_id)
      if (activeVersion) {
        setSelectedVersionId(activeVersion.id)
        // Initialize variable values with defaults
        const defaults: Record<string, string> = {}
        activeVersion.variables.forEach(v => {
          defaults[v] = `[${v}]`
        })
        setVariableValues(defaults)
      }
    }
  }, [agent, selectedVersionId])

  // Handle model selection change
  const handleModelChange = (value: string) => {
    const selectedModel = MODEL_OPTIONS.find(m => `${m.provider}-${m.modelId}` === value)
    if (selectedModel) {
      setModelProvider(selectedModel.provider)
      setModelId(selectedModel.modelId)
    }
  }

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const selectedVersion = agent?.versions.find(v => v.id === selectedVersionId)

  const getFilledPrompt = (): string => {
    if (!selectedVersion) return ''
    return selectedVersion.prompt_template.replace(
      /\{\{(\w+)\}\}/g,
      (_, key) => variableValues[key] || `{{${key}}}`
    )
  }

  const handleClearChat = () => {
    setMessages([])
    setSessionId(undefined)
    toast.success('Chat cleared')
  }

  const handleNewSession = () => {
    setMessages([])
    setSessionId(undefined)
    toast.success('New session started')
  }

  const handleCopyConversation = async () => {
    const conversationText = messages.map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n\n')
    await navigator.clipboard.writeText(conversationText)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    toast.success('Conversation copied to clipboard')
  }

  const handleSendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!input.trim() || !selectedVersionId) return

    // Add user message to state
    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date(),
    }

    setMessages(prev => [...prev, userMessage])
    setInput('')
    setIsLoading(true)

    try {
      // Call the API endpoint (will be implemented in backend)
      const response = await fetch(`/api/agents/${agentId}/playground/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: [...messages, userMessage],
          sessionId,
          variables: variableValues,
          modelProvider,
          modelId,
          agentVersionId: selectedVersionId,
        }),
      })

      if (!response.ok) {
        throw new Error(`API error: ${response.statusText}`)
      }

      // For now, show a message that backend is not implemented
      // When backend is ready, this will handle streaming responses
      toast.info('Backend API endpoint not yet implemented. Message sent to mock endpoint.')

      // TODO: When backend is ready, implement streaming response handling here
      // const reader = response.body?.getReader()
      // Handle streaming chunks and update messages

    } catch (error) {
      console.error('Failed to send message:', error)
      toast.error('Failed to send message. The backend API endpoint is not yet implemented.')
    } finally {
      setIsLoading(false)
    }
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
                newVersion.variables.forEach(v => {
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
          >
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
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
                <h3 className="font-medium mb-2">System Prompt</h3>
                <div className="bg-background border rounded p-3 text-sm font-mono whitespace-pre-wrap max-h-64 overflow-y-auto">
                  {getFilledPrompt()}
                </div>
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

                return (
                  <div
                    key={message.id || index}
                    className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[80%] rounded-lg p-3 ${
                        message.role === 'user'
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        {message.role === 'user' ? (
                          <User className="w-4 h-4" />
                        ) : (
                          <Bot className="w-4 h-4" />
                        )}
                        <span className="text-xs font-medium">
                          {message.role === 'user' ? 'You' : agent.name}
                        </span>
                      </div>

                      {message.content && (
                        <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                      )}

                      {/* Tool invocations */}
                      {hasToolCalls && (
                        <div className="mt-2 space-y-2">
                          {message.toolCalls?.map((tool, toolIndex) => (
                            <div key={tool.id || toolIndex} className="bg-background/50 border rounded p-2 text-xs">
                              <div className="flex items-center gap-1 font-medium mb-1">
                                <Wrench className="w-3 h-3" />
                                <span>{tool.name}</span>
                                {tool.state === 'call' && <Loader2 className="w-3 h-3 animate-spin ml-1" />}
                              </div>
                              {tool.args && (
                                <div className="mt-1 font-mono text-muted-foreground">
                                  Args: {JSON.stringify(tool.args)}
                                </div>
                              )}
                              {tool.result && (
                                <div className="mt-1 font-mono">
                                  Result: {typeof tool.result === 'string' ? tool.result : JSON.stringify(tool.result)}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      <p className="text-xs opacity-60 mt-1">
                        {new Date(message.timestamp).toLocaleTimeString()}
                      </p>
                    </div>
                  </div>
                )
              })
            )}

            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-muted rounded-lg p-3">
                  <div className="flex items-center gap-2">
                    <Bot className="w-4 h-4" />
                    <span className="text-xs font-medium">{agent.name}</span>
                  </div>
                  <div className="flex items-center gap-1 mt-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="text-xs text-muted-foreground">Thinking...</span>
                  </div>
                </div>
              </div>
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
                <Button
                  type="submit"
                  disabled={!input.trim() || isLoading || !selectedVersionId}
                  className="self-end"
                >
                  {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </Button>
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

