"""Run from the extracted project: python run.py"""
from pathlib import Path
import os
import uvicorn

if __name__ == "__main__":
    root = Path(__file__).resolve().parent
    os.chdir(root)
    if not (root / "frontend/dist/index.html").exists():
        raise SystemExit("UIが未ビルドです。frontendで npm ci && npm run build を実行してください。")
    print("AeroLab: http://127.0.0.1:8000")
    uvicorn.run("aeroflight.api:app", host="127.0.0.1", port=8000)
