#!/usr/bin/env python3
# -*- coding: utf-8 -*-
#
# File: get_website.py
# Author: Wadih Khairallah
# Description: 
# Created: 2025-04-04 22:53:27
# Modified: 2025-04-05 00:22:36

import json
from typing import Dict

from bs4 import BeautifulSoup
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from webdriver_manager.chrome import ChromeDriverManager
from rich.console import Console

console = Console()
print = console.print

def get_website(url: str) -> Dict[str, str]:
    """Fetch and extract visible text from a JavaScript-rendered webpage.

    This function uses headless Chrome with optimized settings to fetch webpage content,
    then extracts and cleans visible text while removing scripts, styles, and navigation elements.

    Args:
        url (str): The URL of the webpage to fetch.

    Returns:
        Dict[str, str]: A dictionary containing:
            - status (str): "success" or "error"
            - url (str): The fetched URL
            - text (str): Extracted visible text if successful
            - error (str): Error message if unsuccessful

    Example:
        >>> result = get_website("https://example.com")
        >>> print(json.dumps(result, indent=2))
        {
          "status": "success",
          "url": "https://example.com",
          "text": "Example Domain This domain is for use in..."
        }

        # Error case
        >>> result = get_website("invalid-url")
        {
          "status": "error",
          "url": "invalid-url",
          "error": "Invalid URL"
        }
    """
    print(f"[cyan]Fetching:[/cyan] {url}\n")
    try:
        chrome_options = Options()
        chrome_options.add_argument("--headless=new")
        chrome_options.add_argument("--no-sandbox")
        chrome_options.add_argument("--disable-gpu")
        chrome_options.add_argument("--disable-dev-shm-usage")
        chrome_options.add_argument("--disable-extensions")
        chrome_options.add_argument("--disable-plugins")
        chrome_options.add_argument("--disable-popup-blocking")
        chrome_options.add_argument("--blink-settings=imagesEnabled=false")
        chrome_options.add_argument("--window-size=320,480")
        chrome_options.add_argument(
            "user-agent=Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/90.0.4430.91 Mobile Safari/537.36"
        )

        driver = webdriver.Chrome(
            service=Service(ChromeDriverManager().install()),
            options=chrome_options
        )

        driver.get(url)

        # Wait until body is present or timeout at 10 seconds
        WebDriverWait(driver, 10).until(
            EC.presence_of_element_located((By.TAG_NAME, "body"))
        )

        html = driver.page_source
        driver.quit()

        soup = BeautifulSoup(html, 'html.parser')
        for element in soup(['script', 'style', 'nav', 'footer', 'header']):
            element.decompose()

        text = soup.get_text()
        cleaned_text = " ".join(text.split())

        return {
            "status": "success",
            "url": url,
            "text": cleaned_text
        }

    except Exception as e:
        return {
            "status": "error",
            "url": url,
            "error": str(e)
        }

if __name__ == "__main__":
    target_url = input("Enter URL to fetch: ").strip()
    result = get_website(target_url)
    print(json.dumps(result, indent=2))

