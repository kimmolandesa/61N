from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routes.features import router as features_router
from routes.tiles import router as tiles_router
from routes.analysis import router as analysis_router
from routes.logistics import router as logistics_router
from routes.terrain import router as terrain_router
from routes.weather import router as weather_router
from routes.intel import router as intel_router

app = FastAPI(title="n61 API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(features_router, prefix="/api/features")
app.include_router(tiles_router, prefix="/api/tiles")
app.include_router(analysis_router, prefix="/api/analysis")
app.include_router(logistics_router, prefix="/api/logistics")
app.include_router(terrain_router, prefix="/api/terrain")
app.include_router(weather_router, prefix="/api/weather")
app.include_router(intel_router, prefix="/api/intel")

@app.get("/health")
async def health():
    return {"status": "ok"}
