"""Create a project-local environment, start AeroLab, and open the local browser."""
import os
import json
from pathlib import Path
import subprocess
import sys
import time
import urllib.error
import urllib.request
import venv
import webbrowser


def main():
    if sys.version_info < (3, 10):
        raise SystemExit("Python 3.10 or newer is required: https://www.python.org/downloads/")
    root = Path(__file__).resolve().parent
    os.chdir(root)
    url = "http://127.0.0.1:8000"
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))

    def server_status():
        try:
            with opener.open(url + "/api/health", timeout=1) as response:
                data = json.loads(response.read())
                return data if isinstance(data, dict) and data.get("status") == "ok" else None
        except (urllib.error.URLError, TimeoutError, OSError, ValueError):
            return None

    existing = server_status()
    if existing and (existing.get("app") != "aerolab" or existing.get("version") != "0.2.0"):
        raise SystemExit("An older app is using port 8000. Stop its terminal with Ctrl+C, then start this version again.")
    if existing:
        print("AeroLab is already running:", url)
        webbrowser.open(url)
        return
    environment = root / ".venv"
    python = environment / ("Scripts/python.exe" if os.name == "nt" else "bin/python")
    if not python.exists():
        print("Creating the local Python environment...", flush=True)
        venv.EnvBuilder(with_pip=True).create(environment)
    check = subprocess.run([str(python), "-c", "import numpy, scipy, fastapi, uvicorn, pydantic"],
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    if check.returncode:
        print("Installing dependencies (Internet connection needed on first start)...", flush=True)
        subprocess.run([str(python), "-m", "pip", "install", "-e", "."], check=True)
    process = subprocess.Popen([str(python), "run.py"], cwd=root)
    try:
        for _ in range(60):
            if process.poll() is not None:
                raise SystemExit("AeroLab could not start. Check the error above (port 8000 may be in use).")
            status = server_status()
            if status and status.get("app") == "aerolab" and status.get("version") == "0.2.0":
                print("AeroLab:", url, "— keep this window open; Ctrl+C to stop.", flush=True)
                webbrowser.open(url)
                break
            time.sleep(.3)
        else:
            raise SystemExit("Startup timed out. Check the error above.")
        process.wait()
    except KeyboardInterrupt:
        print("\nStopping AeroLab...")
    finally:
        if process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()


if __name__ == "__main__":
    main()
