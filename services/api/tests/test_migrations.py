from sqlalchemy import MetaData, inspect
from alembic import command
from alembic.config import Config
from app import db


def test_fresh_migrations_upgrade_match_models_and_downgrade(test_engine,monkeypatch):
    assert test_engine.url.database=='karhutla_test'
    existing=MetaData();existing.reflect(bind=test_engine);existing.drop_all(test_engine)
    monkeypatch.setattr(db,'engine',test_engine)
    config=Config('alembic.ini')
    command.upgrade(config,'head')
    assert set(db.Base.metadata.tables).issubset(set(inspect(test_engine).get_table_names()))
    command.check(config)
    command.downgrade(config,'base')
    assert inspect(test_engine).get_table_names()==['alembic_version']
