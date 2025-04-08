#!/usr/bin/env python3
# -*- coding: utf-8 -*-
#
# File: search_google.py
# Author: Wadih Khairallah
# Description: 
# Created: 2025-04-08 15:26:26
# Modified: 2025-04-08 15:39:32

import os
import re
import json
import requests
import tempfile
import fitz  # PyMuPDF
import unicodedata
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
import asyncio

console = Console()
print = console.print

def search_google(query: str, num_results: int = 5) -> Dict[str, str]:
    """
    Perform a Google search using Custom Search API and extract content from the result URLs.
    PDF and HTML (via Selenium) are processed in parallel using asyncio and per-instance threading.
    """

    def clean_text(text: str) -> str:
        text = ''.join(c for c in text if c.isprintable())
        text = ''.join(c for c in text if not (0xE000 <= ord(c) <= 0xF8FF))
        text = unicodedata.normalize('NFKC', text)
        lines = text.splitlines()
        clean_lines = []
        for line in lines:
            stripped = line.strip()
            if not stripped:
                continue
            ratio = sum(1 for c in stripped if c.isalpha()) / max(len(stripped), 1)
            if ratio > 0.3:
                clean_lines.append(stripped)
        return ' '.join(clean_lines)

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

    def extract_text_with_selenium_new_driver(url: str) -> str:
        try:
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

            driver = webdriver.Chrome(service=Service(ChromeDriverManager().install()), options=chrome_options)
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
        finally:
            try:
                driver.quit()
            except:
                pass

    api_key = os.getenv("GOOGLE_API_KEY")
    cse_id = os.getenv("GOOGLE_API_CX")

    if not api_key or not cse_id:
        return {"status": "error", "error": "GOOGLE_API_KEY and GOOGLE_API_CX must be set."}

    console.print(f"[cyan]Searching Google for:[/cyan] {query}")

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
        pdf_urls = [url for url in urls if url.lower().endswith(".pdf") or "application/pdf" in url]
        html_urls = [url for url in urls if url not in pdf_urls]

        async def run_all_tasks():
            tasks = []

            for url in pdf_urls:
                print(f"  → [green]PDF queued:[/green] {url}")
                tasks.append(asyncio.to_thread(extract_text_from_pdf, url))

            for url in html_urls:
                print(f"  → [blue]HTML queued:[/blue] {url}")
                tasks.append(asyncio.to_thread(extract_text_with_selenium_new_driver, url))

            results = await asyncio.gather(*tasks, return_exceptions=True)
            return results

        texts = asyncio.run(run_all_tasks())

        return {
            "status": "success",
            "text": " ".join([t if isinstance(t, str) else f"[Error] {t}" for t in texts]),
            "urls": urls,
            "error": None
        }

    except Exception as e:
        return {"status": "error", "error": str(e)}

# Run if executed directly
if __name__ == "__main__":
    import time
    search_query = input("Enter Google search query: ").strip()
    start = time.time()
    result = search_google(search_query)
    end = time.time()
    print(json.dumps(result, indent=2))
    print(f"\n[bold green]Time taken:[/bold green] {end - start:.2f} seconds")

