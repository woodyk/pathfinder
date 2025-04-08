#!/usr/bin/env python3
# -*- coding: utf-8 -*-
#
# File: search_slashdot.py
# Author: Wadih Khairallah
# Description: 
# Created: 2025-04-04 23:42:45
# Modified: 2025-04-05 01:24:48

import time
import re
import requests
from bs4 import BeautifulSoup
from typing import Dict
from rich.console import Console
from rich.markdown import Markdown
from rich.panel import Panel
from rich.text import Text

console = Console()
print = console.print

def search_slashdot(
    query: str,
    num_results: int = 10,
    sleep_time: float = 1
) -> Dict[str, any]:
    """
    Perform a Slashdot search and return cleaned article summaries.

    Args:
        query (str): Search query.
        num_results (int): Max articles to extract.
        sleep_time (float): Pause between fetches.

    Returns:
        dict: Structured result with status, text, urls, and error (if any).
    """

    def clean_text(text):
        return re.sub(r'\s+', ' ', text).strip()

    def extract_text_from_url(url):
        try:
            headers = {'User-Agent': 'Mozilla/5.0'}
            response = requests.get(url, headers=headers, timeout=10)
            response.raise_for_status()

            soup = BeautifulSoup(response.content, 'html.parser')
            for element in soup(['script', 'style', 'nav', 'footer', 'header']):
                element.decompose()

            articles = soup.find_all('article', class_='fhitem')
            if not articles:
                return []

            summaries = []
            for article in articles[:num_results]:
                title = article.find('span', class_='story-title')
                intro = article.find('div', class_='p')
                parts = []
                if title:
                    parts.append(f"[bold]{clean_text(title.get_text())}[/bold]")
                if intro:
                    parts.append(clean_text(intro.get_text()))
                if parts:
                    summaries.append("\n".join(parts))
            return summaries

        except Exception as e:
            return [f"[red]Error fetching content: {str(e)}[/red]"]

    search_url = f"https://slashdot.org/index2.pl?fhfilter={query.replace(' ', '+')}"
    console.print(f"[cyan]Searching Slashdot for:[/cyan] {query}")

    try:
        summaries = extract_text_from_url(search_url)
        time.sleep(sleep_time)

        if not summaries:
            console.print(f"[yellow]No results found for:[/yellow] {query}")
            return {
                "status": "error",
                "error": f"No results found for query: {query}",
                "urls": [search_url]
            }

        # Display results nicely
        console.print("\n[bold green]Top Articles:[/bold green]")
        for i, summary in enumerate(summaries, 1):
            console.print(Panel(Text(summary), title=f"[white]#{i}[/white]", expand=False))

        return {
            "status": "success",
            "text": "\n\n".join(summaries),
            "urls": [search_url],
            "error": None
        }

    except Exception as e:
        return {
            "status": "error",
            "error": f"Failed to process Slashdot search: {str(e)}",
            "query": query,
            "urls": [search_url]
        }

if __name__ == "__main__":
    q = input("Enter Slashdot search query: ")
    result = search_slashdot(q)
    print(result)
