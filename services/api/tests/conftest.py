import pytest
import asyncio
from sqlalchemy import create_engine, text, MetaData
from sqlalchemy.orm import sessionmaker
from fastapi.testclient import TestClient
from app.db import Base, engine as original_engine
from app import main, simulator
from app.seed import seed


@pytest.fixture(scope="session")
def test_engine():
    url = original_engine.url.set(database="karhutla_test")
    with original_engine.connect().execution_options(isolation_level="AUTOCOMMIT") as connection:
        if not connection.scalar(text("select 1 from pg_database where datname='karhutla_test'")):
            connection.execute(text("CREATE DATABASE karhutla_test"))
    engine = create_engine(url)
    yield engine
    engine.dispose()


@pytest.fixture
def client(test_engine, monkeypatch, tmp_path):
    assert test_engine.url.database == "karhutla_test"
    existing = MetaData()
    existing.reflect(bind=test_engine)
    existing.drop_all(test_engine)
    Base.metadata.create_all(test_engine)
    session = sessionmaker(test_engine, expire_on_commit=False)
    with session.begin() as db:
        seed(db)
    monkeypatch.setattr(main, "Session", session)
    monkeypatch.setattr(main, "engine", test_engine)
    monkeypatch.setattr(simulator, "Session", session)
    async def controlled_clock():
        await asyncio.Event().wait()
    monkeypatch.setattr(main, "simulator", controlled_clock)
    monkeypatch.setattr(main.settings, "data_dir", tmp_path)
    (tmp_path / "evidence").mkdir()
    with TestClient(main.app) as client:
        client.db_session = session
        yield client
