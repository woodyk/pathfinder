#!/usr/bin/env python3
# -*- coding: utf-8 -*-
#
# File: create_qr_code.py
# Author: Wadih Khairallah
# Description: 
# Created: 2025-04-04 23:37:31
# Modified: 2025-04-04 23:38:26

import qrcode
import json
from rich.console import Console
from rich.text import Text

console = Console()

def create_qr_code(
    text: str,
    center_color: str = "#00FF00",
    outer_color: str = "#0000FF",
    back_color: str = "#000000"
) -> str:
    """Generate and display a colorful QR code in the terminal with a gradient effect.

    This function creates a QR code from the input text and displays it in the terminal
    using Unicode block characters. The QR code features a gradient color effect that
    transitions from the center color to the outer color.

    Args:
        text (str): The text to encode in the QR code.
        center_color (str, optional): Hex color code for the center of the QR code.
            Defaults to "#00FF00" (green).
        outer_color (str, optional): Hex color code for the outer parts of the QR code.
            Defaults to "#0000FF" (blue).
        back_color (str, optional): Hex color code for the background.
            Defaults to "#000000" (black).

    Returns:
        str: A JSON string containing:
            - success (bool): Whether the operation was successful
            - result (str): Success message if successful
            - error (str): Error message if unsuccessful

    Example:
        >>> result = create_qr_code("Hello World")
        >>> print(result)
        {"success": true, "result": "QR code generated and displayed.", "error": null}

        # Custom colors
        >>> result = create_qr_code(
        ...     "https://example.com",
        ...     center_color="#FF0000",
        ...     outer_color="#00FF00",
        ...     back_color="#FFFFFF"
        ... )
    """
    def hex_to_rgb(hex_color):
        hex_color = hex_color.lstrip("#")
        return tuple(int(hex_color[i:i + 2], 16) for i in (0, 2, 4))

    try:
        text_length = len(text)
        box_size = max(1, min(3, text_length // 50 + 1))
        qr = qrcode.QRCode(
            version=None,
            error_correction=qrcode.constants.ERROR_CORRECT_H,
            box_size=box_size,
            border=4,
        )
        qr.add_data(text)
        qr.make(fit=True)
        qr_matrix = qr.get_matrix()
        qr_size = len(qr_matrix)

        center_rgb = hex_to_rgb(center_color)
        outer_rgb = hex_to_rgb(outer_color)

        def interpolate_color(x, y, center_x, center_y, max_dist):
            dist = ((x - center_x) ** 2 + (y - center_y) ** 2) ** 0.5
            ratio = min(dist / max_dist, 1)
            r = int(center_rgb[0] + ratio * (outer_rgb[0] - center_rgb[0]))
            g = int(center_rgb[1] + ratio * (outer_rgb[1] - center_rgb[1]))
            b = int(center_rgb[2] + ratio * (outer_rgb[2] - center_rgb[2]))
            return f"rgb({r},{g},{b})"

        center_x = center_y = qr_size // 2
        max_dist = ((center_x) ** 2 + (center_y) ** 2) ** 0.5
        term_width = console.size.width
        qr_width = qr_size * 2
        padding = max((term_width - qr_width) // 2, 0)
        step = max(1, box_size // 2)

        for y in range(0, qr_size, step * 2):
            line = Text(" " * padding)
            for x in range(0, qr_size, step):
                upper = qr_matrix[y][x] if y < qr_size else 0
                lower = qr_matrix[y + step][x] if y + step < qr_size else 0

                if upper and lower:
                    color = interpolate_color(x, y, center_x, center_y, max_dist)
                    line.append("█", style=f"{color} on {color}")
                elif upper:
                    color = interpolate_color(x, y, center_x, center_y, max_dist)
                    line.append("▀", style=f"{color} on {back_color}")
                elif lower:
                    color = interpolate_color(x, y + step, center_x, center_y, max_dist)
                    line.append("▄", style=f"{color} on {back_color}")
                else:
                    line.append(" ", style=f"{back_color} on {back_color}")
            console.print(line)

        return json.dumps({
            "success": True,
            "result": f"QR code generated and displayed.",
            "error": None
        })

    except Exception as e:
        console.print(f"[red]QR Generation Failed: {e}[/red]")
        return json.dumps({
            "success": False,
            "result": None,
            "error": str(e)
        })


if __name__ == "__main__":
    user_input = input("Enter text to encode into a QR code: ")
    print(create_qr_code(user_input))
