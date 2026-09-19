CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE chunks (
    id SERIAL PRIMARY KEY,
    document_id TEXT NOT NULL,
    chapter TEXT NOT NULL,
    chapter_title TEXT NOT NULL,
    section TEXT,
    clause TEXT,
    page_start INTEGER NOT NULL,
    page_end INTEGER NOT NULL,
    raw_text TEXT NOT NULL,
    full_text TEXT NOT NULL,
    embedding VECTOR(1024) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);
