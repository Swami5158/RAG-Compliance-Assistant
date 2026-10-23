import json
import psycopg2
from pgvector.psycopg2 import register_vector
from pdf_loader import load_data
from chunker import create_chunks
from embedder import generate_embeddings

PDF_PATH = "../documents/MD_DigitalPaymentSecurity_2026.pdf"

def insert_chunks(chunks, embeddings):

    conn = psycopg2.connect(
        host="localhost",
        port=5432,
        database="rag_compliance",
        user="rag_user",
        password="rag_password"
    )

    register_vector(conn)
    cursor = conn.cursor()

    for chunk, embedding in zip(chunks, embeddings):

        metadata = chunk['metadata']

        cursor.execute(
            """
            INSERT INTO chunks (
                document_id, chapter, chapter_title, section, clause,
                page_start, page_end, raw_text, full_text, embedding,
                doc_length, tf_map
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (
                metadata["document_id"],
                metadata["chapter"],
                metadata["chapter_title"],
                metadata["section"],
                metadata["clause"],
                metadata["page_start"],
                metadata["page_end"],
                chunk["raw_text"],
                chunk["text"],
                embedding,
                chunk["doc_length"],
                json.dumps(chunk["tf_map"])  # Convert dict to JSON string for JSONB column
            )
        )

    conn.commit()
    cursor.close()
    conn.close()

if __name__ == "__main__":

    chapters = load_data(PDF_PATH, "MD_DIGITAL_PAYMENT_SECURITY_2026")

    chunks = create_chunks(chapters)

    embeddings = generate_embeddings(chunks)

    insert_chunks(chunks, embeddings)

    print(f"Inserted {len(chunks)} chunks into PostgreSQL with BM25 metadata.")