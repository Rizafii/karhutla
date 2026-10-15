"""Development helper: render a versioned schema snapshot against an empty, isolated database."""
from pathlib import Path
from sqlalchemy import create_engine, text
from alembic.autogenerate import produce_migrations, render_python_code
from alembic.migration import MigrationContext
from app.db import engine, Base
from app import models

NAME='karhutla_migration_snapshot'
with engine.connect().execution_options(isolation_level='AUTOCOMMIT') as connection:
    if not connection.scalar(text("select 1 from pg_database where datname=:name"),{'name':NAME}):
        connection.execute(text(f'CREATE DATABASE {NAME}'))
snapshot_engine=create_engine(engine.url.set(database=NAME))
with snapshot_engine.connect() as connection:
    if connection.scalar(text("select count(*) from information_schema.tables where table_schema='public'")):
        raise RuntimeError('Snapshot database must be empty')
    context=MigrationContext.configure(connection)
    migration=produce_migrations(context,Base.metadata)
    upgrade=render_python_code(migration.upgrade_ops)
    downgrade=render_python_code(migration.downgrade_ops)
target=Path('/workspace/services/api/migrations/versions/001_foundation.py')
target.write_text('"""Initial operational schema, frozen at revision 001."""\nfrom alembic import op\nimport sqlalchemy as sa\n\nrevision = "001"\ndown_revision = None\nbranch_labels = None\ndepends_on = None\n\ndef upgrade():\n'+upgrade+'\n\ndef downgrade():\n'+downgrade+'\n')
print('Frozen initial Alembic migration written.')
