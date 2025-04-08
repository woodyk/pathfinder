#!/usr/bin/env python3
# -*- coding: utf-8 -*-
#
# File: run_bash_command.py
# Author: Wadih Khairallah
# Description: 
# Created: 2025-04-04 22:52:52

import subprocess
import json

from rich.console import Console
from rich.prompt import Confirm
from rich.syntax import Syntax
from rich.rule import Rule

console = Console()
print = console.print
log = console.log

def run_bash_command(command: str) -> dict:
    """Execute a Bash command with interactive confirmation and return detailed results.

    This function executes a Bash command after user confirmation, displaying the command
    syntax highlighted and providing real-time output streaming. It captures both stdout
    and stderr, returning a comprehensive result dictionary.

    Args:
        command (str): The Bash command to execute.

    Returns:
        dict: A dictionary containing:
            - status (str): Execution status ("success", "error", or "cancelled")
            - output (str): Full command output if successful
            - error (str): Error message if execution failed
            - return_code (int): Process exit code
            - message (str): Additional status message

    Example:
        >>> result = run_bash_command("ls -l")
        >>> print(json.dumps(result, indent=2))
        {
          "status": "success",
          "output": "total 8\n-rw-r--r--  1 user  staff  123 Apr  5 12:34 file.txt",
          "error": null,
          "return_code": 0
        }

        # Cancelled execution
        >>> result = run_bash_command("rm -rf /")
        {
          "status": "cancelled",
          "message": "Execution aborted by user."
        }
    """
    console.print(Syntax(f"\n{command.strip()}\n", "bash", theme="monokai"))

    if not Confirm.ask("Execute? [y/n]:", default=False):
        console.print("[red]Execution cancelled[/red]")
        return {"status": "cancelled", "message": "Execution aborted by user."}

    try:
        process = subprocess.Popen(
            command,
            shell=True,
            executable="/bin/bash",
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1
        )

        full_output = ""
        console.print(Rule())

        while True:
            stdout_line = process.stdout.readline()
            if stdout_line:
                console.print(stdout_line.rstrip())
                full_output += stdout_line

            stderr_line = process.stderr.readline()
            if stderr_line:
                console.print(f"[red]{stderr_line.rstrip()}[/red]")
                full_output += stderr_line

            if process.poll() is not None and not stdout_line and not stderr_line:
                break

        return_code = process.wait()
        console.print(Rule())

        if return_code == 0:
            return {
                "status": "success",
                "output": full_output.rstrip(),
                "error": None,
                "return_code": return_code
            }
        else:
            return {
                "status": "error",
                "output": full_output.rstrip(),
                "error": f"Command exited with code {return_code}",
                "return_code": return_code
            }

    except Exception as e:
        error_message = f"Command execution error: {e}"
        console.print(f"[red]{error_message}[/red]")
        return {
            "status": "error",
            "output": None,
            "error": error_message
        }

# Optional interactive use
if __name__ == "__main__":
    user_cmd = input("Enter Bash command to run: ")
    result = run_bash_command(user_cmd)
    print(json.dumps(result, indent=2))
