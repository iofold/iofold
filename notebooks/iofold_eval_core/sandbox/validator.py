"""
Validator for eval/reward function code.

Provides static analysis to detect potentially dangerous code patterns
before execution.
"""

import ast
import re
from typing import List, Tuple, Set

# Forbidden imports that could be dangerous
FORBIDDEN_IMPORTS = [
    # System/OS access
    'os',
    'subprocess',
    'sys',
    'shutil',
    'pathlib',
    # Network access
    'socket',
    'requests',
    'urllib',
    'http',
    'httplib',
    'ftplib',
    'smtplib',
    'telnetlib',
    'ssl',
    # Serialization (pickle can execute arbitrary code)
    'pickle',
    'shelve',
    'dbm',
    'marshal',
    'cPickle',
    # Code execution
    '__import__',
    'importlib',
    'builtins',
    '__builtins__',
    # File I/O
    'io',
    'tempfile',
    # Process control
    'multiprocessing',
    'threading',
    'concurrent',
    'asyncio',
    # C extensions
    'ctypes',
    'cffi',
]

# Forbidden function calls
FORBIDDEN_CALLS = [
    'eval',
    'exec',
    'compile',
    'open',
    'input',
    '__import__',
    'getattr',
    'setattr',
    'delattr',
    'globals',
    'locals',
    'vars',
    'dir',
    'breakpoint',
]

# Allowed modules (must match executor.ALLOWED_MODULES)
ALLOWED_MODULES = {
    'json',
    're',
    'math',
    'datetime',
    'difflib',
    'typing',
}


class CodeValidator:
    """Validates eval/reward function code for safety."""

    def __init__(self, code: str):
        self.code = code
        self.errors: List[str] = []
        self.warnings: List[str] = []
        self.tree: ast.AST = None

    def _parse(self) -> bool:
        """Parse the code into an AST."""
        try:
            self.tree = ast.parse(self.code)
            return True
        except SyntaxError as e:
            self.errors.append(f"Syntax error: {e}")
            return False

    def _check_function_definition(self) -> bool:
        """Check that code defines an eval_* or reward_* function."""
        if self.tree is None:
            return False

        for node in ast.walk(self.tree):
            if isinstance(node, ast.FunctionDef):
                if node.name.startswith('eval_') or node.name.startswith('reward_'):
                    # Check function has 'trace' parameter
                    args = node.args
                    arg_names = [arg.arg for arg in args.args]
                    if 'trace' not in arg_names:
                        self.errors.append(
                            f"Function '{node.name}' must have 'trace' as first parameter"
                        )
                        return False
                    return True

        self.errors.append(
            "No eval_* or reward_* function found. "
            "Define a function like: def eval_quality(trace, ctx=None): ..."
        )
        return False

    def _check_return_statement(self) -> bool:
        """Check that the eval function has a return statement."""
        if self.tree is None:
            return False

        for node in ast.walk(self.tree):
            if isinstance(node, ast.FunctionDef):
                if node.name.startswith('eval_') or node.name.startswith('reward_'):
                    for child in ast.walk(node):
                        if isinstance(child, ast.Return):
                            return True
                    self.errors.append(
                        f"Function '{node.name}' must have a return statement"
                    )
                    return False
        return False

    def _check_imports(self) -> bool:
        """Check for forbidden imports."""
        if self.tree is None:
            return False

        valid = True
        for node in ast.walk(self.tree):
            if isinstance(node, ast.Import):
                for alias in node.names:
                    module = alias.name.split('.')[0]
                    if module in FORBIDDEN_IMPORTS:
                        self.errors.append(f"Forbidden import: {module}")
                        valid = False
                    elif module not in ALLOWED_MODULES:
                        self.warnings.append(f"Unknown import: {module} (may not be available)")

            elif isinstance(node, ast.ImportFrom):
                module = node.module.split('.')[0] if node.module else ''
                if module in FORBIDDEN_IMPORTS:
                    self.errors.append(f"Forbidden import: {module}")
                    valid = False
                elif module and module not in ALLOWED_MODULES:
                    self.warnings.append(f"Unknown import: {module} (may not be available)")

        return valid

    def _check_forbidden_calls(self) -> bool:
        """Check for forbidden function calls."""
        if self.tree is None:
            return False

        valid = True
        for node in ast.walk(self.tree):
            if isinstance(node, ast.Call):
                func = node.func
                if isinstance(func, ast.Name):
                    if func.id in FORBIDDEN_CALLS:
                        self.errors.append(f"Forbidden function call: {func.id}()")
                        valid = False
                elif isinstance(func, ast.Attribute):
                    if func.attr in FORBIDDEN_CALLS:
                        self.errors.append(f"Forbidden method call: .{func.attr}()")
                        valid = False

        return valid

    def _check_dunder_access(self) -> bool:
        """Check for suspicious dunder attribute access."""
        if self.tree is None:
            return False

        valid = True
        suspicious_dunders = {
            '__class__', '__bases__', '__mro__', '__subclasses__',
            '__globals__', '__code__', '__func__', '__self__',
            '__dict__', '__builtins__', '__import__',
        }

        for node in ast.walk(self.tree):
            if isinstance(node, ast.Attribute):
                if node.attr in suspicious_dunders:
                    self.errors.append(f"Suspicious attribute access: {node.attr}")
                    valid = False
            elif isinstance(node, ast.Subscript):
                if isinstance(node.slice, ast.Constant):
                    if isinstance(node.slice.value, str) and node.slice.value in suspicious_dunders:
                        self.errors.append(f"Suspicious key access: {node.slice.value}")
                        valid = False

        return valid

    def _check_uses_trace(self) -> bool:
        """Check that the code actually uses the 'trace' parameter."""
        if self.tree is None:
            return False

        for node in ast.walk(self.tree):
            if isinstance(node, ast.FunctionDef):
                if node.name.startswith('eval_') or node.name.startswith('reward_'):
                    # Look for 'trace' name usage in the function
                    for child in ast.walk(node):
                        if isinstance(child, ast.Name) and child.id == 'trace':
                            return True
                    self.warnings.append(
                        f"Function '{node.name}' does not appear to use 'trace' parameter"
                    )
                    return True  # Just a warning, not an error

        return False

    def validate(self) -> Tuple[bool, List[str]]:
        """Run all validation checks.

        Returns:
            Tuple of (is_valid, list_of_errors)
        """
        if not self._parse():
            return False, self.errors

        checks = [
            self._check_function_definition,
            self._check_return_statement,
            self._check_imports,
            self._check_forbidden_calls,
            self._check_dunder_access,
            self._check_uses_trace,
        ]

        for check in checks:
            check()

        return len(self.errors) == 0, self.errors

    def get_warnings(self) -> List[str]:
        """Get non-fatal warnings from validation."""
        return self.warnings


