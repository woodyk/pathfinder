#!/usr/bin/env python3
# -*- coding: utf-8 -*-
#
# File: run_python_code.py
# Author: Wadih Khairallah
# Description: 
# Created: 2025-04-04 22:51:54
# Modified: 2025-04-05 01:26:01

import io
from contextlib import redirect_stdout, redirect_stderr
from typing import Dict, Any

from rich.console import Console
from rich.prompt import Confirm
from rich.syntax import Syntax
from rich.rule import Rule

# Persistent namespace
persistent_python_env = {}
console = Console()
print = console.print
log = console.log

def run_python_code(
    code: str
) -> Dict[str, Any]:
    """Execute Python code in a persistent environment and return its output.

    Args:
        code (str): The Python code to execute. Can be multiple lines.

    Returns:
        Dict[str, Any]: A dictionary containing:
            - status (str): Execution status ("success", "error", or "cancelled")
            - output (str): Captured stdout output
            - error (str): Captured stderr output (if any)
            - namespace (Dict[str, Any]): All variables in the persistent namespace

    Example:
        >>> result = run_python_code("x = 5\ny = 10\nx + y")
        >>> print(result['output'])  # Prints "15"
        >>> print(result['namespace'])  # Shows {'x': 5, 'y': 10}
    """
    console.print(Syntax(f"\n{code.strip()}\n", "python", theme="monokai"))

    answer = Confirm.ask("Execute? [y/n]:", default=False)
    if not answer:
        console.print("[red]Execution cancelled[/red]")
        return {"status": "cancelled", "message": "Execution aborted by user."}

    stdout_capture = io.StringIO()
    stderr_capture = io.StringIO()

    console.print(Rule())
    try:
        with redirect_stdout(stdout_capture), redirect_stderr(stderr_capture):
            exec(code, persistent_python_env)

        stdout_output = stdout_capture.getvalue().strip()
        stderr_output = stderr_capture.getvalue().strip()

        if stdout_output:
            console.print(stdout_output)
        if stderr_output:
            console.print(f"[red]Error output:[/red] {stderr_output}")

        console.print(Rule())

        return {
            "status": "success",
            "output": stdout_output,
            "error": stderr_output if stderr_output else None,
            "namespace": {k: str(v) for k, v in persistent_python_env.items() if not k.startswith('__')}
        }

    except Exception as e:
        stderr_output = stderr_capture.getvalue().strip() or str(e)
        console.print(f"[red]Execution failed:[/red] {stderr_output}")
        console.print(Rule())

        return {
            "status": "error",
            "error": stderr_output,
            "output": stdout_capture.getvalue().strip() if stdout_capture.getvalue() else None,
            "namespace": {k: str(v) for k, v in persistent_python_env.items() if not k.startswith('__')}
        }

# Optional interactive use
if __name__ == "__main__":
    user_code = input("Enter Python code to execute: ")
    result = run_python_code(user_code)
    print(result)
