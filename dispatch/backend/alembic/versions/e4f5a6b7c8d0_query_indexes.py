"""Indexes for the queries that run all the time: the publishing worker's
"what's due?" scan, the render worker's open-jobs scan, analytics date ranges,
latest metric snapshots, the review-count badge, and the video_id links
(Library counts + ON DELETE SET NULL when a video is deleted)."""

import sqlalchemy as sa
from alembic import op

revision = "e4f5a6b7c8d0"
down_revision = "d3e4f5a6b7c9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index(
        "ix_post_targets_due", "post_targets", ["scheduled_for"],
        postgresql_where=sa.text("status IN ('queued', 'posting')"),
    )
    op.create_index(
        "ix_post_targets_published", "post_targets", ["published_at"],
        postgresql_where=sa.text("status = 'posted'"),
    )
    op.create_index("ix_metric_snapshots_target_taken", "metric_snapshots", ["target_id", "taken_at"])
    op.create_index(
        "ix_metric_snapshots_channel_taken", "metric_snapshots", ["channel_id", "taken_at"],
        postgresql_where=sa.text("target_id IS NULL"),
    )
    op.create_index(
        "ix_generation_jobs_open", "generation_jobs", ["status"],
        postgresql_where=sa.text("status IN ('queued', 'running')"),
    )
    op.create_index("ix_drafts_brand_status", "drafts", ["brand_id", "status"])
    op.create_index("ix_posts_video_id", "posts", ["video_id"])
    op.create_index("ix_drafts_video_id", "drafts", ["video_id"])
    op.create_index("ix_generation_jobs_video_id", "generation_jobs", ["video_id"])


def downgrade() -> None:
    for name, table in (
        ("ix_generation_jobs_video_id", "generation_jobs"),
        ("ix_drafts_video_id", "drafts"),
        ("ix_posts_video_id", "posts"),
        ("ix_drafts_brand_status", "drafts"),
        ("ix_generation_jobs_open", "generation_jobs"),
        ("ix_metric_snapshots_channel_taken", "metric_snapshots"),
        ("ix_metric_snapshots_target_taken", "metric_snapshots"),
        ("ix_post_targets_published", "post_targets"),
        ("ix_post_targets_due", "post_targets"),
    ):
        op.drop_index(name, table_name=table)
