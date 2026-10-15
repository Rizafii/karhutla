"""Estimated locations and operator-authorized autonomous virtual missions."""
from alembic import op
import sqlalchemy as sa

revision = "004"
down_revision = "003"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("incidents", sa.Column("location_source", sa.String(40), nullable=False, server_default="operator_estimate"))
    op.add_column("incidents", sa.Column("location_uncertainty_m", sa.Float(), nullable=True))
    op.add_column("detections", sa.Column("frame_width", sa.Integer(), nullable=True))
    op.add_column("drone_missions", sa.Column("automatic", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("drone_missions", sa.Column("scan_elapsed_s", sa.Float(), nullable=False, server_default="0"))
    op.add_column("drone_missions", sa.Column("location_refined_at", sa.DateTime(timezone=True), nullable=True))
    for table, name in [("incidents", "location_source"), ("drone_missions", "automatic"), ("drone_missions", "scan_elapsed_s")]:
        op.alter_column(table, name, server_default=None)


def downgrade():
    for table, names in [("drone_missions", ["location_refined_at", "scan_elapsed_s", "automatic"]),
                         ("detections", ["frame_width"]), ("incidents", ["location_uncertainty_m", "location_source"])]:
        for name in names:
            op.drop_column(table, name)
