from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List
from sqlalchemy import create_engine, text
from sqlalchemy.exc import SQLAlchemyError

# ここは自分のMySQLに合わせて変更
# user:pass@host:port/db
DB_URL = "mysql+pymysql://root:hibi1400@127.0.0.1:3306/idea_shelf?charset=utf8mb4"
engine = create_engine(DB_URL, pool_pre_ping=True)

app = FastAPI()

from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://127.0.0.1:5500",
        "http://localhost:5500",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class IdeaIn(BaseModel):
    title: str
    description: str
    tags: List[str] = []
    status: str = "下書き"
    author: str = "you"

def tags_to_str(tags: List[str]) -> str:
    return ",".join([t.strip() for t in tags if t.strip()])[:500]

def str_to_tags(s: str) -> List[str]:
    return [t for t in s.split(",") if t]

@app.get("/ideas")
def list_ideas():
    try:
        with engine.connect() as conn:
            rows = conn.execute(text("""
                SELECT id, title, description, tags, status, author, created_at, updated_at
                FROM ideas
                ORDER BY created_at DESC
            """)).mappings().all()
        ideas = []
        for r in rows:
            ideas.append({
                **r,
                "tags": str_to_tags(r["tags"] or "")
            })
        return ideas
    except SQLAlchemyError as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/ideas/{idea_id}")
def get_idea(idea_id: str):
    try:
        with engine.connect() as conn:
            r = conn.execute(text("""
                SELECT id, title, description, tags, status, author, created_at, updated_at
                FROM ideas WHERE id=:id
            """), {"id": idea_id}).mappings().first()
        if not r:
            raise HTTPException(status_code=404, detail="not found")
        return {**r, "tags": str_to_tags(r["tags"] or "")}
    except SQLAlchemyError as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/ideas")
def create_idea(payload: IdeaIn):
    # ブラウザ側でIDを作って送る方式でもいいけど、ここではサーバーで作る
    import time, random
    idea_id = f"idea_{int(time.time()*1000)}_{random.randint(1000,9999)}"

    try:
        with engine.begin() as conn:
            conn.execute(text("""
                INSERT INTO ideas (id, title, description, tags, status, author)
                VALUES (:id, :title, :description, :tags, :status, :author)
            """), {
                "id": idea_id,
                "title": payload.title.strip(),
                "description": payload.description.strip(),
                "tags": tags_to_str(payload.tags),
                "status": payload.status,
                "author": payload.author
            })
        return {"id": idea_id}
    except SQLAlchemyError as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/ideas/{idea_id}")
def delete_idea(idea_id: str):
    try:
        with engine.begin() as conn:
            res = conn.execute(text("DELETE FROM ideas WHERE id=:id"), {"id": idea_id})
        if res.rowcount == 0:
            raise HTTPException(status_code=404, detail="not found")
        return {"ok": True}
    except SQLAlchemyError as e:
        raise HTTPException(status_code=500, detail=str(e))

