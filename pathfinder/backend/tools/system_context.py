#!/usr/bin/env python3
# -*- coding: utf-8 -*-
#
# File: system_context.py
# Author: Wadih Khairallah
# Description: 
# Created: 2025-04-04 21:47:25
# Modified: 2025-04-04 23:26:15

import platform
import datetime
import getpass
import os
import subprocess
import re
from rich.console import Console

console = Console()
print = console.print

def system_context():
    """
    Gather comprehensive system context information including OS, hardware, and environment details.

    Returns:
        str: A formatted string containing system context information in Markdown format.

    Example:
        >>> context = system_context()
        >>> print(context)  # Prints system information in Markdown format
    """
    os_name = platform.system()
    os_version = platform.release()
    os_full_name = platform.platform()
    now = datetime.datetime.now()
    local_time = now.strftime("%Y-%m-%d %H:%M:%S")
    try:
        timezone = datetime.datetime.now(datetime.timezone.utc).astimezone().tzname()
    except Exception:
        timezone = "Unknown"
    user_name = getpass.getuser()
    hostname = platform.node()
    current_directory = os.getcwd()
    architecture = platform.machine()
    python_version = platform.python_version()

    hardware_model = "Unknown"
    chip = "Unknown"
    memory_str = "Unknown"
    if os_name == "Darwin":
        try:
            hardware_model_raw = subprocess.check_output(["sysctl", "-n", "hw.model"], text=True).strip()
            profiler_output = subprocess.check_output(["system_profiler", "SPHardwareDataType"], text=True)
            model_match = re.search(r"Model Name: (.*)", profiler_output)
            size_match = re.search(r"Model Identifier:.*(\d+-inch)", profiler_output)
            date_match = re.search(r"Model Identifier:.*(\d{4})", profiler_output)
            if model_match is not None:
                model_name = model_match.group(1)
            else:
                model_name = "MacBook"
            if size_match is not None:
                size = size_match.group(1)
            else:
                size = ""
            if date_match is not None:
                date = date_match.group(1)
            else:
                date = ""
            if size and date:
                hardware_model = model_name + " (" + size + ", " + date + ")"
            else:
                hardware_model = hardware_model_raw
            chip = subprocess.check_output(["sysctl", "-n", "machdep.cpu.brand_string"], text=True).strip()
            memory_raw = subprocess.check_output(["sysctl", "-n", "hw.memsize"], text=True).strip()
            memory_str = str(round(int(memory_raw) / (1024 ** 3))) + " GB"
            os_product = subprocess.check_output(["sw_vers", "-productName"], text=True).strip()
            os_version_full = subprocess.check_output(["sw_vers", "-productVersion"], text=True).strip()
            os_build = subprocess.check_output(["sw_vers", "-buildVersion"], text=True).strip()
            os_full_name = os_product + " " + os_version_full + " (Build " + os_build + ")"
        except subprocess.CalledProcessError:
            hardware_model = "macOS (model unavailable)"
            chip = "macOS (chip unavailable)"
            memory_str = "macOS (memory unavailable)"
    elif os_name == "Linux":
        try:
            with open("/sys/devices/virtual/dmi/id/product_name", "r") as file_object:
                hardware_model = file_object.read().strip()
        except FileNotFoundError:
            hardware_model = "Linux (model unavailable)"
    elif os_name == "Windows":
        hardware_model = platform.uname().machine

    shell = "Unknown"
    if os_name in ["Linux", "Darwin"]:
        shell = os.environ.get("SHELL", "Unknown")
        shell = os.path.basename(shell)
    elif os_name == "Windows":
        shell = os.environ.get("COMSPEC", "cmd.exe")
        shell = os.path.basename(shell)
        if "powershell" in sys.executable.lower() or "PS1" in os.environ:
            shell = "powershell"

    context = (
        "```plaintext\n"
        "System Context:\n"
        "- Operating System: " + os_full_name + "\n"
        "- Hardware Model: " + hardware_model + "\n"
        "- Chip: " + chip + "\n"
        "- Memory: " + memory_str + "\n"
        "- Date and Time: " + local_time + "\n"
        "- Timezone: " + timezone + "\n"
        "- User: " + user_name + "@" + hostname + "\n"
        "- Current Working Directory: " + current_directory + "\n"
        "- Shell: " + shell + "\n"
        "- Architecture: " + architecture + "\n"
        "- Python Version: " + python_version + "\n"
        "```\n"
    )
    return context

if __name__ == "__main__":
    result = system_context()
    print(result)
