from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path
from typing import Annotated

from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .data import ArtifactError, DataStore, get_store
from .schemas import (
    CitywideSummary,
    CitywideTrendContext,
    DatasetMeta,
    DowntownComparisonResponse,
    HeatmapResponse,
    KdeResponse,
    NeighborhoodContext,
    NeighborhoodMetricSet,
    ResolveResponse,
    SpatialShiftResponse,
)


ROOT = Path(__file__).resolve().parents[2]
FRONTEND_DIST = ROOT / "frontend/dist"


@asynccontextmanager
async def lifespan(_: FastAPI):
    get_store()
    yield


app = FastAPI(
    title="Seattle Collision Dashboard API",
    version="2.0.0",
    description="Read-only observed collision and neighborhood context.",
    lifespan=lifespan,
)


Store = Annotated[DataStore, Depends(get_store)]
SeverityQuery = Annotated[list[str] | None, Query(description="Repeatable citywide-only severity keys.")]


def safe_year_call(callable_, *args):
    try:
        return callable_(*args)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


@app.get("/healthz", tags=["system"])
def health(store: Store) -> dict[str, str]:
    return {"status": "ok", "artifactVersion": store.manifest["artifactVersion"]}


@app.get("/api/meta", response_model=DatasetMeta, tags=["metadata"])
def meta(store: Store) -> DatasetMeta:
    return store.meta()


@app.get("/api/neighborhoods/geojson", tags=["neighborhoods"])
def neighborhoods_geojson(store: Store) -> dict:
    return store.geojson


@app.get("/api/neighborhoods/summary", response_model=list[NeighborhoodMetricSet], tags=["neighborhoods"])
def neighborhoods_summary(start_year: int, end_year: int, store: Store) -> list[NeighborhoodMetricSet]:
    return safe_year_call(store.neighborhood_summary, start_year, end_year)


@app.get("/api/neighborhoods/resolve", response_model=ResolveResponse, tags=["neighborhoods"])
def resolve_neighborhood(
    lat: Annotated[float, Query(ge=-90, le=90)],
    lng: Annotated[float, Query(ge=-180, le=180)],
    store: Store,
) -> ResolveResponse:
    return store.resolve(lat, lng)


@app.get("/api/neighborhoods/citywide-trend", response_model=CitywideTrendContext, tags=["neighborhoods"])
def citywide_neighborhood_trend(start_year: int, end_year: int, store: Store) -> CitywideTrendContext:
    return safe_year_call(store.citywide_trend, start_year, end_year)


@app.get("/api/neighborhoods/{neighborhood_id}/context", response_model=NeighborhoodContext, tags=["neighborhoods"])
def neighborhood_context(neighborhood_id: str, start_year: int, end_year: int, store: Store) -> NeighborhoodContext:
    try:
        return safe_year_call(store.neighborhood_context, neighborhood_id, start_year, end_year)
    except KeyError as error:
        raise HTTPException(status_code=404, detail=f"Unknown neighborhood: {neighborhood_id}") from error


@app.get("/api/citywide/summary", response_model=CitywideSummary, tags=["citywide"])
def citywide_summary(start_year: int, end_year: int, store: Store, severity: SeverityQuery = None) -> CitywideSummary:
    return safe_year_call(store.citywide_summary, start_year, end_year, severity or [])


@app.get("/api/citywide/heatmap", response_model=HeatmapResponse, tags=["citywide"])
def citywide_heatmap(start_year: int, end_year: int, store: Store, severity: SeverityQuery = None) -> HeatmapResponse:
    return safe_year_call(store.heatmap, start_year, end_year, severity or [])


@app.get("/api/citywide/kde", response_model=KdeResponse, tags=["citywide"])
def citywide_kde(start_year: int, end_year: int, store: Store, severity: SeverityQuery = None) -> KdeResponse:
    return safe_year_call(store.kde, start_year, end_year, severity or [])


@app.get("/api/citywide/spatial-shift", response_model=SpatialShiftResponse, tags=["citywide"])
def citywide_spatial_shift(start_year: int, end_year: int, store: Store, severity: SeverityQuery = None) -> SpatialShiftResponse:
    return safe_year_call(store.spatial_shift, start_year, end_year, severity or [])


@app.get("/api/citywide/downtown-comparison", response_model=DowntownComparisonResponse, tags=["citywide"])
def citywide_downtown(start_year: int, end_year: int, store: Store, severity: SeverityQuery = None) -> DowntownComparisonResponse:
    return safe_year_call(store.downtown_comparison, start_year, end_year, severity or [])


if FRONTEND_DIST.exists():
    assets = FRONTEND_DIST / "assets"
    if assets.exists():
        app.mount("/assets", StaticFiles(directory=assets), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    def spa_fallback(full_path: str, request: Request):
        candidate = FRONTEND_DIST / full_path
        if candidate.is_file() and FRONTEND_DIST in candidate.resolve().parents:
            return FileResponse(candidate)
        if full_path.startswith("api/"):
            raise HTTPException(status_code=404, detail="API route not found")
        return FileResponse(FRONTEND_DIST / "index.html")


def create_app() -> FastAPI:
    return app


__all__ = ["app", "create_app", "ArtifactError"]
