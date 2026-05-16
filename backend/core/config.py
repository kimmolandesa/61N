from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    DB_HOST: str = "localhost"
    DB_PORT: int = 5433
    DB_NAME: str = "n61"
    DB_USER: str = "admin"
    DB_PASSWORD: str = "uusBackend4!"
    API_KEY: str = "changeme"

    class Config:
        env_file = ".env"

settings = Settings()
