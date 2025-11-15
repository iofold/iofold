# LLM Models Available in 2025

**Last Updated:** November 12, 2025
**Purpose:** Reference guide for available LLM models and their pricing

---

## Anthropic Claude Models

### Latest Models (November 2025)

| Model | Model ID | Released | Input Cost | Output Cost | Context | Use Case |
|-------|----------|----------|------------|-------------|---------|----------|
| **Claude Sonnet 4.5** | `claude-sonnet-4-5` | Sep 29, 2025 | $3/M | $15/M | - | Best coding model, complex agents |
| **Claude Haiku 4.5** | `claude-haiku-4-5` | Oct 15, 2025 | $1/M | $5/M | - | Latest small model, fast responses |
| **Claude Opus 4.1** | `claude-opus-4-1-20250805` | Aug 5, 2025 | $15/M | $75/M | - | Agentic tasks, reasoning |
| **Claude Sonnet 4** | `claude-sonnet-4` | May 22, 2025 | $3/M | $15/M | - | Hybrid model with extended thinking |
| **Claude Opus 4** | `claude-opus-4` | May 22, 2025 | $15/M | $75/M | - | Hybrid model, deep reasoning |

### Legacy Models (Still Available)

| Model | Model ID | Input Cost | Output Cost |
|-------|----------|------------|-------------|
| Claude 3.5 Sonnet | `claude-3-5-sonnet-20241022` | $3/M | $15/M |
| Claude 3.5 Haiku | `claude-3-5-haiku-20241022` | $1/M | $5/M |
| Claude 3 Opus | `claude-3-opus-20240229` | $15/M | $75/M |
| Claude 3 Sonnet | `claude-3-sonnet-20240229` | $3/M | $15/M |
| Claude 3 Haiku | `claude-3-haiku-20240307` | $0.25/M | $1.25/M |

**Features:**
- Text and image input, text output
- Multilingual capabilities
- Vision support
- Available via: Anthropic API, AWS Bedrock, Google Vertex AI

**Recommended for iofold:**
- **Development:** `claude-haiku-4-5` (fast, low cost)
- **Production:** `claude-sonnet-4-5` (best for code generation)

---

## OpenAI GPT Models

### Latest Models (2025)

| Model | Model ID | Released | Input Cost | Output Cost | Context | Use Case |
|-------|----------|----------|------------|-------------|---------|----------|
| **GPT-5** | `gpt-5` | Aug 2025 | - | - | Up to 256K | Best overall, multimodal |
| **GPT-5 Mini** | `gpt-5-mini` | Aug 2025 | - | - | 256K | Efficient flagship |
| **GPT-5 Nano** | `gpt-5-nano` | Aug 2025 | - | - | 256K | Ultra-efficient |
| **GPT-4.1** | `gpt-4.1` | Apr 2025 | $2/M | $8/M | 1M | Coding, long context |
| **GPT-4.1 Mini** | `gpt-4.1-mini` | Apr 2025 | $0.40/M | $1.60/M | 1M | Efficient, long context |
| **GPT-4.1 Nano** | `gpt-4.1-nano` | Apr 2025 | $0.10/M | $0.40/M | 1M | Ultra low-cost |

### Reasoning Models (o-series)

| Model | Model ID | Released | Use Case |
|-------|----------|----------|----------|
| o3-mini | `o3-mini` | Jan 31, 2025 | Enhanced reasoning |
| GPT-5 (reasoning) | `gpt-5` | Aug 2025 | Flagship reasoning model |

### Specialized Models

| Model | Released | Use Case |
|-------|----------|----------|
| GPT-image-1 | Apr 15, 2025 | Image generation |
| gpt-4o-transcribe | 2025 | Speech-to-text (STT) |
| gpt-4o-mini-transcribe | 2025 | Efficient STT |
| gpt-4o-mini-tts | 2025 | Text-to-speech |

**Notable:**
- GPT-4.5 being deprecated (July 14, 2025)
- GPT-4.1 offers better performance at lower cost than GPT-4.5

**Recommended for iofold:**
- **Development:** `gpt-4.1-nano` ($0.10/$0.40 per M tokens)
- **Production:** `gpt-4.1` or `gpt-4.1-mini` (great value for coding)

---

## Google Gemini Models

### Gemini 2.5 Models (Latest)

| Model | Model ID | Status | Context | Use Case |
|-------|----------|--------|---------|----------|
| **Gemini 2.5 Pro** | `gemini-2.5-pro` | Stable | 1M (2M soon) | Most powerful, adaptive thinking |
| **Gemini 2.5 Flash** | `gemini-2.5-flash` | Stable | - | Efficient workhorse, speed |
| **Gemini 2.5 Flash-Lite** | `gemini-2.5-flash-lite` | GA | - | Fast, low-cost, high-performance |
| **Gemini 2.5 Computer Use** | `gemini-2.5-computer-use` | Preview | - | Agent UI interaction |
| **Gemini 2.5 Pro Deep Think** | `gemini-2.5-pro-deep-think` | Experimental | - | Complex math and coding |

### Gemini 2.0 Models

