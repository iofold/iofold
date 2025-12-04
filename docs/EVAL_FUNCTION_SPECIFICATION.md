# Eval Function Specification

This document defines the interface and requirements for eval functions in iofold.

## Overview

Eval functions are Python functions that evaluate agent traces and return a pass/fail verdict with reasoning. They are executed in a secure sandbox environment with strict security constraints.

## Function Signature

```python
def eval_<name>(trace: dict) -> tuple[bool, str]:
    """
    Evaluates a trace and returns (pass/fail, reason).

    Args:
        trace: Dictionary containing normalized trace data

    Returns:
        tuple: (passed: bool, reason: str)
            - passed: True if trace passes evaluation, False otherwise
            - reason: Human-readable explanation of the verdict
    """
```

### Naming Convention

- Function name **must** start with `eval_`
- Use snake_case for the rest of the name
- Name should describe what is being evaluated

**Examples:**
- `eval_response_quality`
- `eval_tool_usage_correctness`
- `eval_customer_support_agent`

## Input: Trace Data Structure

The `trace` parameter is a dictionary with the following structure:

```python
{
    "trace_id": "unique-identifier-string",
    "steps": [
        {
            "input": any,           # User input or request data
            "output": any,          # Agent response/output
            "tool_calls": [         # List of tool calls made
                {
                    "name": "tool_name",
                    "arguments": {...},
                    "result": any
                }
            ],
            "error": str | None     # Error message if step failed
        },
        # ... more steps ...
    ]
}
```

### Accessing Trace Data

```python
# Get trace ID
trace_id = trace.get('trace_id')

# Get all steps
steps = trace.get('steps', [])

# Get first step (initial user input)
first_step = steps[0] if steps else None

# Get last step (final response)
last_step = steps[-1] if steps else None

# Access specific fields
user_input = first_step.get('input', {}) if first_step else {}
final_output = last_step.get('output', {}) if last_step else {}

# Check for errors in any step
has_errors = any(step.get('error') for step in steps)
```

## Output: Return Value

Evals **must** return a 2-tuple:

```python
# Passing evaluation
return (True, "Response meets quality standards")

# Failing evaluation
return (False, "Response lacks required information")
```

### Requirements

1. **First element must be boolean** - `True` or `False`, not truthy/falsy values
2. **Second element must be string** - Human-readable reason for the verdict
3. **Reason should be informative** - Explain why the trace passed or failed

### Anti-patterns (DO NOT DO)

```python
# BAD: Using truthy values instead of booleans
return (1, "reason")           # Use True instead
return ("yes", "reason")       # Use True instead

# BAD: Non-string reason
return (True, None)            # Use empty string "" if no reason
return (True, 123)             # Reason must be string

# BAD: Missing reason
return True                    # Must return tuple
return (True,)                 # Must have both elements
```

## Allowed Imports

For security, only the following imports are permitted:

| Module | Purpose |
|--------|---------|
| `json` | JSON parsing/serialization |
| `re` | Regular expressions |
| `typing` | Type hints |

### Example Usage

```python
import json
import re
from typing import Optional, List

def eval_response_format(trace: dict) -> tuple[bool, str]:
    steps = trace.get('steps', [])
    if not steps:
        return False, "No steps found in trace"

    output = steps[-1].get('output', '')

    # Check for JSON format
    try:
        json.loads(str(output))
        return True, "Output is valid JSON"
    except json.JSONDecodeError:
        return False, "Output is not valid JSON"
```

## Blocked Operations

The following are **blocked** for security:

### Blocked Imports
- `os`, `sys`, `subprocess` - System access
- `socket`, `urllib`, `requests`, `http` - Network access
- `ftplib`, `smtplib` - File/email protocols
- `pickle`, `shelve`, `dbm` - Serialization (security risk)

### Blocked Functions
- `eval()` - Dynamic code execution
- `exec()` - Dynamic code execution
- `compile()` - Code compilation
- `__import__()` - Dynamic imports

### Blocked Operations
- File I/O (no `open()`, file reading/writing)
- Network requests
- Subprocess execution
- Environment variable access

## Execution Constraints

| Constraint | Value | Notes |
|------------|-------|-------|
| Timeout | 5 seconds | Hard limit per trace |
| Memory | 50 MB | Maximum memory usage |
| Network | Disabled | No external connections |
| File I/O | Disabled | Cannot read/write files |

## Complete Examples

