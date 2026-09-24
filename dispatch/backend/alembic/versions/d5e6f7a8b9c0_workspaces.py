"""Workspaces (multi-tenant accounts).

Adds the ``workspaces`` table and a ``workspace_id`` on brands, videos,
generation_jobs and team_members. Everything that already exists is moved
into one "Main workspace" so a running install keeps all of its data and
every existing login still sees it.
"""

import sqlalchemy as sa
from alembic import op

revision = "d5e6f7a8b9c0"
down_revision = "c4d5e6f7a8b9"
branch_labels = None
depends_on = None

TABLES = ("brands", "videos", "generation_jobs", "team_members")


def upgrade() -> None:
    op.create_table(
        "workspaces",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    for table in TABLES:
        op.add_column(table, sa.Column("workspace_id", sa.Integer(), nullable=True))

    conn = op.get_bind()
    has_data = any(
        conn.execute(sa.text(f"SELECT 1 FROM {table} LIMIT 1")).first() is not None
        for table in TABLES
    )
    if has_data:
        ws_id = conn.execute(
            sa.text("INSERT INTO workspaces (name) VALUES ('Main workspace') RETURNING id")
        ).scalar_one()
        for table in TABLES:
            conn.execute(sa.text(f"UPDATE {table} SET workspace_id = :ws"), {"ws": ws_id})
        # Before workspaces nothing checked roles, so every existing login
        # could already do everything — keep that: the earliest admin becomes
        # the owner and everyone else an admin.
        conn.execute(
            sa.text(
                "UPDATE team_members SET role = CASE WHEN id = ("
                "SELECT id FROM team_members ORDER BY (role = 'admin') DESC, id LIMIT 1"
                ") THEN 'owner' ELSE 'admin' END"
            )
        )

    for table in TABLES:
        op.alter_column(table, "workspace_id", nullable=False)
        op.create_index(f"ix_{table}_workspace_id", table, ["workspace_id"])
        op.create_foreign_key(
            f"fk_{table}_workspace_id", table, "workspaces", ["workspace_id"], ["id"],
            ondelete="CASCADE",
        )


def downgrade() -> None:
    for table in TABLES:
        op.drop_constraint(f"fk_{table}_workspace_id", table, type_="foreignkey")
        op.drop_index(f"ix_{table}_workspace_id", table_name=table)
        op.drop_column(table, "workspace_id")
    op.drop_table("workspaces")
