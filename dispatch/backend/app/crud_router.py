"""Builds a full CRUD APIRouter for a single Resource in the registry.

Every route is workspace-scoped (app/tenancy.py): lists only return the
caller's rows, single-row routes 404 on another tenant's id, and any
``brand_id`` / ``video_id`` / ``post_id`` / ``channel_id`` in a payload must
point at a row the caller owns.

NOTE: this module deliberately does NOT use ``from __future__ import annotations``
-- FastAPI reads the runtime ``__annotations__`` of the endpoint callables, and we
inject the per-resource Pydantic schemas as real class objects below.
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Brand, TeamMember
from app.registry import Resource
from app.tenancy import (
    MANAGER_ROLES,
    check_refs,
    get_current_user,
    owned,
    scope,
    unique_brand_slug,
)


def build_router(r: Resource) -> APIRouter:
    router = APIRouter(prefix=f"/{r.name}", tags=[r.label])
    Model = r.model
    OutSchema = r.out_schema
    CreateSchema = r.create_schema
    UpdateSchema = r.update_schema
    order_col = getattr(Model, r.order_by, Model.id)

    def can_write(user: TeamMember) -> None:
        if r.read_only:
            raise HTTPException(403, f"{r.label} are managed by the server.")
        if r.manager_only and user.role not in MANAGER_ROLES:
            raise HTTPException(403, "Only a workspace owner or admin can do that.")

    def list_items(
        db: Session = Depends(get_db),
        user: TeamMember = Depends(get_current_user),
        limit: int = Query(200, le=500),
        offset: int = Query(0, ge=0),
    ):
        q = select(Model)
        clause = scope(Model, user.workspace_id)
        if clause is not None:
            q = q.where(clause)
        rows = db.scalars(q.order_by(order_col, Model.id).limit(limit).offset(offset)).all()
        return list(rows)

    list_items.__annotations__["return"] = list[OutSchema]

    def get_item(
        item_id: int,
        db: Session = Depends(get_db),
        user: TeamMember = Depends(get_current_user),
    ):
        return owned(db, Model, item_id, user.workspace_id, r.singular)

    get_item.__annotations__["return"] = OutSchema

    def create_item(
        payload,
        db: Session = Depends(get_db),
        user: TeamMember = Depends(get_current_user),
    ):
        can_write(user)
        data = payload.model_dump(exclude_unset=True)
        check_refs(db, data, user.workspace_id)
        if Model is Brand:
            data["slug"] = unique_brand_slug(db, data.get("slug", ""))
        if hasattr(Model, "workspace_id"):
            data["workspace_id"] = user.workspace_id
        obj = Model(**data)
        db.add(obj)
        try:
            db.commit()
        except IntegrityError as exc:
            db.rollback()
            raise HTTPException(409, _integrity_message(exc)) from exc
        db.refresh(obj)
        return obj

    create_item.__annotations__["payload"] = CreateSchema
    create_item.__annotations__["return"] = OutSchema

    def update_item(
        item_id: int,
        payload,
        db: Session = Depends(get_db),
        user: TeamMember = Depends(get_current_user),
    ):
        can_write(user)
        obj = owned(db, Model, item_id, user.workspace_id, r.singular)
        data = payload.model_dump(exclude_unset=True)
        check_refs(db, data, user.workspace_id)
        if Model is TeamMember and obj.id == user.id and data.get("role", user.role) != user.role:
            raise HTTPException(400, "You can't change your own role.")
        for key, value in data.items():
            setattr(obj, key, value)
        try:
            db.commit()
        except IntegrityError as exc:
            db.rollback()
            raise HTTPException(409, _integrity_message(exc)) from exc
        db.refresh(obj)
        return obj

    update_item.__annotations__["payload"] = UpdateSchema
    update_item.__annotations__["return"] = OutSchema

    def delete_item(
        item_id: int,
        db: Session = Depends(get_db),
        user: TeamMember = Depends(get_current_user),
    ):
        can_write(user)
        obj = owned(db, Model, item_id, user.workspace_id, r.singular)
        if Model is TeamMember and obj.id == user.id:
            raise HTTPException(400, "You can't remove yourself.")
        db.delete(obj)
        db.commit()
        return None

    router.add_api_route("", list_items, methods=["GET"], summary=f"List {r.label.lower()}")
    router.add_api_route("", create_item, methods=["POST"], status_code=201,
                         summary=f"Create {r.singular.lower()}")
    router.add_api_route("/{item_id}", get_item, methods=["GET"],
                         summary=f"Get one {r.singular.lower()}")
    router.add_api_route("/{item_id}", update_item, methods=["PATCH"],
                         summary=f"Update {r.singular.lower()}")
    router.add_api_route("/{item_id}", delete_item, methods=["DELETE"], status_code=204,
                         summary=f"Delete {r.singular.lower()}")
    return router


def _integrity_message(exc: IntegrityError) -> str:
    detail = str(getattr(exc, "orig", exc))
    if "unique" in detail.lower():
        return "That value already exists (unique constraint)."
    if "foreign key" in detail.lower():
        return "Referenced record does not exist (foreign key constraint)."
    return "Database constraint violation."