| Model | Model ID | Status | Use Case |
|-------|----------|--------|----------|
| Gemini 2.0 Flash | `gemini-2.0-flash` | GA | Fast, efficient |
| Gemini 2.0 Pro | `gemini-2.0-pro` | Experimental | Best for coding |
| Gemini 2.0 Flash-Lite | `gemini-2.0-flash-lite` | Preview | Most cost-efficient |

### Additional Capabilities

- **Text-to-Speech (TTS):** Native audio output in 24 languages, 30+ distinct voices
- **Live API:** Real-time conversation with natural sounding voices
- **Multimodal:** Text, image, audio, video input
- **Available via:** Google AI Studio, Vertex AI

**Recommended for iofold:**
- **Development:** `gemini-2.5-flash-lite` (cost-efficient)
- **Production:** `gemini-2.5-pro` or `gemini-2.0-pro` (best for coding)

---

## Cost Comparison (Per Million Tokens)

### Budget Tier (< $1 input)

| Provider | Model | Input | Output | Notes |
|----------|-------|-------|--------|-------|
| OpenAI | GPT-4.1 Nano | $0.10 | $0.40 | Best value |
| OpenAI | GPT-4.1 Mini | $0.40 | $1.60 | Good balance |
| Anthropic | Claude 3 Haiku | $0.25 | $1.25 | Legacy |
| Anthropic | Claude Haiku 4.5 | $1.00 | $5.00 | Latest small |

### Mid Tier ($1-$3 input)

| Provider | Model | Input | Output | Notes |
|----------|-------|-------|--------|-------|
| OpenAI | GPT-4.1 | $2.00 | $8.00 | Excellent coding |
| Anthropic | Claude Sonnet 4.5 | $3.00 | $15.00 | Best for agents |
| Anthropic | Claude Sonnet 4 | $3.00 | $15.00 | Hybrid thinking |

### Premium Tier ($15+ input)

| Provider | Model | Input | Output | Notes |
|----------|-------|-------|--------|-------|
| Anthropic | Claude Opus 4.1 | $15.00 | $75.00 | Advanced reasoning |
| Anthropic | Claude Opus 4 | $15.00 | $75.00 | Deep thinking |

---

## Recommendations for iofold.com

### Phase 1 Implementation

**Primary Model:** `claude-haiku-4-5` or `gpt-4.1-nano`
- **Reasoning:** Low cost for validation, fast responses
- **Estimated Cost:** $1-5/M tokens → ~$0.01-0.05 per eval generation

**Fallback Model:** `gemini-2.5-flash-lite`
- **Reasoning:** Alternative for comparison testing
- **Cost-effective for high volume**

### Production (Post-Validation)

**Primary Model:** `claude-sonnet-4-5`
- **Reasoning:** Best coding model, complex agent support
- **Estimated Cost:** $3-15/M tokens → ~$0.10-0.50 per eval generation

**Alternative:** `gpt-4.1` or `gemini-2.5-pro`
- **Reasoning:** Competitive performance, different pricing structures
- **Allow user choice in settings**

### Cost Optimization Strategy

1. **Development/Testing:** Use cheapest models (Haiku, GPT-4.1 Nano)
2. **Production Default:** Mid-tier models (Sonnet, GPT-4.1)
3. **Premium Option:** Allow users to opt into premium models for complex evals
4. **Model Selection:** Let users choose based on budget/quality tradeoff

---

## Implementation Notes

### Current Status

- **Cost Tracker** supports: Claude 3.5 Sonnet, Claude 3 Opus, Claude 3 Haiku (legacy IDs)
- **Generator** currently configured for: `claude-3-5-haiku-20241022`

### Required Updates

1. **Update Cost Tracker** (`src/analytics/cost-tracker.ts`):
   - Add Claude 4.x series pricing
   - Add GPT-4.1 series pricing
   - Add Gemini pricing
   - Support model aliases (`claude-haiku-4-5` → pricing lookup)

2. **Update Generator** (`src/eval-generator/generator.ts`):
   - Change default model to working model ID
   - Add model validation/fallback logic
   - Allow model selection via config

3. **Configuration**:
   - Add model selection to `.env`
   - Support multiple providers (Anthropic, OpenAI, Gemini)
   - Implement provider abstraction layer

---

## API Model ID Formats

### Anthropic
- **Latest:** Use simple names: `claude-sonnet-4-5`, `claude-haiku-4-5`
- **Legacy:** Use dated versions: `claude-3-5-sonnet-20241022`

### OpenAI
- **Latest:** Use version numbers: `gpt-5`, `gpt-4.1`, `gpt-4.1-mini`
- **Reasoning:** Use o-series: `o3-mini`

### Google
- **Latest:** Use version + variant: `gemini-2.5-pro`, `gemini-2.5-flash-lite`
- **Experimental:** Add suffix: `gemini-2.5-pro-deep-think`

---

## References

- **Anthropic Docs:** https://docs.claude.com/en/docs/about-claude/models/overview
- **OpenAI Docs:** https://platform.openai.com/docs/models
- **Gemini Docs:** https://ai.google.dev/gemini-api/docs/models
- **Pricing:** Check provider websites for most current pricing

**Last Verified:** November 12, 2025
