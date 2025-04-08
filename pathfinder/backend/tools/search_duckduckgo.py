#!/usr/bin/env python3
# -*- coding: utf-8 -*-
#
# File: search_duckduckgo.py
# Author: Wadih Khairallah
# Description: 
# Created: 2025-04-04 23:57:22
# Modified: 2025-04-05 00:02:24

import os
import re
import json
import time
import urllib.parse as urlparse
from typing import Dict, Any

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

def search_duckduckgo(
        query: str,
        num_results: int = 5,
        sleep_time: float = 1
    ) -> Dict[str, Any]:
    """
    Search DuckDuckGo using Selenium to avoid CAPTCHA and bot detection.

    Args:
        query (str): The search query string.
        num_results (int): Number of result URLs to fetch and extract (default: 5).
        sleep_time (float): Time to wait between fetches in seconds (default: 1).

    Returns:
        Dict[str, Any]: A dictionary containing:
            - status (str): Search status ("success" or "error")
            - text (str): Combined extracted text from all results
            - urls (List[str]): List of result URLs
            - error (str): Error message if status is "error"
            - query (str): Original search query

    Example:
        >>> result = search_duckduckgo("Python programming", num_results=3)
        >>> print(result['urls'])  # Prints list of result URLs
        >>> print(result['text'])  # Shows combined extracted text
    """

    def clean_text(text):
        return re.sub(r'\s+', ' ', text).strip()

    def extract_text_from_url(url: str) -> str:
        try:
            driver.get(url)
            WebDriverWait(driver, 10).until(
                EC.presence_of_element_located((By.TAG_NAME, "body"))
            )
            html = driver.page_source
            soup = BeautifulSoup(html, "html.parser")
            for tag in soup(['script', 'style', 'nav', 'footer', 'header']):
                tag.decompose()
            return clean_text(soup.get_text())
        except Exception as e:
            return f"Failed to extract from {url}: {str(e)}"

    # Chrome options
    chrome_options = Options()
    chrome_options.add_argument("--headless=new")
    chrome_options.add_argument("--no-sandbox")
    chrome_options.add_argument("--disable-dev-shm-usage")
    chrome_options.add_argument("--window-size=1280,800")
    chrome_options.add_argument("--disable-extensions")
    chrome_options.add_argument("--disable-popup-blocking")
    chrome_options.add_argument("--blink-settings=imagesEnabled=false")
    chrome_options.add_argument(
        "user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36"
    )

    console.print(f"[cyan]Searching DuckDuckGo:[/cyan] {query}")
    driver = None

    try:
        driver = webdriver.Chrome(
            service=Service(ChromeDriverManager().install()),
            options=chrome_options
        )

        search_url = f"https://duckduckgo.com/?q={urlparse.quote_plus(query)}&ia=web"
        driver.get(search_url)

        WebDriverWait(driver, 10).until(
            EC.presence_of_all_elements_located((By.CSS_SELECTOR, "a[data-testid='result-title-a']"))
        )

        elements = driver.find_elements(By.CSS_SELECTOR, "a[data-testid='result-title-a']")
        urls = [e.get_attribute("href") for e in elements[:num_results]]

        if not urls:
            return {
                "status": "error",
                "error": f"No results returned for: {query}",
                "urls": []
            }

        extracted_texts = []
        for url in urls:
            console.print(f"  → [blue]{url}[/blue]")
            text = extract_text_from_url(url)
            extracted_texts.append(text)
            time.sleep(sleep_time)

        return {
            "status": "success",
            "text": " ".join(extracted_texts),
            "urls": urls,
            "error": None
        }

    except Exception as e:
        return {
            "status": "error",
            "error": f"Selenium DuckDuckGo search failed: {str(e)}",
            "query": query
        }

    finally:
        if driver:
            driver.quit()

if __name__ == "__main__":
    search_query = input("Enter DuckDuckGo search query: ").strip()
    result = search_duckduckgo(search_query)
    print(json.dumps(result, indent=2))

