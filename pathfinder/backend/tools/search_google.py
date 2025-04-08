#!/usr/bin/env python3
# -*- coding: utf-8 -*-
#
# File: search_google.py
# Author: Wadih Khairallah
# Description: Google Search + JS-capable scraping using Selenium or PyMuPDF
# Created: 2025-04-04
# Modified: 2025-04-05 00:02:53

import os
import re
import time
import json
import requests
import tempfile
import fitz  # PyMuPDF
from typing import Dict
from bs4 import BeautifulSoup

from rich.console import Console
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from webdriver_manager.chrome import ChromeDriverManager

console = Console()
print = console.print

def search_google(
        query: str,
        num_results: int = 5,
        sleep_time: float = 1
    ) -> Dict[str, str]:
    """
    Perform a Google search using the Custom Search API and scrape JS-rendered content using Selenium.

    Args:
        query (str): The search query string.
        num_results (int): Number of results to return (default: 5).
        sleep_time (float): Time to wait between fetches in seconds (default: 1).

    Returns:
        Dict[str, Any]: A dictionary containing:
            - status (str): Search status ("success" or "error")
            - text (str): Combined extracted text from all results
            - urls (List[str]): List of result URLs
            - error (str): Error message if status is "error"

    Example:
        >>> result = search_google("Python programming", num_results=3)
        >>> print(result['urls'])  # Prints list of result URLs
        >>> print(result['text'])  # Shows combined extracted text
    """
    api_key = os.getenv("GOOGLE_API_KEY")
    cse_id = os.getenv("GOOGLE_API_CX")

    if not api_key or not cse_id:
        return {"status": "error", "error": "GOOGLE_API_KEY and GOOGLE_API_CX must be set."}

    def clean_text(text):
        return re.sub(r'\s+', ' ', text).strip()

    def extract_text_from_pdf(url: str) -> str:
        try:
            headers = {'User-Agent': 'Mozilla/5.0'}
            response = requests.get(url, headers=headers, timeout=10)
            response.raise_for_status()

            with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf", dir="/tmp") as temp_pdf:
                temp_pdf.write(response.content)
                pdf_path = temp_pdf.name

            text = ""
            with fitz.open(pdf_path) as doc:
                for page in doc:
                    text += page.get_text()

            os.remove(pdf_path)
            return clean_text(text)

        except Exception as e:
            return f"[PDF Error] {url}: {str(e)}"

    def extract_text_with_selenium(url: str, driver) -> str:
        try:
            driver.get(url)
            WebDriverWait(driver, 10).until(
                EC.presence_of_element_located((By.TAG_NAME, "body"))
            )
            html = driver.page_source
            soup = BeautifulSoup(html, 'html.parser')
            for tag in soup(['script', 'style', 'nav', 'footer', 'header']):
                tag.decompose()
            return clean_text(soup.get_text())
        except Exception as e:
            return f"[Selenium Error] {url}: {str(e)}"

    # Set up headless browser
    chrome_options = Options()
    chrome_options.add_argument("--headless=new")
    chrome_options.add_argument("--no-sandbox")
    chrome_options.add_argument("--disable-dev-shm-usage")
    chrome_options.add_argument("--window-size=1280,800")
    chrome_options.add_argument("--disable-extensions")
    chrome_options.add_argument("--blink-settings=imagesEnabled=false")
    chrome_options.add_argument(
        "user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36"
    )

    console.print(f"[cyan]Searching Google for:[/cyan] {query}")
    driver = None

    try:
        response = requests.get(
            "https://www.googleapis.com/customsearch/v1",
            params={
                "key": api_key,
                "cx": cse_id,
                "q": query,
                "num": min(num_results, 10)
            },
            timeout=10
        )
        response.raise_for_status()
        data = response.json()
        items = data.get("items", [])
        if not items:
            return {"status": "error", "error": f"No results for: {query}"}

        urls = [item["link"] for item in items[:num_results]]
        texts = []

        driver = webdriver.Chrome(
            service=Service(ChromeDriverManager().install()),
            options=chrome_options
        )

        for url in urls:
            print(f"  → [blue]{url}[/blue]")
            if url.lower().endswith(".pdf") or "application/pdf" in url:
                text = extract_text_from_pdf(url)
            else:
                text = extract_text_with_selenium(url, driver)

            texts.append(text)
            time.sleep(sleep_time)

        return {
            "status": "success",
            "text": " ".join(texts),
            "urls": urls,
            "error": None
        }

    except Exception as e:
        return {"status": "error", "error": str(e)}

    finally:
        if driver:
            driver.quit()

if __name__ == "__main__":
    search_query = input("Enter Google search query: ").strip()
    result = search_google(search_query)
    print(json.dumps(result, indent=2))

