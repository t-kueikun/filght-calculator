"""Local API. CPU integration stays outside FastAPI's event loop."""
from pathlib import Path
from io import BytesIO
import os
from zipfile import ZipFile, ZIP_DEFLATED
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, ConfigDict, Field
from .model import Aircraft, Conditions, Solver
from .simulation import simulate, MODEL_VERSION
from .presets import presets


class SimulationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    aircraft: dict = Field(default_factory=dict)
    conditions: dict = Field(default_factory=dict)
    solver: dict = Field(default_factory=dict)


app = FastAPI(title="AeroLab Flight Simulator", version="0.2.0")


@app.get("/api/health")
def health():
    return {"status": "ok", "app": "aerolab", "version": "0.2.0", "model": MODEL_VERSION}


@app.get("/api/presets")
def get_presets():
    return presets()


@app.post("/api/simulate")
def run_simulation(request: SimulationRequest):
    try:
        return simulate(Aircraft(**request.aircraft), Conditions(**request.conditions), Solver(**request.solver))
    except (ValueError, TypeError, KeyError, AttributeError, OverflowError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@app.get("/api/readme", include_in_schema=False)
def readme():
    return FileResponse(Path(__file__).resolve().parent.parent / "README.md", media_type="text/plain; charset=utf-8")


@app.get("/api/source.zip", include_in_schema=False)
def source_zip():
    root = Path(__file__).resolve().parent.parent
    stream = BytesIO()
    excluded = {"node_modules", ".venv", ".git", "__pycache__", ".pytest_cache", "test-results", "playwright-report", "screenshots"}
    with ZipFile(stream, "w", ZIP_DEFLATED) as archive:
        for base, dirs, files in os.walk(root):
            dirs[:] = [d for d in dirs if d not in excluded and not d.endswith('.egg-info')]
            for name in files:
                path = Path(base) / name
                if path.is_symlink() or name.endswith((".pyc", ".tsbuildinfo", ".zip")) or name.startswith('.env'):
                    continue
                archive.write(path, Path("flight-simulator") / path.relative_to(root))
    stream.seek(0)
    return StreamingResponse(stream, media_type="application/zip", headers={"Content-Disposition": 'attachment; filename="aerolab-v0.2.zip"'})


dist = Path(__file__).resolve().parent.parent / "frontend" / "dist"
if dist.is_dir():
    app.mount("/", StaticFiles(directory=dist, html=True), name="frontend")
