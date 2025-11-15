# Trace Review Card - Interaction Flow

## User Interaction Flowchart

```
┌─────────────────────────────────────────────────────────┐
│                   User Sees Card                         │
└─────────────────┬───────────────────────────────────────┘
                  │
                  ▼
         ┌────────────────────┐
         │ What does user do? │
         └────────┬───────────┘
                  │
        ┌─────────┼─────────────────┬──────────────┐
        │         │                 │              │
        ▼         ▼                 ▼              ▼
    ┌───────┐ ┌───────┐        ┌───────┐      ┌──────┐
    │Swipe  │ │ Press │        │ Click │      │ Want │
    │Card   │ │ Key   │        │Button │      │More  │
    └───┬───┘ └───┬───┘        └───┬───┘      └───┬──┘
        │         │                │              │
        │         │                │              │
        ▼         ▼                ▼              ▼
    ┌───────────────────────────────────┐    ┌────────┐
    │      Feedback Action              │    │Press E │
    │                                   │    │or Click│
    │  Right: Positive  (Green Glow)    │    │Expand  │
    │  Left:  Negative  (Red Glow)      │    └───┬────┘
    │  Down:  Neutral   (Gray Glow)     │        │
    │  Key 1: Positive                  │        ▼
    │  Key 2: Neutral                   │    ┌────────┐
    │  Key 3: Negative                  │    │ Toggle │
    │  Click: User Choice               │    │Previous│
    └───────────────┬───────────────────┘    │Messages│
                    │                        └───┬────┘
                    ▼                            │
            ┌───────────────┐                   │
            │ onFeedback()  │                   │
            │   callback    │                   │
            └───────┬───────┘                   │
                    │                            │
                    ▼                            │
            ┌───────────────┐                   │
            │ Submit to API │◄──────────────────┘
            └───────┬───────┘                (Return to Card)
                    │
                    ▼
            ┌───────────────┐
            │  Show Toast   │
            │  "Marked as   │
            │   positive"   │
            └───────┬───────┘
                    │
                    ▼
            ┌───────────────┐
            │  Card Exit    │
            │  Animation    │
            │  (fade out)   │
            └───────┬───────┘
                    │
                    ▼
            ┌───────────────┐
            │  Next Card    │
            │  Animation    │
            │  (fade in)    │
            └───────────────┘
```

## State Machine

```
┌─────────────────────────────────────────────────────────┐
│                    Card States                           │
└─────────────────────────────────────────────────────────┘

     IDLE
       │
       │ User starts drag
       ▼
    DRAGGING ──────► Drag distance/velocity checked
       │
       │ Release drag
       ▼
  ┌─────────┐
  │Threshold│
  │ Check   │
  └────┬────┘
       │
   ┌───┴───┐
   │       │
   ▼       ▼
  YES     NO
   │       │
   │       └──► Reset position (spring back)
   │              └──► IDLE
   │
   ├──► Right (>100px or >500px/s velocity)
   │    └──► onFeedback('positive')
   │         └──► EXITING
   │
   ├──► Left (>100px or >500px/s velocity)
   │    └──► onFeedback('negative')
   │         └──► EXITING
   │
   └──► Down (>100px or >500px/s velocity)
        └──► onFeedback('neutral')
             └──► EXITING

  EXITING
     │
     │ Animation complete (200ms)
     ▼
   NEXT CARD
     │
     │ Card enters (300ms)
     ▼
   IDLE
```

## Component Communication Flow

