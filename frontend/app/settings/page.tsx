'use client'

import { useState, useEffect } from 'react'
import { useTheme } from 'next-themes'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  User,
  Mail,
  Bell,
  Key,
  Palette,
  Shield,
  Upload,
  Copy,
  Download,
  RefreshCw,
  Save,
  Trash2,
  Eye,
  EyeOff,
  Check,
  AlertTriangle,
  Slack
} from 'lucide-react'
import { cn } from '@/lib/utils'

export default function SettingsPage() {
  // Profile state
  const [displayName, setDisplayName] = useState('John Doe')
  const [email] = useState('john.doe@example.com')
  const [avatarUrl, setAvatarUrl] = useState('')

  // Notification state
  const [emailNotifications, setEmailNotifications] = useState(true)
  const [slackIntegration, setSlackIntegration] = useState(false)
  const [errorThreshold, setErrorThreshold] = useState('5')
  const [costThreshold, setCostThreshold] = useState('100')

  // API Configuration state
  const [apiKey] = useState('iof_sk_1a2b3c4d5e6f7g8h9i0j')
  const [showApiKey, setShowApiKey] = useState(false)
  const [webhookUrl, setWebhookUrl] = useState('https://api.example.com/webhooks/iofold')
  const [apiKeyCopied, setApiKeyCopied] = useState(false)

  // Theme state
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const [accentColor, setAccentColor] = useState('#4ECFA5')

  useEffect(() => {
    setMounted(true)
  }, [])

  // Save state
  const [isSaving, setIsSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)

  // Mock avatar upload
  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onloadend = () => {
        setAvatarUrl(reader.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  // Copy API key
  const copyApiKey = () => {
    navigator.clipboard.writeText(apiKey)
    setApiKeyCopied(true)
    setTimeout(() => setApiKeyCopied(false), 2000)
  }

  // Mock regenerate API key
  const regenerateApiKey = () => {
    if (confirm('Are you sure you want to regenerate your API key? Your existing key will stop working immediately.')) {
      alert('API key regenerated! (Mock action)')
    }
  }

  // Mock save changes
  const handleSaveChanges = async () => {
    setIsSaving(true)
    setSaveSuccess(false)

    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1500))

    setIsSaving(false)
    setSaveSuccess(true)
    setTimeout(() => setSaveSuccess(false), 3000)
  }

  // Mock export data
  const handleExportData = () => {
    alert('Your data export will be sent to your email within 24 hours.')
  }

  // Mock delete account
  const handleDeleteAccount = () => {
    if (confirm('Are you absolutely sure? This action cannot be undone. All your data will be permanently deleted.')) {
      if (confirm('This is your final warning. Type DELETE to confirm (this is a mock - no actual deletion will occur)')) {
        alert('Account deletion initiated (Mock action)')
      }
    }
  }

  const maskApiKey = (key: string) => {
    if (showApiKey) return key
    const prefix = key.slice(0, 10)
    const suffix = key.slice(-4)
    return `${prefix}${'•'.repeat(8)}${suffix}`
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-[1200px]">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Settings</h1>
        <p className="text-muted-foreground">
          Manage your account and preferences
        </p>
      </div>

      <div className="space-y-6">
        {/* Profile Settings */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <User className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle>Profile Settings</CardTitle>
                <CardDescription>Manage your personal information</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Avatar Upload */}
            <div className="space-y-2">
              <Label>Profile Picture</Label>
              <div className="flex items-center gap-4">
                <div className="h-20 w-20 rounded-full bg-muted flex items-center justify-center overflow-hidden border-2 border-border">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="Avatar" className="h-full w-full object-cover" />
                  ) : (
                    <User className="h-10 w-10 text-muted-foreground" />
                  )}
                </div>
                <div className="flex-1">
                  <input
                    type="file"
                    id="avatar-upload"
                    accept="image/*"
                    className="hidden"
                    onChange={handleAvatarUpload}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => document.getElementById('avatar-upload')?.click()}
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    Upload New Picture
                  </Button>
                  <p className="text-xs text-muted-foreground mt-2">
                    JPG, PNG or GIF. Max 2MB.
                  </p>
                </div>
              </div>
            </div>

            {/* Display Name */}
            <div className="space-y-2">
              <Label htmlFor="display-name">Display Name</Label>
              <Input
                id="display-name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Enter your display name"
              />
            </div>

            {/* Email (Read-only) */}
            <div className="space-y-2">
              <Label htmlFor="email">Email Address</Label>
              <div className="relative">
                <Input
                  id="email"
                  value={email}
                  disabled
                  className="pr-10"
                />
                <Mail className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              </div>
              <p className="text-xs text-muted-foreground">
                Contact support to change your email address
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Notification Preferences */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Bell className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle>Notification Preferences</CardTitle>
                <CardDescription>Configure how you receive alerts</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Email Notifications Toggle */}
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div className="flex items-center gap-3">
                <Mail className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="font-medium">Email Notifications</p>
                  <p className="text-sm text-muted-foreground">
                    Receive notifications via email
                  </p>
                </div>
              </div>
              <button
                role="switch"
                aria-checked={emailNotifications}
                aria-label="Toggle email notifications"
                onClick={() => setEmailNotifications(!emailNotifications)}
                className={cn(
                  "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
                  emailNotifications ? "bg-primary" : "bg-muted"
                )}
              >
                <span
                  className={cn(
                    "inline-block h-4 w-4 transform rounded-full bg-card transition-transform",
                    emailNotifications ? "translate-x-6" : "translate-x-1"
                  )}
                />
              </button>
            </div>

            {/* Slack Integration Toggle */}
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div className="flex items-center gap-3">
                <Slack className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="font-medium">Slack Integration</p>
                  <p className="text-sm text-muted-foreground">
                    Send notifications to Slack
                  </p>
                </div>
              </div>
              <button
                role="switch"
                aria-checked={slackIntegration}
                aria-label="Toggle Slack integration"
                onClick={() => setSlackIntegration(!slackIntegration)}
                className={cn(
                  "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
                  slackIntegration ? "bg-primary" : "bg-muted"
                )}
              >
                <span
                  className={cn(
                    "inline-block h-4 w-4 transform rounded-full bg-card transition-transform",
                    slackIntegration ? "translate-x-6" : "translate-x-1"
                  )}
                />
              </button>
            </div>

            {/* Alert Thresholds */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="error-threshold">Error Rate Threshold (%)</Label>
                <Input
                  id="error-threshold"
                  type="number"
                  value={errorThreshold}
                  onChange={(e) => setErrorThreshold(e.target.value)}
                  placeholder="5"
                />
                <p className="text-xs text-muted-foreground">
                  Alert when error rate exceeds this percentage
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="cost-threshold">Daily Cost Threshold ($)</Label>
                <Input
                  id="cost-threshold"
                  type="number"
                  value={costThreshold}
                  onChange={(e) => setCostThreshold(e.target.value)}
                  placeholder="100"
                />
                <p className="text-xs text-muted-foreground">
                  Alert when daily costs exceed this amount
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* API Configuration */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Key className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle>API Configuration</CardTitle>
                <CardDescription>Manage your API keys and webhooks</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* API Key Display */}
            <div className="space-y-2">
              <Label htmlFor="api-key">API Key</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    id="api-key"
                    value={maskApiKey(apiKey)}
                    disabled
                    className="font-mono text-sm pr-10"
                  />
                  <button
                    onClick={() => setShowApiKey(!showApiKey)}
                    aria-label={showApiKey ? "Hide API key" : "Show API key"}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showApiKey ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
                <Button
                  variant="outline"
                  onClick={copyApiKey}
                  className="relative"
                >
                  {apiKeyCopied ? (
                    <>
                      <Check className="h-4 w-4 mr-2" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4 mr-2" />
                      Copy
                    </>
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Keep your API key secure. Do not share it publicly.
              </p>
            </div>

            {/* Regenerate API Key */}
            <div className="p-4 border border-warning/50 bg-warning/5 rounded-lg">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-warning mt-0.5" />
                <div className="flex-1">
                  <p className="font-medium text-sm mb-1">Regenerate API Key</p>
                  <p className="text-xs text-muted-foreground mb-3">
                    This will invalidate your current API key immediately. Update all applications using the old key.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={regenerateApiKey}
                  >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Regenerate Key
                  </Button>
                </div>
              </div>
            </div>

            {/* Webhook URL */}
            <div className="space-y-2">
              <Label htmlFor="webhook-url">Webhook URL</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    id="webhook-url"
                    value={webhookUrl}
                    onChange={(e) => setWebhookUrl(e.target.value)}
                    placeholder="https://api.example.com/webhooks"
                  />
                </div>
                <Button
                  variant="outline"
                  onClick={() => {
                    navigator.clipboard.writeText(webhookUrl)
                    toast.success('Webhook URL copied!')
                  }}
                >
                  <Copy className="h-4 w-4 mr-2" />
                  Copy
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Receive real-time updates via webhooks
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Theme Settings */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Palette className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle>Theme Settings</CardTitle>
                <CardDescription>Customize your interface appearance</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Theme Selector */}
            <div className="space-y-2">
              <Label htmlFor="theme-select">Theme Mode</Label>
              <Select value={theme} onValueChange={setTheme}>
                <SelectTrigger id="theme-select">
                  <SelectValue placeholder="Select theme" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="light">Light</SelectItem>
                  <SelectItem value="dark">Dark</SelectItem>
                  <SelectItem value="system">System</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Choose your preferred color scheme
              </p>
            </div>

            {/* Accent Color Picker */}
            <div className="space-y-2">
              <Label htmlFor="accent-color">Accent Color</Label>
              <div className="flex gap-4 items-center">
                <input
                  type="color"
                  id="accent-color"
                  value={accentColor}
                  onChange={(e) => setAccentColor(e.target.value)}
                  className="h-12 w-24 rounded-md border border-input cursor-pointer"
                />
                <div className="flex-1">
                  <Input
                    value={accentColor}
                    onChange={(e) => setAccentColor(e.target.value)}
                    placeholder="#4ECFA5"
                    className="font-mono"
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Customize the primary color used throughout the interface
              </p>
            </div>

            {/* Color Preview */}
            <div className="p-4 border rounded-lg space-y-3">
              <p className="text-sm font-medium mb-3">Preview</p>
              <div className="flex gap-2">
                <div
                  className="h-10 w-10 rounded-md border"
                  style={{ backgroundColor: accentColor }}
                />
                <div
                  className="h-10 w-10 rounded-md border"
                  style={{ backgroundColor: accentColor, opacity: 0.8 }}
                />
                <div
                  className="h-10 w-10 rounded-md border"
                  style={{ backgroundColor: accentColor, opacity: 0.6 }}
                />
                <div
                  className="h-10 w-10 rounded-md border"
                  style={{ backgroundColor: accentColor, opacity: 0.4 }}
                />
                <div
                  className="h-10 w-10 rounded-md border"
                  style={{ backgroundColor: accentColor, opacity: 0.2 }}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Data & Privacy */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Shield className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle>Data & Privacy</CardTitle>
                <CardDescription>Manage your data and account</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Export Data */}
            <div className="p-4 border rounded-lg">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-medium mb-1">Export Your Data</p>
                  <p className="text-sm text-muted-foreground">
                    Download a copy of all your data including traces, evals, and feedback
                  </p>
                </div>
                <Button
                  variant="outline"
                  onClick={handleExportData}
                >
                  <Download className="h-4 w-4 mr-2" />
                  Export
                </Button>
              </div>
            </div>

            {/* Danger Zone - Delete Account */}
            <div className="p-4 border-2 border-destructive/50 bg-destructive/5 rounded-lg">
              <div className="flex items-start gap-3 mb-3">
                <AlertTriangle className="h-5 w-5 text-destructive mt-0.5" />
                <div>
                  <p className="font-medium text-destructive mb-1">Danger Zone</p>
                  <p className="text-sm text-muted-foreground">
                    Once you delete your account, there is no going back. This action is permanent.
                  </p>
                </div>
              </div>
              <Button
                variant="destructive"
                onClick={handleDeleteAccount}
                className="w-full sm:w-auto"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete Account
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Save Changes Button - Fixed positioning */}
        <Card className="sticky bottom-4 z-10">
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {saveSuccess && (
                  <div className="flex items-center gap-2 text-success">
                    <Check className="h-4 w-4" />
                    <span className="text-sm font-medium">Changes saved successfully</span>
                  </div>
                )}
              </div>
              <Button
                onClick={handleSaveChanges}
                loading={isSaving}
                size="lg"
              >
                <Save className="h-4 w-4 mr-2" />
                {isSaving ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
