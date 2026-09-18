"""Builds a full CRUD APIRouter for a single Resource in the registry.

NOTE: this module deliberately does NOT use ``from __future__ import annotations``
-- FastAPI reads the runtime ``__annotations__`` of the endpoint callables, and we
inject the per-resource Pydantic schemas as real class objects below.
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.registry import Resource


def build_router(r: Resource) -> APIRouter:
    router = APIRouter(prefix=f"/{r.name}", tags=[r.label])
    Model = r.model
    OutSchema = r.out_schema
    CreateSchema = r.create_schema
    UpdateSchema = r.update_schema
    order_col = getattr(Model, r.order_by, Model.id)

    def get_or_404(db: Session, item_id: int):
        obj = db.get(Model, item_id)
        if obj is None:
            raise HTTPException(404, f"{r.singular} {item_id} not found")
        return obj

    def list_items(
        db: Session = Depends(get_db),
        limit: int = Query(200, le=500),
        offset: int = Query(0, ge=0),
    ):
        rows = db.scalars(
            select(Model).order_by(order_col, Model.id).limit(limit).offset(offset)
        ).all()
        return list(rows)

    list_items.__annotations__["return"] = list[OutSchema]

    def get_item(item_id: int, db: Session = Depends(get_db)):
        return get_or_404(db, item_id)

    get_item.__annotations__["return"] = OutSchema

    def create_item(payload, db: Session = Depends(get_db)):
        obj = Model(**payload.model_dump(exclude_unset=True))
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

    def update_item(item_id: int, payload, db: Session = Depends(get_db)):
        obj = get_or_404(db, item_id)
        for key, value in payload.model_dump(exclude_unset=True).items():
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

    def delete_item(item_id: int, db: Session = Depends(get_db)):
        obj = get_or_404(db, item_id)
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
