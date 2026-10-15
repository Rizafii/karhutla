from pathlib import Path
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql+psycopg://karhutla:karhutla_local_demo@localhost:5432/karhutla"
    service_token: str = "replace-with-a-random-local-token"
    demo_mode: bool = True
    data_dir: Path = Path("data")
    simulation_speed: int = 8


settings = Settings()
settings.data_dir.mkdir(parents=True, exist_ok=True)
