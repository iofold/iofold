# Eval Function Generation: 5 Approaches

## Configuration
- **Model**: `gemini-3-flash-preview` (1M context, 64K output, $0.20/$0.80 per MTok)
- **Max Iterations**: 10 (increased from 5)
- **Candidates Per Iteration**: 5 (increased from 3)
- **Allowed Modules**: `json`, `re`, `math`, `datetime`, `difflib`, `typing`

## Current State
- Best accuracy: 58.2% (target: 80%)
- Main issues: LLM-generated code doesn't leverage the full trace structure effectively
- Key insight: The traces contain `metadata.expectedOutput` which is the ground truth answer

---

## Approach 1: LLM-Friendly Trace Format + Feedback Analysis

### Concept
Convert raw JSON traces to a human-readable narrative format that's easier for the LLM to understand. Include the human feedback text to help identify quality patterns.

### Implementation
1. **Trace Formatter**: Create a function that converts traces to readable text:
   ```
   === TRACE: trace_abc123 ===

   USER QUESTION:
   What is the main issue delaying the Detailed Interconnection Study?

   TOOL USAGE:
   1. email_search(keywords=["Interconnection Study", "delay"]) → Found 2 emails
   2. email_get(message_id="<123>") → Retrieved email about construction permits

   AGENT ANSWER:
   The main issue is delayed construction permits from the county.

   EXPECTED OUTPUT (Ground Truth):
   Permit delays from county planning department

   HUMAN FEEDBACK: Positive - Answer correctly identifies the permit issue
   ```

2. **Two-Phase Generation**:
   - Phase 1: Ask LLM to analyze 20+ formatted traces and explain WHY each got positive/negative feedback
   - Phase 2: Use those insights to generate eval functions

### Key Signals to Extract
- Does answer match expectedOutput semantically?
- Does answer cite sources from retrieved emails?
- Are tool results actually used in the answer?

---

## Approach 2: Contrastive Pairs Analysis

### Concept
Present the LLM with pairs of similar traces - one positive, one negative - and ask it to identify the specific differences that caused different ratings.

### Implementation
1. **Pair Selection**:
   - Group traces by similar user questions (e.g., all "variance" questions, all "meeting" questions)
   - For each group, pair a positive and negative trace

2. **Contrastive Prompt**:
   ```
   TRACE A (Score: 1.0 - POSITIVE):
   Question: Were there variances for hour 15 on 3/6/01?
   Tool Result: Found email with variance data
   Answer: Yes, SC_ID DELANO showed variance of 15 MW
   Expected: Yes, DELANO had 15 MW variance

   TRACE B (Score: 0.0 - NEGATIVE):
   Question: Were there variances for hour 15 on 3/6/01?
   Tool Result: No emails found
   Answer: Yes, SC_ID DELANO showed variance of 15 MW
   Expected: No variance data found in inbox

   ANALYSIS: What specific difference caused A to be positive and B to be negative?
   ```

3. **Pattern Extraction**: Generate eval functions that detect these specific failure modes

### Key Insight
Negative traces often have the SAME answer structure as positive ones, but the answer contradicts the tool results.

---

## Approach 3: Expected Output Comparison Focus

### Concept
Center the eval function entirely on comparing `output_preview` to `metadata.expectedOutput`. This is the ground truth - if we can match it, we win.

### Implementation
1. **Similarity Metrics**:
   - `difflib.SequenceMatcher` ratio
   - Key entity extraction and comparison
   - Negation detection (saying "not found" vs "found")

2. **Semantic Alignment Checks**:
   ```python
   def eval_expected_output_match(trace, ctx):
       output = trace.get('output_preview', '')
       expected = trace.get('metadata', {}).get('expectedOutput', '')

       # Direct similarity
       ratio = difflib.SequenceMatcher(None, output.lower(), expected.lower()).ratio()

       # Key entity overlap
       output_entities = extract_entities(output)  # numbers, names, dates
       expected_entities = extract_entities(expected)
       entity_overlap = len(output_entities & expected_entities) / max(len(expected_entities), 1)

       # Negation alignment
       output_negative = has_negation(output)  # "not found", "couldn't find"
       expected_negative = has_negation(expected)
       negation_match = output_negative == expected_negative

       score = 0.4 * ratio + 0.4 * entity_overlap + 0.2 * negation_match
       return score, f"Similarity: {ratio:.2f}, Entities: {entity_overlap:.2f}"
   ```

