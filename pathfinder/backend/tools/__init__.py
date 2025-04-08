#!/usr/bin/env python3
# -*- coding: utf-8 -*-
#
# File: __init__.py
# Author: Wadih Khairallah
# Description: 
# Created: 2025-04-08 13:17:46
# Modified: 2025-04-08 13:23:54

import os
import importlib
import pathlib

# Directory containing this __init__.py
current_dir = pathlib.Path(__file__).parent

# Loop over each .py file (except __init__.py)
for path in current_dir.glob("*.py"):
    module_name = path.stem
    if module_name == "__init__":
        continue

    # Import the module (like tools.search_google)
    module = importlib.import_module(f".{module_name}", package=__name__)

    # Get the function with the same name as the module (search_google.py -> search_google())
    func = getattr(module, module_name, None)

    if callable(func):
        # Inject it into the tools namespace as just search_google
        globals()[module_name] = func

