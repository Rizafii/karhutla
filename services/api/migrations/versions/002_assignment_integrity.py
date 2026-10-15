"""Enforce current drone mission FK and resource status constraints."""
from alembic import op

revision="002"
down_revision="001"


def upgrade():
    op.create_foreign_key('fk_drone_current_mission','drones','drone_missions',['mission_id'],['id'],ondelete='SET NULL',deferrable=True,initially='DEFERRED')
    op.create_check_constraint('ck_drone_status','drones',"status in ('available','reserved','en_route','on_site','suppression_simulation','returning','unavailable')")
    op.create_check_constraint('ck_unit_availability','response_units',"availability in ('available','assigned')")
    op.create_check_constraint('ck_unit_response_status','response_units',"response_status in ('standby','assigned','accepted','responding','on_site')")


def downgrade():
    op.drop_constraint('ck_unit_response_status','response_units',type_='check')
    op.drop_constraint('ck_unit_availability','response_units',type_='check')
    op.drop_constraint('ck_drone_status','drones',type_='check')
    op.drop_constraint('fk_drone_current_mission','drones',type_='foreignkey')
