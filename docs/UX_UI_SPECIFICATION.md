# iofold UX/UI Specification

Complete user experience and interaction design specification for the iofold automated eval generation platform.

## Table of Contents

1. [Overview](#overview)
2. [Core User Flows](#core-user-flows)
3. [Page-by-Page Specifications](#page-by-page-specifications)
4. [Component Specifications](#component-specifications)
5. [Interaction Patterns](#interaction-patterns)
6. [Visual Design Guidelines](#visual-design-guidelines)
7. [Accessibility](#accessibility)

---

## Overview

### Design Philosophy

**Core Principle:** Make eval generation feel effortless and fast, like swiping through a dating app, not filling out forms.

**Key UX Goals:**
1. **Speed** - Minimize clicks and typing. Keyboard shortcuts everywhere.
2. **Clarity** - Show exactly what's happening at each step
3. **Feedback** - Instant visual confirmation of every action
4. **Progressive disclosure** - Don't overwhelm with complexity upfront
5. **Forgiveness** - Easy undo, edit, and refinement

### User Personas

**Primary:** ML Engineer reviewing traces to generate evals
- Needs: Fast feedback annotation, code visibility, accuracy metrics
- Pain points: Tedious manual eval writing, inconsistent quality

**Secondary:** Engineering Manager monitoring eval quality
- Needs: Dashboard overview, contradiction detection, accuracy trends
- Pain points: Can't see which evals are reliable

---

## Core User Flows

### Flow 1: First-Time Setup (5 minutes)

```
1. Land on dashboard
   ├─ See empty state: "No eval sets yet"
   ├─ CTA: "Connect Your First Integration"
   └─ Click → Integration setup modal

2. Add integration
   ├─ Select platform: Langfuse | Langsmith | OpenAI
   ├─ Paste API key
   ├─ (Optional) Custom base URL
   ├─ Test connection → Green checkmark or error
   └─ Save → Returns to dashboard

3. Import traces
   ├─ Auto-prompt: "Import traces from [Integration]?"
   ├─ Select filters (date range, tags, limit)
   ├─ Click "Import" → Job starts
   ├─ Progress bar: "Importing 47 traces... 50% complete"
   └─ Toast: "✅ Imported 47 traces"

4. Create first eval set
   ├─ CTA: "Create Your First Eval Set"
   ├─ Name: "Customer Support Quality"
   ├─ Description: (optional)
   ├─ Click "Create" → Auto-navigate to eval set detail
   └─ See: "0/0/0 feedback. Start reviewing traces →"

5. Review traces
   ├─ Click "Review Traces" → Swipe interface
   ├─ See first trace with content
   ├─ Swipe right (positive) → Next trace
   ├─ Continue swiping through 10 traces
   └─ See: "✅ All done! 7 positive, 2 negative, 1 neutral"

6. Generate eval
   ├─ Return to eval set → See "Generate Eval" button enabled
   ├─ Click → Generate modal
   ├─ Name: "Check Customer Satisfaction"
   ├─ (Optional) Custom instructions
   ├─ Click "Generate" → Job starts
   ├─ Progress: "Generating eval... Analyzing patterns..."
   └─ Toast: "✅ Eval generated! Accuracy: 87%"

7. View generated eval
   ├─ Auto-navigate to eval detail page
   ├─ See: Python code with syntax highlighting
   ├─ See: Test results (7 correct, 2 incorrect, 0 errors)
   └─ CTA: "Execute on All Traces" or "Refine Based on Contradictions"
```

**Success Criteria:** User goes from zero to generated eval in < 5 minutes.

### Flow 2: Daily Review Workflow (2 minutes)

```
1. Open dashboard
   ├─ See: "5 new traces without feedback"
   └─ Click → Review page

2. Rapid feedback (keyboard shortcuts)
   ├─ Read trace #1 → Press "1" (positive)
   ├─ Read trace #2 → Press "3" (negative)
   ├─ Read trace #3 → Press "2" (neutral)
   ├─ Read trace #4 → Press "1" (positive)
   ├─ Read trace #5 → Press "1" (positive)
   └─ Auto-return to dashboard → Toast: "✅ 5 traces reviewed"

3. Check if ready to generate
   ├─ Dashboard shows: "Customer Support Quality: 15/5 feedback"
   ├─ See "Generate Eval" button with green indicator
   └─ Optional: Click to generate new version
```

**Success Criteria:** Review 5 traces in < 30 seconds.

### Flow 3: Contradiction Detection & Refinement

```
1. Notice contradiction indicator
   ├─ Dashboard: "Customer Satisfaction v1: ⚠️ 3 contradictions"
   └─ Click → Eval detail page

2. View contradictions
   ├─ See: "3 traces where human feedback disagrees with eval"
   ├─ Click "View Contradictions" → Matrix view
   └─ See: Side-by-side comparison table

3. Review contradiction
   ├─ Row 1: Human: ✅ | Eval: ❌ | "Response was slow but accurate"
   ├─ Click trace → Open trace detail in modal
   ├─ Read full context
   └─ Decision: "Eval is wrong, needs to consider accuracy more"

4. Refine eval
   ├─ Click "Refine Eval" from matrix view
   ├─ Auto-fill: Name: "Customer Satisfaction v2"
   ├─ Add custom instruction: "Prioritize accuracy over speed"
   ├─ System auto-includes: Original training + 3 contradiction cases
   ├─ Click "Generate" → New version created
   └─ Progress: "Generating v2... Testing on 18 traces..."

5. Compare versions
   ├─ Auto-navigate to eval detail
   ├─ See: "v2: Accuracy 93% (↑6% from v1)"
   ├─ See: "Contradictions: 1 (↓2 from v1)"
   ├─ Tab: "Compare with v1"
   └─ See: Code diff showing changes

6. Deploy or rollback
   ├─ Option 1: Click "Deploy" → Mark as active eval
   ├─ Option 2: Click "Collect More Feedback" → Back to review
   └─ Option 3: Click "Rollback to v1" → Revert to previous version
```

**Success Criteria:** Identify and resolve contradiction in < 3 minutes.

### Flow 4: Matrix Analysis

```
1. Access matrix
   ├─ From eval set detail: Click "View Matrix"
   ├─ Select evals: Choose "v1" and "v2" (multi-select)
   └─ Click "Compare" → Matrix view loads

2. Explore matrix
   ├─ See: Table with columns: Trace | Human | v1 | v2
   ├─ Rows: All traces with feedback
   ├─ Visual indicators:
   │   ├─ ✅ Green: Agreement
   │   ├─ ❌ Red: Contradiction
   │   └─ ⚠️ Yellow: Error
   └─ Stats sidebar:
       ├─ v1: 87% accuracy, 3 contradictions
       └─ v2: 93% accuracy, 1 contradiction

3. Filter matrix
   ├─ Toggle: "Contradictions Only" → Show only ❌ rows
   ├─ Filter by rating: "Positive" → Show only positive feedback traces
   ├─ Date range: "Last 7 days"
   └─ Search: "slow response" → Filter by content

4. Investigate trace
   ├─ Click trace row → Expandable detail
   ├─ See: Full trace content
   ├─ See: Human feedback + notes
   ├─ See: Each eval's prediction + reasoning
   └─ Action: "Change Feedback" | "View Trace Detail"

5. Bulk actions
   ├─ Select multiple contradiction traces (checkboxes)
   ├─ Action: "Refine Eval with These Cases"
   └─ Opens generation modal pre-filled with selected traces
```

**Success Criteria:** Understand eval performance across all traces in < 2 minutes.

---

## Page-by-Page Specifications

### 1. Dashboard (Home Page)

**URL:** `/`

**Purpose:** High-level overview of all eval sets, recent activity, and quick actions.

**Layout:**

```
┌─────────────────────────────────────────────────────────────┐
│  [🏠 iofold]  Integrations  Traces  Eval Sets  Evals         │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Dashboard                                                   │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Quick Stats                                           │  │
│  │  📊 5 Eval Sets  |  🎯 12 Evals  |  ✍️ 47 Traces      │  │
│  │  👍 32 Positive  |  👎 8 Negative  |  😐 7 Neutral    │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  [+ New Eval Set]                                           │
│                                                              │
│  Recent Eval Sets                                           │
│  ┌────────────────────────────────────────────────────┐    │
│  │ 📁 Customer Support Quality              Updated 2h│    │
│  │    👍 15  👎 3  😐 2  →  [Review More]            │    │
│  │    ✅ v2: 93% accuracy  (3 evals generated)        │    │
│  │    ⚠️ 1 contradiction detected                     │    │
│  └────────────────────────────────────────────────────┘    │
│                                                              │
│  ┌────────────────────────────────────────────────────┐    │
│  │ 📁 Response Time Checks                  Updated 1d│    │
│  │    👍 8  👎 4  😐 1  →  [Review More]             │    │
│  │    ⏳ Ready to generate (8/5 minimum)              │    │
│  │    [Generate Eval]                                  │    │
│  └────────────────────────────────────────────────────┘    │
│                                                              │
│  Recent Activity                                            │
│  • Generated "Customer Satisfaction v2" (93% accuracy) - 2h│
│  • Reviewed 5 traces in "Support Quality" - 4h            │
│  • Imported 23 traces from Langfuse - 1d                   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**Key Elements:**

1. **Quick Stats Cards**
   - Total counts: Eval sets, evals, traces, feedback
   - Color-coded: Positive (green), Negative (red), Neutral (gray)
   - Clickable → Filter relevant page

2. **Eval Set Cards**
   - Name + icon
   - Feedback counts with emojis
   - Status indicator:
     - "5/5 minimum" → Ready to generate
     - "⚠️ X contradictions" → Needs review
     - "✅ vN: X% accuracy" → Generated
   - Quick action button:
     - "Review More" → Review page
     - "Generate Eval" → Generation modal
     - "View Matrix" → Matrix page
   - Timestamp: "Updated Xh/Xd ago"

3. **Activity Feed**
   - Chronological list
   - Icons for event type
   - Clickable → Relevant detail page
   - Real-time updates (SSE)

4. **Empty State** (no eval sets)
   ```
   🎯 Welcome to iofold!

   Get started by:
   1. [Connect Integration] → Add Langfuse/Langsmith/OpenAI
   2. [Import Traces] → Pull in your execution traces
   3. [Create Eval Set] → Organize feedback
   4. [Review Traces] → Swipe to label
   5. [Generate Eval] → Auto-create eval functions

   [Quick Start Tutorial]
   ```

**Interactions:**

- Hover eval set card → Highlight + show actions
- Click card → Navigate to eval set detail
- Click quick action → Modal or navigation
- Real-time updates → Toast notifications + card updates

---

### 2. Integrations Page

**URL:** `/integrations`

**Purpose:** Manage connections to external observability platforms.

**Layout:**

```
┌─────────────────────────────────────────────────────────────┐
│  Integrations                           [+ Add Integration] │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Connected Platforms                                         │
│                                                              │
│  ┌────────────────────────────────────────────────────┐    │
│  │ 🟢 Langfuse                          [Test] [Delete]│    │
│  │    Production Instance                               │    │
│  │    Last synced: 2 hours ago                         │    │
│  │    47 traces imported                               │    │
│  └────────────────────────────────────────────────────┘    │
│                                                              │
│  ┌────────────────────────────────────────────────────┐    │
│  │ 🔴 Langsmith                         [Test] [Delete]│    │
│  │    Error: Invalid API key                           │    │
│  │    Last attempt: 1 day ago                          │    │
│  │    [Edit Configuration]                             │    │
│  └────────────────────────────────────────────────────┘    │
│                                                              │
│  Available Platforms                                        │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐                   │
│  │Langfuse │  │Langsmith│  │ OpenAI  │                   │
│  │  [Add]  │  │  [Add]  │  │  [Add]  │                   │
│  └─────────┘  └─────────┘  └─────────┘                   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**Add Integration Modal:**

```
┌──────────────────────────────────────────┐
│  Add Integration                    [✕]  │
├──────────────────────────────────────────┤
│                                           │
│  Select Platform:                         │
│  ○ Langfuse  ○ Langsmith  ○ OpenAI       │
│                                           │
│  Display Name:                            │
│  [Production Langfuse____________]        │
│                                           │
│  API Key: *                               │
│  [••••••••••••••••••••••_________]        │
│                                           │
│  Base URL: (optional)                     │
│  [https://cloud.langfuse.com_____]        │
│                                           │
│  [Test Connection]                        │
│                                           │
│  Status: ✅ Connection successful!        │
│                                           │
│             [Cancel]  [Save Integration]  │
└──────────────────────────────────────────┘
```

**Interactions:**

1. **Add Integration:**
   - Click "+ Add Integration" → Modal
   - Select platform (radio buttons)
   - Fill form fields
   - Click "Test Connection" → Verify API key
   - Show status: ✅ Success or ❌ Error with message
   - Save → Close modal, show toast, refresh list

2. **Test Integration:**
   - Click "Test" button on card
   - Loading spinner
   - Result: Toast with success/error

3. **Delete Integration:**
   - Click "Delete" → Confirmation modal
   - "Are you sure? This will not delete imported traces."
   - [Cancel] [Delete] → Remove from list

4. **Edit Configuration:**
   - Click "Edit Configuration" on error card
   - Re-open modal pre-filled
   - Update fields → Save

---

### 3. Traces Page

**URL:** `/traces`

**Purpose:** Browse and filter all imported traces.

**Layout:**

```
┌─────────────────────────────────────────────────────────────┐
│  Traces                                [Import More Traces] │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Filters:  [All Sources ▼] [All Ratings ▼] [Date Range ▼]  │
│           [□ Has Feedback] [□ Has Errors]                   │
│                                                              │
│  47 traces                                   [🔍 Search___] │
│                                                              │
│  ┌────────────────────────────────────────────────────┐    │
│  │ 🟢 Trace #1                            1 day ago    │    │
│  │    👤 "Is cataract covered?"                        │    │
│  │    🤖 "Yes, cataract is covered..."                │    │
│  │    🔧 3 tool calls  |  17 steps                    │    │
│  │    👍 Positive feedback in "Support Quality"       │    │
│  └────────────────────────────────────────────────────┘    │
│                                                              │
│  ┌────────────────────────────────────────────────────┐    │
│  │ 🔴 Trace #2                            2 days ago   │    │
│  │    👤 "I want my policy details"                    │    │
│  │    🤖 "I'm unable to access..."                    │    │
│  │    ⚠️ Error: Missing login token                   │    │
│  │    🔧 1 tool call  |  5 steps                      │    │
│  │    No feedback yet                                  │    │
│  └────────────────────────────────────────────────────┘    │
│                                                              │
│  [Load More]                                                │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**Trace Detail Modal:**

```
┌──────────────────────────────────────────────────────────┐
│  Trace #1                                          [✕]   │
├──────────────────────────────────────────────────────────┤
│  Status: 🟢 Complete  |  Source: Langfuse  |  1d ago    │
│                                                           │
│  Conversation:                                           │
│  ┌────────────────────────────────────────────────────┐ │
│  │ 👤 Human:                                          │ │
│  │    Is cataract covered?                            │ │
│  └────────────────────────────────────────────────────┘ │
│                                                           │
│  ┌────────────────────────────────────────────────────┐ │
│  │ 🤖 Assistant:                                      │ │
│  │    <reply>Yes. Cataract is covered under the GMC   │ │
│  │    policy as "Cataract per eye including Cost of   │ │
│  │    Lens," with sub-limits specified in Annexure    │ │
│  │    VII.</reply>                                    │ │
│  └────────────────────────────────────────────────────┘ │
│                                                           │
│  ┌────────────────────────────────────────────────────┐ │
│  │ 🔧 Tool: get_policy_doc                            │ │
│  │    Arguments: { section: "benefits" }             │ │
│  │    Result: { ... }                                │ │
│  │    [Show Full Result]                              │ │
│  └────────────────────────────────────────────────────┘ │
│                                                           │
│  Feedback: 👍 Positive (in "Support Quality")           │
│  Notes: "Clear and accurate response"                   │
│                                                           │
│  [Edit Feedback]  [Delete Trace]             [Close]    │
└──────────────────────────────────────────────────────────┘
```

**Interactions:**

1. **Filter traces:**
   - Dropdowns: Source, Rating, Date
   - Checkboxes: Has feedback, Has errors
   - Search: Full-text search in content
   - Live filtering (instant results)

2. **Click trace card:**
   - Open detail modal
   - Show full conversation
   - Collapsible tool calls
   - Syntax-highlighted JSON

3. **Import more traces:**
   - Click "Import More Traces" → Modal
   - Select integration
   - Set filters
   - Start job → Progress indicator

---

### 4. Eval Sets List Page

**URL:** `/eval-sets`

**Purpose:** Browse all eval sets and their status.

**Layout:**

```
┌─────────────────────────────────────────────────────────────┐
│  Eval Sets                             [+ Create Eval Set]  │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  5 eval sets                                                │
│                                                              │
│  ┌────────────────────────────────────────────────────┐    │
│  │ 📁 Customer Support Quality          Updated 2h    │    │
│  │    Review agent responses for quality and accuracy  │    │
│  │                                                      │    │
│  │    👍 15 positive  •  👎 3 negative  •  😐 2 neutral│    │
│  │                                                      │    │
│  │    ✅ 3 evals generated  •  Latest: v3 (95%)       │    │
│  │    ⚠️ 1 contradiction in v2                        │    │
│  │                                                      │    │
│  │    [View Details]  [Review Traces]  [View Matrix]  │    │
│  └────────────────────────────────────────────────────┘    │
│                                                              │
│  ┌────────────────────────────────────────────────────┐    │
│  │ 📁 Response Time Checks              Updated 1d    │    │
│  │    Ensure responses are delivered quickly            │    │
│  │                                                      │    │
│  │    👍 8 positive  •  👎 4 negative  •  😐 1 neutral│    │
│  │                                                      │    │
│  │    ⏳ Ready to generate (13/5 minimum)              │    │
│  │                                                      │    │
│  │    [View Details]  [Review Traces]  [Generate Eval]│    │
│  └────────────────────────────────────────────────────┘    │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**Create Eval Set Modal:**

```
┌──────────────────────────────────────────┐
│  Create Eval Set                    [✕]  │
├──────────────────────────────────────────┤
│                                           │
│  Name: *                                  │
│  [Customer Support Quality______]        │
│                                           │
│  Description:                             │
│  ┌───────────────────────────────────┐  │
│  │Review agent responses for quality │  │
│  │and accuracy                       │  │
│  └───────────────────────────────────┘  │
│                                           │
│  Minimum Examples:                        │
│  [5▼]  (Need this many to generate)      │
│                                           │
│             [Cancel]  [Create Eval Set]   │
└──────────────────────────────────────────┘
```

**Interactions:**

1. **Create eval set:**
   - Click "+ Create Eval Set" → Modal
   - Fill name (required), description, minimum
   - Click "Create" → Auto-navigate to detail page
   - Toast: "✅ Eval set created"

2. **Click card:**
   - Navigate to eval set detail page

3. **Quick actions:**
   - "Review Traces" → Review page with eval_set_id
   - "Generate Eval" → Generation modal
   - "View Matrix" → Matrix page

---

### 5. Eval Set Detail Page

**URL:** `/eval-sets/{id}`

**Purpose:** Deep dive into a specific eval set, manage feedback, generate evals.

**Layout:**

```
┌─────────────────────────────────────────────────────────────┐
│  ← Back  Customer Support Quality                    [Edit] │
├─────────────────────────────────────────────────────────────┤
│  Review agent responses for quality and accuracy            │
│  Created 3 days ago  •  Updated 2 hours ago                │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Feedback Summary                                      │  │
│  │  ┌───────────┐  ┌───────────┐  ┌───────────┐        │  │
│  │  │ Positive  │  │ Neutral   │  │ Negative  │        │  │
│  │  │    15     │  │     2     │  │     3     │        │  │
│  │  └───────────┘  └───────────┘  └───────────┘        │  │
│  │                                                        │  │
│  │  Total: 20 traces  •  Minimum: 5                     │  │
│  │  ✅ Ready to generate evals                           │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  [Review More Traces]  [Generate Eval]  [View Matrix]      │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Generated Evals (3)                                   │  │
│  │                                                        │  │
│  │  ┌────────────────────────────────────────────────┐  │  │
│  │  │ ✅ Customer Satisfaction v3        95% accuracy│  │  │
│  │  │    Generated 2 hours ago                       │  │  │
│  │  │    Executed on 18 traces  •  1 contradiction  │  │  │
│  │  │    [View Code]  [View Results]  [Execute More] │  │  │
│  │  └────────────────────────────────────────────────┘  │  │
│  │                                                        │  │
│  │  ┌────────────────────────────────────────────────┐  │  │
│  │  │ Customer Satisfaction v2           93% accuracy│  │  │
│  │  │    Generated 1 day ago                         │  │  │
│  │  │    ⚠️ 3 contradictions detected                │  │  │
│  │  │    [View Code]  [View Results]  [Refine]       │  │  │
│  │  └────────────────────────────────────────────────┘  │  │
│  │                                                        │  │
│  │  ┌────────────────────────────────────────────────┐  │  │
│  │  │ Customer Satisfaction v1           87% accuracy│  │  │
│  │  │    Generated 3 days ago                        │  │  │
│  │  │    Archived                                    │  │  │
│  │  │    [View Code]  [View Results]                 │  │  │
│  │  └────────────────────────────────────────────────┘  │  │
│  │                                                        │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**Key Elements:**

1. **Feedback Summary Cards:**
   - Large numbers for each rating
   - Color-coded: Green (positive), Gray (neutral), Red (negative)
   - Progress indicator: "20/5 minimum" with checkmark when ready

2. **Action Buttons:**
   - "Review More Traces" → Review page
   - "Generate Eval" → Generation modal (enabled when minimum reached)
   - "View Matrix" → Matrix page (enabled when evals exist)

3. **Evals List:**
   - Chronological, newest first
   - Version number in name
   - Accuracy percentage with visual indicator:
     - Green ≥90%
     - Yellow 70-89%
     - Red <70%
   - Status badges:
     - ✅ "Active"
     - ⚠️ "X contradictions"
     - 📦 "Archived"
   - Quick actions per eval
   - Expandable to show full details

**Interactions:**

1. **Generate eval:**
   - Click "Generate Eval" → Modal (see below)
   - Monitor job progress
   - Auto-refresh when complete

2. **Refine eval:**
   - Click "Refine" on eval with contradictions
   - Opens generation modal with:
     - Name: "v{N+1}"
     - Auto-include: Original training + contradiction cases
     - Optional: Add custom instructions
   - Generate → New version

3. **View results:**
   - Click "View Results" → Navigate to eval detail page

---

### 6. Trace Review Page (Swipe Interface) ⭐

**URL:** `/review?eval_set_id={id}`

**Purpose:** Rapidly label traces with positive/negative/neutral feedback using swipe gestures or keyboard shortcuts.

**Layout:**

```
┌─────────────────────────────────────────────────────────────┐
│  ← Back to Eval Sets    Trace Review                        │
├─────────────────────────────────────────────────────────────┤
│  Swipe or use keyboard shortcuts to provide feedback        │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Reviewing trace 3 of 5            3 remaining        │  │
│  │ ▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░ 60%                          │  │
│  │ 👍 2  •  😐 1  •  👎 0                               │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │                  🟢 Trace #3                          │  │
│  │                  17 steps  •  1 day ago              │  │
│  │                                                        │  │
│  │  ┌────────────────────────────────────────────────┐  │  │
│  │  │ 👤 Human:                                      │  │  │
│  │  │    Is cataract covered?                        │  │  │
│  │  └────────────────────────────────────────────────┘  │  │
│  │                                                        │  │
│  │  ┌────────────────────────────────────────────────┐  │  │
│  │  │ 🤖 Assistant:                                  │  │  │
│  │  │    <reply>Yes. Cataract is covered under       │  │  │
│  │  │    the GMC policy as "Cataract per eye         │  │  │
│  │  │    including Cost of Lens," with sub-limits    │  │  │
│  │  │    specified in Annexure VII. [Section:        │  │  │
│  │  │    Benefits / Annexure VII]</reply>            │  │  │
│  │  │    [Show more...]                              │  │  │
│  │  └────────────────────────────────────────────────┘  │  │
│  │                                                        │  │
│  │  ┌─ Tool Calls (3) ──────────────────────────────┐  │  │
│  │  │ 🔧 get_user_insurance_details → null          │  │  │
│  │  │ 🔧 get_policy_doc → {section: "benefits"}     │  │  │
│  │  │ 🔧 get_policy_doc → {section: "annexure"}     │  │  │
│  │  └────────────────────────────────────────────────┘  │  │
│  │                                                        │  │
│  │  ┌────────────────────────────────────────────────┐  │  │
│  │  │ Swipe Instructions:                            │  │  │
│  │  │  👉 Swipe right for 👍 Positive                │  │  │
│  │  │  👈 Swipe left for 👎 Negative                 │  │  │
│  │  │  ↓  Swipe down for 😐 Neutral                  │  │  │
│  │  │                                                 │  │  │
│  │  │ Or press: 1 Positive  2 Neutral  3 Negative   │  │  │
│  │  └────────────────────────────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  [← Previous]  [Skip]  [Next →]                            │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ How to Use:                                           │  │
│  │                                                        │  │
│  │ 🖱️ Mouse/Touch:                                      │  │
│  │  • Drag right for positive feedback                   │  │
│  │  • Drag left for negative feedback                    │  │
│  │  • Drag down for neutral feedback                     │  │
│  │                                                        │  │
│  │ ⌨️ Keyboard:                                          │  │
│  │  • 1 - Mark as positive                               │  │
│  │  • 2 - Mark as neutral                                │  │
│  │  • 3 - Mark as negative                               │  │
│  │  • ←/→ - Navigate between traces                      │  │
│  │                                                        │  │
│  │ Pro tip: Watch for the colored glow as you drag!      │  │
│  │ Green = positive, red = negative, gray = neutral.     │  │
│  │ Release when the threshold is reached.                │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**Swipe Interaction Details:**

1. **Visual Feedback During Drag:**
   ```
   Swipe Right (Positive):
   ┌─────────────────────────────────┐
   │  [Card shifts right 100px]      │◄──┐
   │  Background glows GREEN          │   │ Drag right
   │  👍 icon appears and grows       │   │
   │  Opacity increases with distance │   │
   └─────────────────────────────────┘───┘

   Swipe Left (Negative):
   ┌─────────────────────────────────┐
   │  [Card shifts left 100px]       │◄──┐
   │  Background glows RED            │   │ Drag left
   │  👎 icon appears and grows       │   │
   │  Opacity increases with distance │   │
   └─────────────────────────────────┘───┘

   Swipe Down (Neutral):
   ┌─────────────────────────────────┐
   │  [Card shifts down 80px]        │   │ Drag down
   │  Background glows GRAY           │   │
   │  😐 icon appears and grows       │   ▼
   │  Opacity increases with distance │
   └─────────────────────────────────┘
   ```

2. **Threshold & Auto-Advance:**
   - Threshold: 100px horizontal, 80px vertical
   - Release before threshold → Card snaps back
   - Release past threshold → Feedback submitted, advance to next
   - Smooth spring animation (Framer Motion)

3. **Keyboard Shortcuts:**
   - **1** → Submit positive, advance
   - **2** → Submit neutral, advance
   - **3** → Submit negative, advance
   - **← Left Arrow** → Previous trace (if available)
   - **→ Right Arrow** → Next trace (if available)
   - **S** → Skip trace (no feedback)

4. **Progress Tracking:**
   - Header shows: "Reviewing trace X of Y" with remaining count
   - Progress bar fills from left to right
   - Feedback counters update in real-time
   - When complete: "✅ All done! 👍 5  😐 2  👎 1"

5. **Completion Screen:**
   ```
   ┌─────────────────────────────────────────┐
   │  🎉 All Done!                            │
   │                                          │
   │  No traces to review.                   │
   │  All traces have feedback!              │
   │                                          │
   │  Summary:                                │
   │  👍 5 Positive                           │
   │  😐 2 Neutral                            │
   │  👎 1 Negative                           │
   │                                          │
   │  [View Eval Sets]  [Check for More ↻]   │
   └─────────────────────────────────────────┘
   ```

**Interactions:**

1. **Swipe gesture:**
   - Touch/mouse drag on card
   - Visual feedback (glow, icon, opacity)
   - Haptic feedback on mobile (if supported)
   - Smooth animation
   - Auto-advance to next trace

2. **Keyboard shortcut:**
   - Press 1/2/3
   - Toast notification: "👍 Marked as positive"
   - Auto-advance

3. **Navigation:**
   - Previous button (enabled after first trace)
   - Next button (enabled if traces ahead)
   - Skip button (no feedback, go to next)

4. **Add notes (optional):**
   - Click "Add Note" → Text input appears
   - Type note → Saved with feedback
   - Useful for contradictions

---

### 7. Generate Eval Modal

**Triggered from:** Eval set detail page, dashboard, matrix view

**Layout:**

```
┌──────────────────────────────────────────────────────────┐
│  Generate Eval                                      [✕]  │
├──────────────────────────────────────────────────────────┤
│                                                           │
│  Creating eval from: Customer Support Quality           │
│  Training data: 20 traces (15 positive, 3 negative,     │
│                 2 neutral)                               │
│                                                           │
│  Eval Name: *                                            │
│  [Customer Satisfaction v3___________________]           │
│                                                           │
│  Description: (optional)                                 │
│  [Check if agent responses satisfy customer_____]        │
│                                                           │
│  Model:                                                  │
│  ○ Claude 3.5 Sonnet (recommended)                      │
│  ○ GPT-4 Turbo                                          │
│  ○ Claude 3 Opus                                        │
│                                                           │
│  Custom Instructions: (optional)                         │
│  ┌─────────────────────────────────────────────────┐    │
│  │ Prioritize accuracy over speed. Consider if    │    │
│  │ the agent provided correct information, even   │    │
│  │ if the response was slightly delayed.          │    │
│  └─────────────────────────────────────────────────┘    │
│                                                           │
│  Advanced Options: [▼]                                   │
│                                                           │
│  ✅ Test eval on training data after generation         │
│  ✅ Flag low-confidence cases (< 80% certainty)         │
│  ⚠️ This will use ~500 LLM tokens                       │
│                                                           │
│                    [Cancel]  [Generate Eval →]           │
└──────────────────────────────────────────────────────────┘
```

**After Clicking "Generate Eval":**

```
┌──────────────────────────────────────────────────────────┐
│  Generating Eval...                                 [✕]  │
├──────────────────────────────────────────────────────────┤
│                                                           │
│  ⏳ Analyzing feedback patterns...                       │
│                                                           │
│  ▓▓▓▓▓▓▓▓▓░░░░░░░░░ 45%                                 │
│                                                           │
│  Steps:                                                  │
│  ✅ Normalized trace data                                │
│  ✅ Identified common patterns                           │
│  ⏳ Generating Python eval function...                   │
│  ⏸ Testing on training data                             │
│  ⏸ Computing accuracy                                    │
│                                                           │
│  Estimated time remaining: ~30 seconds                   │
│                                                           │
│  [Cancel Generation]                                     │
└──────────────────────────────────────────────────────────┘
```

**Success:**

```
┌──────────────────────────────────────────────────────────┐
│  Eval Generated! 🎉                                 [✕]  │
├──────────────────────────────────────────────────────────┤
│                                                           │
│  ✅ Customer Satisfaction v3                             │
│                                                           │
│  Results:                                                │
│  • Accuracy: 93% (18/20 correct on training data)       │
│  • Execution time: ~150ms average                       │
│  • 2 incorrect predictions (review these)               │
│                                                           │
│  [View Code]  [View Test Results]  [Execute on All]     │
│                                                           │
└──────────────────────────────────────────────────────────┘
```

**Interactions:**

1. **Fill form:**
   - Name required, auto-incremented version
   - Description optional
   - Model selection (default: Claude 3.5 Sonnet)
   - Custom instructions for meta-prompt tuning

2. **Generate:**
   - Click "Generate Eval" → Start job
   - Modal stays open, shows progress
   - Real-time updates via SSE
   - Cancel anytime

3. **View results:**
   - Auto-navigate to eval detail page
   - Toast notification with accuracy

---

### 8. Eval Detail Page

**URL:** `/evals/{id}`

**Purpose:** View generated Python code, test results, execution history, and refine eval.

**Layout:**

```
┌─────────────────────────────────────────────────────────────┐
│  ← Back  Customer Satisfaction v3                    [Edit] │
├─────────────────────────────────────────────────────────────┤
│  Check if agent responses satisfy customer                  │
│  From: Customer Support Quality  •  Generated 2h ago       │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ 📊 Performance Summary                                │  │
│  │  ┌────────────┐ ┌────────────┐ ┌────────────┐       │  │
│  │  │ Accuracy   │ │ Executions │ │ Avg Time   │       │  │
│  │  │    93%     │ │     18     │ │   152ms    │       │  │
│  │  └────────────┘ └────────────┘ └────────────┘       │  │
│  │                                                        │  │
│  │  ⚠️ 1 contradiction with human feedback               │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  [Execute on All Traces]  [Refine Based on Contradictions] │
│  [View Executions]  [Compare with v2]  [Archive]           │
│                                                              │
│  ┌────────────────────────────────────────────── Tabs ──┐  │
│  │  [Code] [Test Results] [Execution History]            │  │
│  ├──────────────────────────────────────────────────────┤  │
│  │                                                        │  │
│  │  ```python                                            │  │
│  │  def customer_satisfaction_v3(trace: dict) -> tuple:  │  │
│  │      """                                              │  │
│  │      Check if agent response satisfies customer.     │  │
│  │                                                        │  │
│  │      Returns:                                         │  │
│  │          (result: bool, reason: str)                 │  │
│  │      """                                              │  │
│  │      # Extract messages                               │  │
│  │      messages = trace.get('steps', [])[0]            │  │
│  │                     .get('messages_added', [])       │  │
│  │                                                        │  │
│  │      # Check for accurate information                 │  │
│  │      assistant_msg = next(                            │  │
│  │          (m for m in messages                         │  │
│  │           if m['role'] == 'assistant'),              │  │
│  │          None                                         │  │
│  │      )                                                │  │
│  │                                                        │  │
│  │      if not assistant_msg:                            │  │
│  │          return (False, "No assistant response")     │  │
│  │                                                        │  │
│  │      content = assistant_msg['content'].lower()      │  │
│  │                                                        │  │
│  │      # Check for completeness and accuracy            │  │
│  │      has_answer = any(                                │  │
│  │          keyword in content                           │  │
│  │          for keyword in ['yes', 'covered', 'policy'] │  │
│  │      )                                                │  │
│  │                                                        │  │
│  │      if has_answer:                                   │  │
│  │          return (True, "Complete and accurate")      │  │
│  │      else:                                            │  │
│  │          return (False, "Incomplete or unclear")     │  │
│  │  ```                                                  │  │
│  │                                                        │  │
│  │  [Copy Code]  [Download as .py]                      │  │
│  │                                                        │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**Test Results Tab:**

```
┌──────────────────────────────────────────────────────────┐
│  Test Results (on 20 training traces)                    │
│                                                            │
│  ✅ 18 correct  •  ❌ 2 incorrect  •  ⚠️ 0 errors        │
│                                                            │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Filter: [All ▼] [Show Incorrect Only]              │  │
│  ├────────────────────────────────────────────────────┤  │
│  │ ✅ Trace #1                                         │  │
│  │    Expected: True  •  Predicted: True              │  │
│  │    Reason: "Complete and accurate"                 │  │
│  │    Time: 145ms                                      │  │
│  ├────────────────────────────────────────────────────┤  │
│  │ ❌ Trace #7                                         │  │
│  │    Expected: True  •  Predicted: False             │  │
│  │    Reason: "Incomplete or unclear"                 │  │
│  │    Human note: "Response was slow but accurate"    │  │
│  │    Time: 162ms                                      │  │
│  │    [View Trace Detail]                              │  │
│  ├────────────────────────────────────────────────────┤  │
│  │ ... (18 more results)                               │  │
│  └────────────────────────────────────────────────────┘  │
│                                                            │
│  [Export as CSV]                                          │
└──────────────────────────────────────────────────────────┘
```

**Key Elements:**

1. **Code Viewer:**
   - Syntax highlighting (Python)
   - Line numbers
   - Copy button (one click)
   - Download as .py file
   - Collapsible sections for long code

2. **Performance Cards:**
   - Accuracy percentage with color coding
   - Total executions count
   - Average execution time
   - Contradiction count (if any)

3. **Action Buttons:**
   - "Execute on All Traces" → Run eval on all traces in workspace
   - "Refine Based on Contradictions" → Generate new version
   - "View Executions" → Execution history page
   - "Compare with v{N-1}" → Side-by-side code diff
   - "Archive" → Mark as inactive

4. **Test Results:**
   - List of all training traces
   - Expected vs predicted
   - Reasoning from eval
   - Execution time per trace
   - Filter: All / Correct / Incorrect / Errors
   - Click incorrect → Open trace detail to investigate

**Interactions:**

1. **View code:**
   - Syntax highlighted
   - Copy to clipboard
   - Download file

2. **Execute on all:**
   - Click → Confirmation modal
   - "Execute eval on 47 traces? This will use ~7,050 Python executions."
   - Start job → Progress indicator
   - Complete → Update execution count

3. **Refine:**
   - Click → Opens generation modal
   - Pre-filled with contradiction cases
   - Generate v4

4. **Compare versions:**
   - Side-by-side code diff
   - Highlight changes (green = added, red = removed)
   - Show accuracy delta: "v3: 93% (↑6% from v2)"

---

### 9. Matrix View Page ⭐

**URL:** `/eval-sets/{id}/matrix?eval_ids={id1},{id2}`

**Purpose:** Compare human feedback against multiple eval predictions in a tabular view. Identify contradictions, patterns, and eval performance.

**Layout:**

```
┌─────────────────────────────────────────────────────────────┐
│  ← Back  Comparison Matrix: Customer Support Quality       │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Select Evals to Compare:                                   │
│  ☑ v3 (93%)  ☑ v2 (87%)  ☐ v1 (80%)          [Apply]      │
│                                                              │
│  Filters:                                                   │
│  ○ All  ○ Contradictions Only  ○ Errors Only               │
│  [Positive ▼] [Last 7 days ▼] [🔍 Search_______]          │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Statistics                                            │  │
│  │  20 traces  •  2 contradictions  •  0 errors         │  │
│  │                                                        │  │
│  │  v3: 93% accuracy  •  1 contradiction  •  Avg 152ms  │  │
│  │  v2: 87% accuracy  •  3 contradictions •  Avg 184ms  │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌───────────────────────────────────────────────────────┐ │
│  │ Trace          │ Human  │  v3   │  v2   │ Actions    │ │
│  ├───────────────────────────────────────────────────────┤ │
│  │ "Is cataract   │  ✅   │  ✅   │  ✅   │ [View]     │ │
│  │  covered?"     │  👍   │  True │  True │            │ │
│  │  1d ago        │       │ 145ms │ 178ms │            │ │
│  ├───────────────────────────────────────────────────────┤ │
│  │ "I want my     │  ✅   │  ❌   │  ❌   │ [View]     │ │
│  │  policy..."    │  👍   │ False │ False │ [Refine]   │ │
│  │  2d ago        │       │ 162ms │ 195ms │            │ │
│  │  ⚠️ CONTRADICTION  │    │       │       │            │ │
│  ├───────────────────────────────────────────────────────┤ │
│  │ "What genetic  │  ❌   │  ❌   │  ✅   │ [View]     │ │
│  │  diseases..."  │  👎   │ False │ True  │            │ │
│  │  2d ago        │       │ 151ms │ 182ms │            │ │
│  │  ⚠️ v2 CONTRADICTION│  │       │       │            │ │
│  ├───────────────────────────────────────────────────────┤ │
│  │ ... (17 more traces)                                  │ │
│  └───────────────────────────────────────────────────────┘ │
│                                                              │
│  [Export to CSV]  [Generate Report]                        │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**Expanded Trace Row:**

```
┌───────────────────────────────────────────────────────────┐
│  ▼ "I want my policy details"                            │
│  ⚠️ CONTRADICTION: Human marked ✅ but v3 predicted ❌    │
│                                                            │
│  ┌────────────────────────────────────────────────────┐  │
│  │ 👤 Human: I want to know my policy details         │  │
│  ├────────────────────────────────────────────────────┤  │
│  │ 🤖 Assistant: I'm unable to access policy details  │  │
│  │    due to a missing login token. I can escalate    │  │
│  │    this to a human agent to retrieve your policy.  │  │
│  └────────────────────────────────────────────────────┘  │
│                                                            │
│  Human Feedback: 👍 Positive                              │
│  Notes: "Response was slow but accurate"                  │
│                                                            │
│  v3 Prediction: ❌ False (162ms)                          │
│  Reason: "Incomplete or unclear"                          │
│                                                            │
│  v2 Prediction: ❌ False (195ms)                          │
│  Reason: "Missing policy information"                     │
│                                                            │
│  [View Full Trace]  [Edit Feedback]  [Refine v3 with This]│
└───────────────────────────────────────────────────────────┘
```

**Key Elements:**

1. **Eval Selector:**
   - Multi-select checkboxes
   - Show accuracy in label
   - Max 5 evals at once (for readability)
   - Apply button to refresh matrix

2. **Filter Controls:**
   - Quick filters: All / Contradictions Only / Errors Only
   - Rating filter: Positive / Negative / Neutral / All
   - Date range: Last 7/30 days, Custom
   - Full-text search across trace content

3. **Statistics Panel:**
   - Total traces shown
   - Contradiction count
   - Error count
   - Per-eval stats:
     - Accuracy percentage
     - Contradiction count
     - Average execution time
     - Color-coded (green = best, yellow = okay, red = worst)

4. **Matrix Table:**
   - Columns:
     - Trace (preview: input/output)
     - Human (feedback with emoji)
     - One column per selected eval (prediction + time)
     - Actions (view, refine)
   - Rows:
     - Clickable to expand
     - Visual indicators:
       - ✅ Green = Agreement (human positive, eval true OR human negative, eval false)
       - ❌ Red = Contradiction
       - ⚠️ Yellow = Error (eval execution failed)
       - Empty = No feedback or not executed
   - Hover row → Highlight
   - Click row → Expand inline

5. **Expanded Row:**
   - Full trace content
   - Human feedback + notes
   - Each eval's prediction + reasoning + time
   - Quick actions:
     - View full trace modal
     - Edit feedback
     - Refine eval with this case

**Interactions:**

1. **Select evals:**
   - Check/uncheck evals
   - Click "Apply" → Reload matrix

2. **Filter:**
   - Click "Contradictions Only" → Show only ❌ rows
   - Select rating → Filter traces
   - Change date range → Refresh
   - Search → Live filter

3. **Expand trace:**
   - Click row → Expand inline
   - Click again → Collapse
   - View full context

4. **Refine eval:**
   - Click "Refine v3 with This" → Opens generation modal
   - Pre-select this trace as additional training data
   - Generate new version

5. **Bulk refine:**
   - Select multiple contradiction rows (checkboxes in future)
   - Click "Refine Eval with Selected" → Include all in new version

6. **Export:**
   - Click "Export to CSV" → Download matrix as CSV
   - Includes: trace ID, human feedback, all predictions, timestamps

---

## Component Specifications

### 1. Swipable Trace Card

**Purpose:** Touch/mouse-draggable card for rapid feedback.

**Features:**
- Drag right (👍), left (👎), down (😐)
- Visual feedback: Colored glow, icon, opacity
- Spring animation (Framer Motion)
- Threshold-based submission (100px horizontal, 80px vertical)
- Snap-back if released before threshold
- Auto-advance to next trace on submission

**Props:**
```typescript
interface SwipableTraceCardProps {
  trace: Trace
  onFeedback: (rating: 'positive' | 'negative' | 'neutral') => void
  onNext: () => void
  showInstructions?: boolean
}
```

**Visual States:**
- **Idle:** Card at center, no glow
- **Dragging right:** Card shifts right, green glow, 👍 icon grows
- **Dragging left:** Card shifts left, red glow, 👎 icon grows
- **Dragging down:** Card shifts down, gray glow, 😐 icon grows
- **Submitted:** Quick fade-out, next card fades in

### 2. Code Viewer

**Purpose:** Display Python code with syntax highlighting and actions.

**Features:**
- Syntax highlighting (use Prism.js or highlight.js)
- Line numbers
- Copy button (copies to clipboard)
- Download button (.py file)
- Read-only (no editing in UI)
- Dark theme preferred for code readability

**Props:**
```typescript
interface CodeViewerProps {
  code: string
  language: 'python'
  filename?: string
  onCopy?: () => void
}
```

### 3. Progress Bar

**Purpose:** Show completion percentage with visual feedback.

**Features:**
- Animated fill (smooth transition)
- Color gradient: Blue → Green as approaching 100%
- Percentage label
- Optional: Segments for milestones

**Props:**
```typescript
interface ProgressBarProps {
  current: number
  total: number
  label?: string
  showPercentage?: boolean
}
```

### 4. Job Progress Modal

**Purpose:** Monitor async operations (import, generate, execute).

**Features:**
- Real-time progress updates via SSE
- Step-by-step status (checkmark for completed steps)
- Progress bar
- Estimated time remaining
- Cancel button
- Auto-close on completion (optional)
- Error state with retry button

**Props:**
```typescript
interface JobProgressModalProps {
  jobId: string
  onComplete: (result: any) => void
  onError: (error: string) => void
  onCancel?: () => void
}
```

### 5. Matrix Table

**Purpose:** Tabular comparison view with expandable rows.

**Features:**
- Sortable columns (click header)
- Filterable rows
- Expandable rows (click to show detail)
- Visual indicators (✅ ❌ ⚠️)
- Pagination or infinite scroll
- Export to CSV

**Props:**
```typescript
interface MatrixTableProps {
  traces: MatrixRow[]
  evals: Eval[]
  onTraceClick: (traceId: string) => void
  onRefine: (evalId: string, traceIds: string[]) => void
  filters: MatrixFilters
  onFilterChange: (filters: MatrixFilters) => void
}
```

### 6. Eval Card

**Purpose:** Summary card for an eval in lists.

**Features:**
- Version number
- Accuracy percentage with color coding
- Status badges (active, contradictions, archived)
- Quick action buttons
- Hover effect
- Click to navigate to detail

**Props:**
```typescript
interface EvalCardProps {
  eval: Eval
  onClick: () => void
  onExecute?: () => void
  onRefine?: () => void
  onArchive?: () => void
}
```

---

## Interaction Patterns

### 1. Keyboard Shortcuts

**Global:**
- `?` → Show keyboard shortcuts help
- `Esc` → Close modal/cancel action
- `/` → Focus search input

**Trace Review:**
- `1` → Mark positive, advance
- `2` → Mark neutral, advance
- `3` → Mark negative, advance
- `←` → Previous trace
- `→` → Next trace
- `s` → Skip trace

**Navigation:**
- `g h` → Go home
- `g i` → Go to integrations
- `g t` → Go to traces
- `g e` → Go to eval sets
- `g r` → Go to review

**Matrix:**
- `f` → Toggle filter menu
- `c` → Show contradictions only
- `a` → Show all

### 2. Toast Notifications

**Purpose:** Provide instant feedback for user actions.

**Types:**
- ✅ **Success:** Green, checkmark icon
- ❌ **Error:** Red, X icon
- ⚠️ **Warning:** Yellow, warning icon
- ℹ️ **Info:** Blue, info icon

**Examples:**
- "✅ Eval set created"
- "✅ Feedback submitted"
- "✅ Eval generated! Accuracy: 93%"
- "❌ Import failed: Invalid API key"
- "⚠️ Low accuracy: Consider refining eval"

**Position:** Top-right corner
**Duration:** 3-5 seconds (error: persists until dismissed)
**Dismissible:** Click or auto-fade

### 3. Loading States

**Full-page loading:**
- Skeleton screens (preserve layout)
- Loading spinner + message

**Inline loading:**
- Spinner in button: [⏳ Generating...]
- Disabled state + spinner

**Background loading:**
- Progress bar at top (YouTube-style)
- Toast notification when complete

### 4. Empty States

**Purpose:** Guide users when no data exists.

**Elements:**
- Illustration or icon
- Clear message: "No [items] yet"
- Call-to-action button: "Create Your First [Item]"
- Optional: Helpful tips or tutorial link

**Examples:**
- "No eval sets yet" → [Create Eval Set]
- "No traces to review" → [Import Traces]
- "No evals generated" → [Generate Your First Eval]

### 5. Confirmation Modals

**Purpose:** Prevent accidental destructive actions.

**Layout:**
```
┌────────────────────────────────────┐
│  ⚠️ Confirm Delete                │
├────────────────────────────────────┤
│  Are you sure you want to delete  │
│  "Customer Support Quality"?      │
│                                    │
│  This will delete:                 │
│  • 3 generated evals               │
│  • 20 feedback entries             │
│                                    │
│  This action cannot be undone.     │
│                                    │
│        [Cancel]  [Delete]          │
└────────────────────────────────────┘
```

**Use for:**
- Delete eval set/eval/integration
- Cancel job
- Archive eval
- Bulk operations

---

## Visual Design Guidelines

### Color Palette

**Feedback:**
- Positive: `#22c55e` (green-500)
- Negative: `#ef4444` (red-500)
- Neutral: `#6b7280` (gray-500)

**Status:**
- Success: `#10b981` (green-600)
- Error: `#dc2626` (red-600)
- Warning: `#f59e0b` (amber-500)
- Info: `#3b82f6` (blue-500)

**Accuracy:**
- High (≥90%): `#22c55e` (green)
- Medium (70-89%): `#f59e0b` (yellow)
- Low (<70%): `#ef4444` (red)

**UI:**
- Primary: `#3b82f6` (blue-500)
- Background: `#ffffff` (light) / `#0f172a` (dark)
- Text: `#1f2937` (light) / `#f1f5f9` (dark)
- Border: `#e5e7eb` (light) / `#334155` (dark)

### Typography

**Headings:**
- H1: 2.5rem (40px), bold
- H2: 2rem (32px), bold
- H3: 1.5rem (24px), semibold

**Body:**
- Base: 1rem (16px), regular
- Small: 0.875rem (14px), regular
- Tiny: 0.75rem (12px), regular

**Code:**
- Monospace: `'Fira Code', 'Monaco', 'Consolas'`
- Size: 0.875rem (14px)

### Spacing

**Consistent 8px grid:**
- xs: 4px
- sm: 8px
- md: 16px
- lg: 24px
- xl: 32px
- 2xl: 48px

### Shadows

**Elevation:**
- Card: `0 1px 3px rgba(0,0,0,0.1)`
- Hover: `0 4px 6px rgba(0,0,0,0.1)`
- Modal: `0 20px 25px rgba(0,0,0,0.15)`

### Animations

**Transitions:**
- Fast: 150ms (buttons, hover)
- Medium: 300ms (modals, cards)
- Slow: 500ms (page transitions)

**Easing:**
- `ease-out` for appearing
- `ease-in` for disappearing
- `ease-in-out` for transformations

**Framer Motion:**
- Spring animations for swipe cards
- `type: "spring", stiffness: 300, damping: 30`

---

## Accessibility

### WCAG 2.1 AA Compliance

**Color Contrast:**
- Text: Minimum 4.5:1 ratio
- Large text: Minimum 3:1 ratio
- Interactive elements: Minimum 3:1 ratio

**Keyboard Navigation:**
- All interactive elements focusable
- Visible focus indicators
- Logical tab order
- Skip to content link

**Screen Reader Support:**
- Semantic HTML (`<nav>`, `<main>`, `<button>`)
- ARIA labels for icons
- ARIA live regions for dynamic content
- Alt text for images

**Motor Accessibility:**
- Large click targets (44x44px minimum)
- Swipe threshold not too sensitive
- Alternative keyboard shortcuts
- Undo functionality

**Cognitive Accessibility:**
- Clear error messages
- Consistent navigation
- Progressive disclosure
- Undo/cancel for destructive actions

### ARIA Attributes

**Examples:**
- `aria-label="Mark as positive"` (icon buttons)
- `aria-live="polite"` (toast notifications)
- `aria-expanded="false"` (collapsible sections)
- `aria-current="page"` (active nav link)
- `role="progressbar"` (progress bars)

---

## Meta-Prompt Optimization

### Custom Instructions Field

**Purpose:** Allow users to guide eval generation with domain-specific requirements.

**Examples:**

1. **Accuracy over speed:**
   ```
   Prioritize accuracy over response speed. Consider if the
   agent provided correct information, even if delayed.
   ```

2. **Tone detection:**
   ```
   Check if the agent's tone is empathetic and professional,
   not just technically correct.
   ```

3. **Tool usage:**
   ```
   Ensure the agent used the correct tools (get_policy_doc)
   and didn't hallucinate information.
   ```

4. **Compliance:**
   ```
   Verify the agent followed GDPR guidelines and didn't
   share personal data inappropriately.
   ```

**Implementation:**
- Text area (4-6 lines)
- Character limit: 500
- Placeholder with examples
- Tooltip: "These instructions will be added to the meta-prompt to guide eval generation."

**Meta-Prompt Structure:**

```
You are generating a Python eval function to classify execution traces.

User Goal:
{eval_name}
{eval_description}

Custom Instructions:
{custom_instructions}

Training Examples:
- 15 positive examples (human feedback: 👍)
- 3 negative examples (human feedback: 👎)
- 2 neutral examples (human feedback: 😐)

Example traces:
{training_traces}

Generate a Python function with signature:
def {function_name}(trace: dict) -> tuple[bool, str]:
    ...

Requirements:
- Return (result: bool, reason: str)
- Use only allowed imports: json, re, typing
- Handle missing data gracefully
- Be deterministic (same input → same output)
- Prioritize accuracy over complexity
```

### Refinement Workflow

**Scenario:** Eval has 3 contradictions

**UI Flow:**
1. Click "Refine Based on Contradictions" on eval detail page
2. Opens generation modal with:
   - Name: "{name} v{N+1}"
   - Original training data: 20 traces
   - Additional data: 3 contradiction cases
   - Custom instructions: Pre-filled from original + editable
   - New section: "Contradiction Patterns Detected"
     ```
     • 3 cases where agent escalated but human marked positive
     • Pattern: Humans value escalation as satisfactory resolution
     ```
3. User can:
   - Edit custom instructions to address pattern
   - Example: "Consider escalation to human as a valid response."
   - Click "Generate v4"
4. New eval generated with expanded training set (23 traces)
5. Test on same contradictions → Show improvement

**Meta-Prompt for Refinement:**

```
You are refining an existing eval function that had contradictions
with human feedback.

Original Eval:
{original_code}

Original Accuracy: 87%
Contradictions: 3

Contradiction Analysis:
{contradiction_patterns}

Original Training Data: 20 traces
Additional Training Data: 3 contradiction cases
Total: 23 traces

User Instructions:
{refined_custom_instructions}

Generate an improved version that:
1. Addresses the contradiction patterns
2. Maintains accuracy on original training set
3. Improves predictions on contradiction cases
4. Remains deterministic and explainable
```

---

## Summary

This UX/UI specification covers:

1. **Core User Flows:** First-time setup, daily review, contradiction detection, matrix analysis
2. **Page Specifications:** Dashboard, integrations, traces, eval sets, review (swipe interface), eval detail, matrix view
3. **Component Specs:** Swipable cards, code viewer, progress bars, job monitors, matrix tables
4. **Interaction Patterns:** Keyboard shortcuts, toasts, loading states, confirmations
5. **Visual Design:** Colors, typography, spacing, shadows, animations
6. **Accessibility:** WCAG compliance, keyboard navigation, screen readers
7. **Meta-Prompt Optimization:** Custom instructions, refinement workflow

**Key UX Principles:**
- **Speed:** Keyboard shortcuts, swipe gestures, minimal clicks
- **Clarity:** Visual indicators, progress tracking, clear status
- **Feedback:** Instant toasts, real-time updates, colored states
- **Forgiveness:** Undo, edit, refine, compare versions
- **Progressive Disclosure:** Start simple, reveal complexity as needed

---

**Last Updated:** 2025-11-17
**Version:** 1.0