def validate_eval_code(code: str) -> Tuple[bool, List[str]]:
    """Validate eval code for safety.

    Performs static analysis to check for:
    - Presence of eval_* or reward_* function
    - Return statement in the function
    - Forbidden imports (os, subprocess, socket, etc.)
    - Forbidden function calls (eval, exec, open, etc.)
    - Suspicious dunder attribute access

    Args:
        code: Python code to validate

    Returns:
        Tuple of (is_valid, list_of_errors)

    Example:
        >>> code = '''
        ... def eval_quality(trace, ctx=None):
        ...     return 1.0, "Good"
        ... '''
        >>> validate_eval_code(code)
        (True, [])

        >>> bad_code = '''
        ... def eval_bad(trace, ctx=None):
        ...     import os
        ...     return 1.0, ""
        ... '''
        >>> validate_eval_code(bad_code)
        (False, ['Forbidden import: os'])
    """
    validator = CodeValidator(code)
    return validator.validate()


def get_validation_warnings(code: str) -> List[str]:
    """Get non-fatal warnings from code validation.

    Args:
        code: Python code to validate

    Returns:
        List of warning messages
    """
    validator = CodeValidator(code)
    validator.validate()
    return validator.get_warnings()


def quick_check(code: str) -> bool:
    """Quick regex-based check for obviously dangerous patterns.

    This is faster than full AST validation and can be used as a
    first-pass filter before detailed validation.

    Args:
        code: Python code to check

    Returns:
        True if code passes quick check, False if obviously dangerous
    """
    dangerous_patterns = [
        r'\bimport\s+os\b',
        r'\bimport\s+subprocess\b',
        r'\bimport\s+socket\b',
        r'\bfrom\s+os\b',
        r'\bfrom\s+subprocess\b',
        r'\b__import__\s*\(',
        r'\beval\s*\(',
        r'\bexec\s*\(',
        r'\bcompile\s*\(',
        r'\bopen\s*\(',
        r'\b__builtins__\b',
        r'\b__class__\b.*\b__bases__\b',
        r'\b__mro__\b',
        r'\b__subclasses__\b',
    ]

    for pattern in dangerous_patterns:
        if re.search(pattern, code):
            return False

    return True
