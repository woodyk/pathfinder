#!/usr/bin/env python3
# -*- coding: utf-8 -*-
#
# File: system_health.py
# Author: Wadih Khairallah
# Description: 
# Created: 2025-04-04 23:27:21
# Modified: 2025-04-05 00:46:51

import os
import platform
import socket
import time
import json
import datetime
import shutil
from typing import Dict, List
from pathlib import Path

import psutil
from rich.console import Console
from rich.markdown import Markdown

console = Console()
print = console.print

def system_health(duration: int = 10) -> Dict[str, any]:
    """
    Collect comprehensive system health metrics and generate a diagnostic report.
    
    Monitors CPU, memory, disk, network usage, and system logs to assess overall system health.
    Generates alerts for critical conditions and provides detailed metrics in a structured format.
    
    Args:
        duration (int): Monitoring duration in seconds for network metrics (default: 10).
        
    Returns:
        Dict[str, any]: A dictionary containing:
            - meta: System metadata (hostname, OS, timestamp)
            - metrics: Detailed system metrics (CPU, memory, disk, network)
            - alerts: List of critical alerts if any
            - logs: Recent system errors from logs
            - assessment: Overall health assessment
            
    Raises:
        Exception: If any system monitoring operation fails
        
    Example:
        >>> report = system_health()
        >>> print(report['assessment'])
        'System appears to be healthy.'
        
    Note:
        - Supports Linux, macOS, and Windows systems
        - Uses psutil for cross-platform system monitoring
        - Checks for high CPU/memory/disk usage and system errors
    """
    def collect_recent_errors(os_name: str) -> List[str]:
        errors = []
        now = datetime.datetime.now()
        threshold = now - datetime.timedelta(minutes=60)

        try:
            if os_name == "Darwin":
                log_path = Path("/var/log/system.log")
                if not log_path.exists():
                    return []
                with log_path.open("r", encoding="utf-8", errors="ignore") as f:
                    lines = f.readlines()[-1000:]
                for line in lines:
                    try:
                        timestamp_str = " ".join(line.split()[:3])
                        timestamp = datetime.datetime.strptime(timestamp_str, "%b %d %H:%M:%S")
                        timestamp = timestamp.replace(year=now.year)
                        if timestamp >= threshold and "error" in line.lower():
                            errors.append(line.strip())
                    except Exception:
                        continue
                return errors[:20]

            elif os_name == "Linux":
                # Prefer journalctl if available
                if shutil.which("journalctl"):
                    import subprocess
                    result = subprocess.run(
                        ["journalctl", "--since", "1 hour ago", "-p", "err", "--no-pager"],
                        capture_output=True,
                        text=True
                    )
                    if result.returncode == 0:
                        return [line.strip() for line in result.stdout.splitlines() if line.strip()][:20]
                    else:
                        return [f"journalctl error: {result.stderr.strip()}"]

                # Fallback to log file
                log_path = Path("/var/log/syslog") if Path("/var/log/syslog").exists() else Path("/var/log/messages")
                if not log_path.exists():
                    return []
                with log_path.open("r", encoding="utf-8", errors="ignore") as f:
                    lines = f.readlines()[-1000:]
                for line in lines:
                    if "error" in line.lower():
                        errors.append(line.strip())
                return errors[:20]

            elif os_name == "Windows":
                import win32evtlog
                return read_windows_logs(threshold)

        except Exception as e:
            return [f"Log collection error: {e}"]

        return []


    def read_windows_logs(threshold: datetime.datetime) -> List[str]:
        import win32evtlog
        entries = []
        hand = win32evtlog.OpenEventLog(None, "System")
        flags = win32evtlog.EVENTLOG_BACKWARDS_READ | win32evtlog.EVENTLOG_SEQUENTIAL_READ
        events = win32evtlog.ReadEventLog(hand, flags, 0)
        for event in list(events)[:100]:
            event_time = datetime.datetime.fromtimestamp(event.TimeGenerated.timestamp())
            if event_time >= threshold and event.EventType in (1, 2):
                entries.append(f"{event_time.isoformat()}: {event.SourceName} - {event.StringInserts or event.EventID}")
        win32evtlog.CloseEventLog(hand)
        return entries[:20]


    os_name = platform.system()
    hostname = socket.gethostname()
    timestamp = datetime.datetime.now(datetime.timezone.utc).isoformat()

    print(f"[cyan]Checking system health:[/cyan] {hostname}")

    if os_name not in ("Linux", "Darwin", "Windows"):
        return {
            "status": "error",
            "error": f"{os_name} is not supported by this diagnostic tool."
        }

    report = {
        "meta": {
            "hostname": hostname,
            "os": os_name,
            "timestamp_utc": timestamp,
            "duration_secs": duration
        },
        "metrics": {},
        "alerts": [],
        "logs": []
    }

    try:
        # Uptime
        uptime_sec = time.time() - psutil.boot_time()
        report["metrics"]["uptime"] = str(datetime.timedelta(seconds=int(uptime_sec)))

        # CPU
        cpu_percent = psutil.cpu_percent(interval=1)
        cpu_count = psutil.cpu_count()
        cpu_load_avg = (0.0, 0.0, 0.0)
        if os_name in ("Linux", "Darwin") and hasattr(os, "getloadavg"):
            cpu_load_avg = os.getloadavg()

        report["metrics"]["cpu"] = {
            "percent": cpu_percent,
            "load_avg": cpu_load_avg,
            "cores": cpu_count
        }

        if cpu_percent > 90 or (isinstance(cpu_load_avg[0], (int, float)) and cpu_load_avg[0] > cpu_count):
            report["alerts"].append("High CPU load detected.")

        # Memory
        vm = psutil.virtual_memory()
        sm = psutil.swap_memory()
        report["metrics"]["memory"] = {
            "used_percent": vm.percent,
            "total_mb": vm.total // 1024 ** 2,
            "used_mb": vm.used // 1024 ** 2,
            "swap_percent": sm.percent
        }
        if vm.percent > 90:
            report["alerts"].append("High memory usage.")
        if sm.percent > 50:
            report["alerts"].append("Swap usage is elevated.")

        # Disk
        disk = shutil.disk_usage("/")
        disk_percent = (disk.used / disk.total) * 100
        report["metrics"]["disk"] = {
            "used_percent": round(disk_percent, 2),
            "total_gb": disk.total // 1024 ** 3,
            "used_gb": disk.used // 1024 ** 3
        }
        if disk_percent > 90:
            report["alerts"].append("Disk usage is critically high.")

        # Network I/O
        net_start = psutil.net_io_counters()
        time.sleep(duration)
        net_end = psutil.net_io_counters()
        report["metrics"]["network"] = {
            "sent_kb": round((net_end.bytes_sent - net_start.bytes_sent) / 1024, 2),
            "recv_kb": round((net_end.bytes_recv - net_start.bytes_recv) / 1024, 2)
        }

        # Top processes
        top_procs = sorted(psutil.process_iter(['pid', 'name', 'cpu_percent', 'memory_percent']),
                           key=lambda p: p.info['cpu_percent'] or 0, reverse=True)[:5]
        report["metrics"]["top_processes"] = [
            p.info for p in top_procs if p.info["cpu_percent"] is not None
        ]

        # I/O wait (Linux only)
        if os_name == "Linux":
            cpu_times = psutil.cpu_times_percent()
            iowait = getattr(cpu_times, 'iowait', 0.0)
            report["metrics"]["cpu_iowait_percent"] = iowait
            if iowait > 20:
                report["alerts"].append("High I/O wait detected.")

        # Temperature (if available)
        if hasattr(psutil, "sensors_temperatures"):
            temps = psutil.sensors_temperatures()
            if temps:
                report["metrics"]["temperatures"] = {
                    k: [{"label": t.label, "current": t.current} for t in v]
                    for k, v in temps.items()
                }

        # Logs
        report["logs"] = collect_recent_errors(os_name)
        if report["logs"]:
            report["alerts"].append("Recent system errors found in logs.")

        # Final assessment
        report["assessment"] = (
            "System appears to be healthy."
            if not report["alerts"]
            else "Attention required: " + "; ".join(report["alerts"])
        )

        #console.print(Markdown(f"### System Health Summary\n- {report['assessment']}\n"))
        return report

    except Exception as e:
        return {"status": "error", "error": f"Health check failed: {e}"}



if __name__ == "__main__":
    result = system_health()
    print(json.dumps(result, indent=2))