3. **Provide expectedOutput to LLM** in the prompt so it knows what a correct answer looks like

---

## Approach 4: Tool Usage Pattern Analysis

### Concept
The key quality signal is whether the answer is grounded in tool results. Create rules based on tool call patterns.

### Implementation
1. **Pattern Classification**:
   - `GROUNDED_POSITIVE`: Tool found data, answer summarizes it correctly
   - `GROUNDED_NEGATIVE`: Tool found nothing, answer says "not found"
   - `HALLUCINATION`: Tool found nothing, answer claims specific facts
   - `CONTRADICTION`: Tool found X, answer says Y

2. **Tool Result Parser**:
   ```python
   def analyze_tool_usage(trace):
       patterns = []
       for step in trace.get('steps', []):
           for tc in step.get('tool_calls', []):
               result = tc.get('result', {}).get('kwargs', {})
               status = result.get('status')
               content = result.get('content', '')

               if status == 'error':
                   patterns.append('ERROR')
               elif '"total": 0' in content or '"emails": []' in content:
                   patterns.append('EMPTY_RESULT')
               elif '"total":' in content:
                   patterns.append('HAS_RESULTS')
       return patterns
   ```

3. **Specificity vs Retrieval Check**:
   - Count specific facts in answer (numbers, names, dates)
   - If high specificity + EMPTY_RESULT → likely hallucination → score 0.0

---

## Approach 5: Failure Mode Clustering

### Concept
Cluster traces by their characteristics, identify dominant failure modes in each cluster, and generate specialized eval functions.

### Implementation
1. **Feature Extraction**:
   - Number of tool calls
   - Tool result status (success/error/empty)
   - Answer length and specificity
   - Question type (variance, meeting, person, etc.)

2. **Clustering**:
   - Use simple heuristics (since we can't use sklearn in sandbox):
     - Group by question keywords
     - Group by tool result patterns
     - Group by answer structure

3. **Per-Cluster Analysis**:
   ```
   CLUSTER: "variance" questions
   - 40 traces, 15 positive, 25 negative
   - Common failure: Agent hallucinates variance values when no emails found
   - Eval rule: If question contains "variance" AND tool_result=empty AND answer has numbers → score 0.0

   CLUSTER: "meeting" questions
   - 30 traces, 25 positive, 5 negative
   - Common failure: Agent gives wrong time/location
   - Eval rule: Check if answer time/location matches email content
   ```

4. **Ensemble**: Combine cluster-specific rules with weights

---

## Execution Plan

### Phase 1: Data Preparation
- [ ] Create trace formatter that produces LLM-friendly output
- [ ] Add expectedOutput to the context passed to eval functions
- [ ] Create contrastive pair generator

### Phase 2: Run Experiments
- [ ] Exp 3: Approach 1 - LLM-friendly format with feedback analysis
- [ ] Exp 4: Approach 2 - Contrastive pairs
- [ ] Exp 5: Approach 3 - Expected output focus
- [ ] Exp 6: Approach 4 - Tool usage patterns
- [ ] Exp 7: Approach 5 - Failure mode clustering

### Phase 3: Combine Best Results
- [ ] Analyze which approaches work best for which trace types
- [ ] Create ensemble eval function

---

## Key Files to Modify

1. **`iofold_eval_core/generation/prompts.py`**: Add trace formatting, expectedOutput emphasis
2. **`experiment_base.py`**: Pass expectedOutput to ctx in evaluate_traces()
3. **New experiments**: Create exp3-exp7 files implementing each approach
4. **`config.py`**: Already updated with gemini-3-flash-preview
