from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    DB_HOST: str = "localhost"
    DB_PORT: int = 5433
    DB_NAME: str = "n61"
    DB_USER: str = "admin"
    DB_PASSWORD: str = "uusBackend4!"
    API_KEY: str = "changeme"
    MML_API_KEY: str = "01ce3b26-af9c-4d0a-a4ec-151eec1d2058"
    OPENCELLID_API_KEY: str = ""
    N2YO_API_KEY: str = ""
    TILE_CACHE_DIR: str = "/data/tile_cache"
    DEM_VRT_PATH: str = "/data/dem/finland.vrt"
    MOCK_MODE: bool = False

    class Config:
        env_file = ".env"

settings = Settings()
