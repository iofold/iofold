"""
Sandbox module for safe execution of eval/reward functions.

This module provides utilities for:
- Safe execution of dynamically generated evaluation functions
- Static analysis and validation of eval code
- Batch execution across multiple traces

Example usage:
    from iofold_eval_core.sandbox import execute_reward_function, validate_eval_code

    # Validate code before execution
    code = '''
    def eval_quality(trace, ctx=None):
        steps = trace.get('steps', [])
        if len(steps) == 0:
            return 0.0, "No steps found"
        return 1.0, "Trace has steps"
    '''

    is_valid, errors = validate_eval_code(code)
    if is_valid:
        score, feedback = execute_reward_function(code, trace)
"""

from .executor import (
    ALLOWED_MODULES,
    execute_reward_function,
    execute_batch,
)

from .validator import (
    FORBIDDEN_IMPORTS,
    FORBIDDEN_CALLS,
    ALLOWED_MODULES as VALIDATOR_ALLOWED_MODULES,
    CodeValidator,
    validate_eval_code,
    get_validation_warnings,
    quick_check,
)

__all__ = [
    # Executor
    "ALLOWED_MODULES",
    "execute_reward_function",
    "execute_batch",
    # Validator
    "FORBIDDEN_IMPORTS",
    "FORBIDDEN_CALLS",
    "CodeValidator",
    "validate_eval_code",
    "get_validation_warnings",
    "quick_check",
]