```
┌─────────────────────────────────────────────────────────┐
│                   Parent Page                            │
│  - Manages trace list                                    │
│  - Tracks current index                                  │
│  - Handles API calls                                     │
└───────────────────┬─────────────────────────────────────┘
                    │
                    │ Props:
                    │ - trace: ParsedTrace
                    │ - onFeedback(rating)
                    │ - onNext()
                    │ - onPrevious()
                    │ - onSkip()
                    ▼
┌─────────────────────────────────────────────────────────┐
│                    TraceCard                             │
│  - Motion values (x, y, rotation, opacity)               │
│  - Drag handlers                                         │
│  - Keyboard listeners                                    │
│  - Expand state                                          │
└───────────────────┬─────────────────────────────────────┘
                    │
        ┌───────────┼───────────┬──────────┬──────────┐
        │           │           │          │          │
        ▼           ▼           ▼          ▼          ▼
  ┌─────────┐ ┌──────────┐ ┌──────┐ ┌────────┐ ┌──────────┐
  │ Trace   │ │ Message  │ │ Tool │ │Previous│ │ Action   │
  │ Header  │ │ Display  │ │Calls │ │ Steps  │ │ Bar      │
  └─────────┘ └──────────┘ └──────┘ └────────┘ └──────────┘
       │           │           │         │           │
       │           │           │         │           │
       │           │           │         │           └──► onFeedback()
       │           │           │         │               ▲
       │           │           │         │               │
       │           │           │         └───────────────┘
       │           │           │              (bubbles up)
       │           │           │
       │           └──────┬────┘
       │                  │
       └──────────────────┘
           (Render only)
```

## Gesture Recognition Flow

```
Touch/Mouse Down
       │
       ▼
┌─────────────┐
│ Start Track │
│ - X/Y start │
│ - Timestamp │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ Mouse Move  │◄────┐
│ - Update X/Y│     │
│ - Calculate │     │
│   offset    │     │
└──────┬──────┘     │
       │            │
       │ Still      │
       │ dragging   │
       └────────────┘
       │
       │ Release
       ▼
┌─────────────────────┐
│ Calculate:          │
│ - Final offset      │
│ - Velocity (px/ms)  │
└──────┬──────────────┘
       │
       ▼
┌─────────────────────┐
│ Check Thresholds:   │
│                     │
│ Offset > 100px  OR  │
│ Velocity > 500px/s  │
└──────┬──────────────┘
       │
   ┌───┴───┐
   │       │
   ▼       ▼
  YES     NO
   │       │
   │       └──► Spring back animation
   │            (x: 0, y: 0)
   │
   ▼
┌──────────────────────┐
│ Determine Direction: │
│                      │
│ abs(x) > abs(y)?     │
└──────┬───────────────┘
       │
   ┌───┴───┐
   │       │
   ▼       ▼
  YES     NO
   │       │
   │ Horizontal    │ Vertical
   │               │
   │               └──► Y > 0? → Neutral (down)
   │
   └──► X > 0? → Positive (right)
        X < 0? → Negative (left)
```

## Keyboard Event Flow

```
Key Press
   │
   ▼
┌──────────────┐
│ Event Check  │
│ - Is input?  │ ──YES──► Ignore (user typing)
│ - Has focus? │
└───────┬──────┘
        │
        NO
        ▼
┌──────────────────┐
│ Key Switch:      │
│                  │
│ '1' → positive   │ ──► onFeedback('positive')
│ '2' → neutral    │ ──► onFeedback('neutral')
│ '3' → negative   │ ──► onFeedback('negative')
│ ' ' → skip       │ ──► onSkip() or onNext()
│ '→' → next       │ ──► onNext()
│ '←' → previous   │ ──► onPrevious()
│ 'e' → expand     │ ──► setExpanded(!expanded)
└──────────────────┘
```

## Animation Timeline

```
Card Lifecycle Timeline (in milliseconds)
─────────────────────────────────────────────────────────

0ms          300ms         [user interaction]      0ms     200ms
│              │                                    │        │
├──────────────┤                                    ├────────┤
│   Enter      │        Idle State                 │  Exit  │
│ Animation    │    (waiting for input)            │ Anim   │
│              │                                    │        │
│ Opacity: 0→1 │                                    │ 1→0    │
│ Scale: 0.9→1 │                                    │ 1→0.9  │
│ Y: 20→0      │                                    │ 0→-20  │
└──────────────┘                                    └────────┘

                    Drag Animation (continuous)
                    ───────────────────────────
                    │
                    ├─ X offset → rotation (±15°)
                    ├─ X offset → box shadow (color)
                    └─ Distance → opacity (0.5-1)
```

