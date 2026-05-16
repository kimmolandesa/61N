from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routes.features import router as features_router
from routes.tiles import router as tiles_router

app = FastAPI(title="n61 API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(features_router, prefix="/api/features")
app.include_router(tiles_router, prefix="/api/tiles")

@app.get("/health")
async def health():
    return {"status": "ok"}
