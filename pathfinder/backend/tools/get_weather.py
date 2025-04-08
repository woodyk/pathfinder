#!/usr/bin/env python3
# -*- coding: utf-8 -*-
#
# File: get_weather.py
# Author: Wadih Khairallah
# Description: 
# Created: 2025-04-04 23:39:37
# Modified: 2025-04-06 23:33:04

import requests
import json
from rich.console import Console

console = Console()

def get_weather(location: str) -> str:
    """Fetch and display detailed weather information for a specified location.

    This function retrieves current conditions and short-term forecast from wttr.in API,
    presenting the data in a structured JSON format with rich console output.

    Args:
        location (str): City name, airport code, or coordinates (latitude,longitude).

    Returns:
        str: A JSON string containing:
            - success (bool): Whether the operation was successful
            - result (dict): Weather data if successful, including:
                - location (str): The queried location
                - current (dict): Current weather conditions
                - forecast (dict): Today's and tomorrow's forecast
            - error (str): Error message if unsuccessful

    Example:
        >>> result = get_weather("New York")
        >>> print(result)
        {
          "success": true,
          "result": {
            "location": "New York",
            "current": {
              "temp_C": "22",
              "feels_like_C": "24",
              "description": "Partly cloudy",
              ...
            },
            "forecast": {...}
          },
          "error": null
        }

        # Error case
        >>> result = get_weather("InvalidLocation")
        {
          "success": false,
          "result": null,
          "error": "Request error: 404 Not Found"
        }
    """
    url = f"https://wttr.in/{location}?format=j1"
    console.print(f"[cyan]Fetching weather for:[/cyan] {location}")

    try:
        response = requests.get(url, timeout=10)
        response.raise_for_status()
        data = response.json()

        current = data["current_condition"][0]
        today = data["weather"][0]
        tomorrow = data["weather"][1] if len(data["weather"]) > 1 else {}

        summary = {
            "location": location,
            "current": {
                "temp_C": current["temp_C"],
                "feels_like_C": current["FeelsLikeC"],
                "description": current["weatherDesc"][0]["value"],
                "wind_kmph": current["windspeedKmph"],
                "humidity": current["humidity"],
                "visibility_km": current["visibility"]
            },
            "forecast": {
                "today": {
                    "date": today["date"],
                    "min_temp_C": today["mintempC"],
                    "max_temp_C": today["maxtempC"],
                    "avg_temp_C": today["avgtempC"],
                    "sunrise": today["astronomy"][0]["sunrise"],
                    "sunset": today["astronomy"][0]["sunset"]
                },
                "tomorrow": {
                    "date": tomorrow.get("date"),
                    "min_temp_C": tomorrow.get("mintempC"),
                    "max_temp_C": tomorrow.get("maxtempC"),
                    "avg_temp_C": tomorrow.get("avgtempC"),
                    "sunrise": tomorrow.get("astronomy", [{}])[0].get("sunrise"),
                    "sunset": tomorrow.get("astronomy", [{}])[0].get("sunset")
                } if tomorrow else {}
            }
        }

        return json.dumps({
            "success": True,
            "result": summary,
            "error": None
        }, indent=2)

    except requests.RequestException as e:
        return json.dumps({
            "success": False,
            "result": None,
            "error": f"Request error: {str(e)}"
        })
    except Exception as e:
        return json.dumps({
            "success": False,
            "result": None,
            "error": f"Unexpected error: {str(e)}"
        })

if __name__ == "__main__":
    city = input("Enter a location (e.g., 'Paris' or '37.77,-122.41'): ")
    print(get_weather(city))