## Visual Feedback Timeline

```
Drag Gesture Visual States
──────────────────────────────────────────────────────

Start Drag
    │
    ▼
┌─────────────────────────────────────────────────┐
│ NEUTRAL STATE                                    │
│ - Box shadow: normal (gray)                      │
│ - Rotation: 0°                                   │
│ - Opacity: 1                                     │
│ - Cursor: grab                                   │
└─────────────────────────────────────────────────┘
    │
    │ Drag right >50px
    ▼
┌─────────────────────────────────────────────────┐
│ POSITIVE HINT                                    │
│ - Box shadow: light green glow                   │
│ - Rotation: ~7° clockwise                        │
│ - Opacity: 1                                     │
│ - Cursor: grabbing                               │
└─────────────────────────────────────────────────┘
    │
    │ Drag right >100px
    ▼
┌─────────────────────────────────────────────────┐
│ POSITIVE COMMIT                                  │
│ - Box shadow: bright green glow (0.5 opacity)    │
│ - Rotation: ~15° clockwise                       │
│ - Opacity: 1                                     │
│ - Ready to trigger on release                    │
└─────────────────────────────────────────────────┘

Similar states for:
- Left drag (negative): Red glow, counter-clockwise
- Down drag (neutral): Gray glow, slight scale down
```

## Data Flow Diagram

```
┌──────────────────────────────────────────────────────┐
│                  Backend API                          │
│  GET /api/traces?has_feedback=false                   │
└───────────────────┬──────────────────────────────────┘
                    │
                    │ Raw Trace[]
                    ▼
┌──────────────────────────────────────────────────────┐
│              Worker 1: Trace Parser                   │
│  parseTraces(traces) → ParsedTrace[]                  │
└───────────────────┬──────────────────────────────────┘
                    │
                    │ ParsedTrace[]
                    ▼
┌──────────────────────────────────────────────────────┐
│            Parent Component State                     │
│  - traces: ParsedTrace[]                              │
│  - currentIndex: number                               │
│  - feedbackLog: string[]                              │
└───────────────────┬──────────────────────────────────┘
                    │
                    │ traces[currentIndex]
                    ▼
┌──────────────────────────────────────────────────────┐
│            Worker 2: TraceCard                        │
│  Renders current trace with interactions              │
└───────────────────┬──────────────────────────────────┘
                    │
                    │ User feedback
                    ▼
┌──────────────────────────────────────────────────────┐
│          onFeedback(rating) callback                  │
│  1. Submit to API                                     │
│  2. Update feedbackLog                                │
│  3. Increment currentIndex                            │
└───────────────────┬──────────────────────────────────┘
                    │
                    │ POST /api/feedback
                    ▼
┌──────────────────────────────────────────────────────┐
│                  Backend API                          │
│  Store feedback in database                           │
└──────────────────────────────────────────────────────┘
```

## Error Handling Flow

```
User Action
    │
    ▼
Try Feedback Submission
    │
    ├──► Success
    │    ├─ Show toast: "Marked as positive"
    │    ├─ Update local state
    │    └─ Move to next card
    │
    └──► Error
         ├─ Network Error
         │  ├─ Show toast: "Network error, retry?"
         │  ├─ Keep current card visible
         │  └─ Store feedback locally
         │
         ├─ Validation Error
         │  ├─ Show toast: "Invalid feedback"
         │  └─ Keep card visible
         │
         └─ Server Error
            ├─ Show toast: "Server error"
            ├─ Log error
            └─ Allow retry or skip
```

---

## Performance Optimizations

### Render Optimization
- Only current card rendered (not entire list)
- Sub-components use stable props (avoid re-renders)
- Motion values updated outside React render cycle

### Animation Optimization
- GPU-accelerated transforms (translateX, rotateZ)
- No layout-triggering properties animated
- Debounced event handlers where appropriate

### Memory Management
- Event listeners cleaned up on unmount
- Motion values reset between cards
- Large data structures not held in state

---

**End of Interaction Flow Documentation**
