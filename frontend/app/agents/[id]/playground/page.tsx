'use client'

import { useState, useRef, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useRouter, useParams } from 'next/navigation'
import { apiClient } from '@/lib/api-client'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ErrorState } from '@/components/ui/error-state'
import { ArrowLeft, Send, RefreshCw, Copy, Check, Settings2, MessageSquare, Bot, User } from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'

interface Message {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: Date
}

export default function AgentPlaygroundPage() {
  const params = useParams()
  const agentId = params.id as string
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null)
  const [showSystemPrompt, setShowSystemPrompt] = useState(true)
  const [variableValues, setVariableValues] = useState<Record<string, string>>({})
  const [copied, setCopied] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const router = useRouter()

  const { data: agent, isLoading: agentLoading, error, refetch } = useQuery({
    queryKey: ['agent', agentId],
    queryFn: () => apiClient.getAgent(agentId),
  })

  // Set default version and variables when agent loads
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

  const handleSendMessage = async () => {
    if (!input.trim() || !selectedVersion) return

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date()
    }

    setMessages(prev => [...prev, userMessage])
    setInput('')
    setIsLoading(true)

    try {
      // Simulate AI response (in production, this would call an actual LLM)
      // For now, we generate a mock response based on the context
      await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 1000))

      const systemPrompt = getFilledPrompt()
      const mockResponse = generateMockResponse(systemPrompt, input.trim(), agent?.name || 'Agent')

      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: mockResponse,
        timestamp: new Date()
      }

      setMessages(prev => [...prev, assistantMessage])
    } catch (error) {
      toast.error('Failed to generate response')
    } finally {
      setIsLoading(false)
    }
  }

  const handleClearChat = () => {
    setMessages([])
  }

  const handleCopyConversation = async () => {
    const conversationText = messages.map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n\n')
    await navigator.clipboard.writeText(conversationText)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    toast.success('Conversation copied to clipboard')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
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
            className="border rounded px-2 py-1 text-sm"
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
            onClick={handleClearChat}
            disabled={messages.length === 0}
          >
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Configuration Panel */}
        {showSystemPrompt && (
          <div className="w-96 border-r overflow-y-auto bg-muted/30">
            <div className="p-4 space-y-4">
              <div>
                <h3 className="font-medium mb-2">System Prompt</h3>
                <div className="bg-background border rounded p-3 text-sm font-mono whitespace-pre-wrap max-h-64 overflow-y-auto">
                  {getFilledPrompt()}
                </div>
              </div>

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
              messages.map(message => (
                <div
                  key={message.id}
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
                    <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                    <p className="text-xs opacity-60 mt-1">
                      {message.timestamp.toLocaleTimeString()}
                    </p>
                  </div>
                </div>
              ))
            )}

            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-muted rounded-lg p-3">
                  <div className="flex items-center gap-2">
                    <Bot className="w-4 h-4" />
                    <span className="text-xs font-medium">{agent.name}</span>
                  </div>
                  <div className="flex items-center gap-1 mt-2">
                    <div className="w-2 h-2 bg-muted-foreground/40 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="w-2 h-2 bg-muted-foreground/40 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="w-2 h-2 bg-muted-foreground/40 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div className="border-t p-4">
            <div className="flex gap-2">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type your message..."
                className="flex-1 border rounded-lg px-3 py-2 resize-none"
                rows={2}
                disabled={isLoading}
              />
              <Button
                onClick={handleSendMessage}
                disabled={!input.trim() || isLoading}
                className="self-end"
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Press Enter to send, Shift+Enter for new line
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

// Mock response generator for testing (in production, this would be an actual LLM call)
function generateMockResponse(systemPrompt: string, userMessage: string, agentName: string): string {
  const responses: Record<string, string[]> = {
    greeting: [
      `Hello! I'm ${agentName}, and I'm here to help you. What can I assist you with today?`,
      `Hi there! Welcome. I'm ready to help you with any questions or tasks you have.`,
      `Greetings! I'm your ${agentName}. How may I be of service?`
    ],
    capabilities: [
      `I have several capabilities based on my training:\n\n1. I can answer questions about my domain\n2. I can help solve problems\n3. I can provide recommendations\n4. I can explain complex concepts\n\nWhat would you like to explore?`,
      `Great question! My main capabilities include:\n- Answering domain-specific questions\n- Helping with task completion\n- Providing detailed explanations\n- Offering recommendations\n\nHow can I help you today?`
    ],
    complex: [
      `Absolutely! I'd be happy to help with complex tasks. Could you provide more details about what you're trying to accomplish? The more context you give me, the better I can assist you.`,
      `Of course! I'm designed to handle complex tasks. Please describe what you need help with, and I'll do my best to guide you through it step by step.`
    ],
    default: [
      `Thank you for your message. Based on your input, I understand you're asking about "${userMessage.slice(0, 50)}..."\n\nLet me help you with that. Here's what I can tell you:\n\n1. First, consider the main aspects of your question\n2. Next, let's break it down into manageable parts\n3. Finally, I'll provide a comprehensive answer\n\nIs there anything specific you'd like me to elaborate on?`,
      `I appreciate you reaching out! Regarding "${userMessage.slice(0, 30)}...":\n\nBased on my understanding and the context you've provided, here are my thoughts:\n\n- This appears to be a question about [topic]\n- The key considerations are [aspects]\n- My recommendation would be [suggestion]\n\nWould you like me to go into more detail about any of these points?`
    ]
  }

  const lowerMessage = userMessage.toLowerCase()

  if (lowerMessage.includes('hello') || lowerMessage.includes('hi') || lowerMessage.includes('hey')) {
    return responses.greeting[Math.floor(Math.random() * responses.greeting.length)]
  }

  if (lowerMessage.includes('capabilities') || lowerMessage.includes('can you do') || lowerMessage.includes('what can')) {
    return responses.capabilities[Math.floor(Math.random() * responses.capabilities.length)]
  }

  if (lowerMessage.includes('complex') || lowerMessage.includes('difficult') || lowerMessage.includes('challenging')) {
    return responses.complex[Math.floor(Math.random() * responses.complex.length)]
  }

  return responses.default[Math.floor(Math.random() * responses.default.length)]
}