### Example 1: Response Quality Eval

```python
def eval_response_quality(trace: dict) -> tuple[bool, str]:
    """Evaluates response quality based on length and content."""
    steps = trace.get('steps', [])
    if not steps:
        return False, "No steps found in trace"

    last_step = steps[-1]
    output = last_step.get('output', {})
    response = str(output.get('response', output))

    # Check minimum length
    if len(response) < 10:
        return False, f"Response too short ({len(response)} chars)"

    # Check for error indicators
    error_patterns = ['error', 'failed', 'cannot', 'unable']
    for pattern in error_patterns:
        if pattern.lower() in response.lower():
            return False, f"Response contains error indicator: '{pattern}'"

    return True, "Response meets quality criteria"
```

### Example 2: Tool Usage Eval

```python
def eval_tool_usage(trace: dict) -> tuple[bool, str]:
    """Evaluates correct tool usage in agent traces."""
    steps = trace.get('steps', [])

    tool_calls = []
    for step in steps:
        calls = step.get('tool_calls', [])
        tool_calls.extend(calls)

    if not tool_calls:
        return False, "No tool calls found"

    # Check for required tool
    required_tool = 'search'
    tool_names = [call.get('name', '') for call in tool_calls]

    if required_tool not in tool_names:
        return False, f"Missing required tool call: {required_tool}"

    # Check for errors in tool results
    for call in tool_calls:
        result = call.get('result', {})
        if isinstance(result, dict) and result.get('error'):
            return False, f"Tool '{call.get('name')}' returned error"

    return True, "All tool calls executed correctly"
```

### Example 3: Customer Support Eval

```python
import re

def eval_customer_support(trace: dict) -> tuple[bool, str]:
    """Evaluates customer support agent responses."""
    steps = trace.get('steps', [])
    if not steps:
        return False, "No steps in trace"

    # Get the final response
    last_output = steps[-1].get('output', {})
    response = str(last_output.get('response', last_output))

    # Quality indicators (should be present)
    quality_indicators = [
        'help', 'assist', 'understand', 'solution',
        'recommend', 'suggest', 'please', 'thank'
    ]
    has_quality = any(ind in response.lower() for ind in quality_indicators)

    # Negative patterns (should be absent)
    negative_patterns = [
        r"i don't know",
        r"i cannot help",
        r"that's not my job",
        r"contact someone else"
    ]
    has_negative = any(
        re.search(pattern, response, re.IGNORECASE)
        for pattern in negative_patterns
    )

    if has_negative:
        return False, "Response contains unhelpful patterns"

    if not has_quality:
        return False, "Response lacks quality indicators"

    return True, "Response demonstrates good customer support"
```

## Validation

Before execution, all eval code undergoes static analysis:

1. **Import Validation** - Only whitelisted imports allowed
2. **Function Detection** - Checks for blocked functions like `eval()`, `exec()`
3. **Syntax Check** - Ensures valid Python syntax

Failed validation returns an error without executing the code.

## Result Storage

Eval results are stored in the `eval_executions` table:

| Column | Type | Description |
|--------|------|-------------|
| `eval_id` | string | Reference to eval |
| `trace_id` | string | Reference to trace |
| `result` | boolean | Pass (1) or Fail (0) |
| `reason` | string | Explanation text |
| `execution_time_ms` | integer | Execution duration |
| `error` | string | Error message if failed |
| `stdout` | string | Captured output |
| `stderr` | string | Captured errors |

## Contradictions

A **contradiction** occurs when:
- Eval result (pass/fail) **disagrees** with human feedback (positive/negative)

Contradictions are automatically tracked via the `eval_comparison` view:
- `positive` human feedback + `fail` eval = contradiction
- `negative` human feedback + `pass` eval = contradiction

High contradiction rates indicate the eval may need refinement.

## Best Practices

1. **Handle missing data gracefully** - Use `.get()` with defaults
2. **Keep evals focused** - Each eval should test one thing
3. **Write clear reasons** - Help users understand verdicts
4. **Avoid false positives** - Better to fail uncertain cases
5. **Test with diverse traces** - Ensure eval works across edge cases
6. **Use type hints** - Improves code clarity (from `typing` module)

## See Also

- [Sandbox Configuration](./SANDBOX_CONFIGURATION.md) - How to configure the execution sandbox
- [API Specification](./API_SPECIFICATION.md) - Eval API endpoints
