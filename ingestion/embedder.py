from chunker import create_chunks
from pdf_loader import load_data
import requests

MODEL_NAME = "qwen3-embedding:0.6b"


def generate_embeddings(chunks):
    embeddings = []

    for chunk in chunks:
        response = requests.post(
            "http://localhost:11434/api/embeddings",
            json={
                "model" : MODEL_NAME,
                "prompt" : chunk["text"]
            }
        )

        response.raise_for_status()

        embedding = response.json()["embedding"]
        embeddings.append(embedding)

    return embeddings

if __name__ == "__main__":
    chapters = load_data(
        "../documents/MD_DigitalPaymentSecurity_2021.pdf",
        "MD_DIGITAL_PAYMENT_SECURITY_2021"
    )

    chunks = create_chunks(chapters)
    print("Total chunks:", len(chunks))

    embeddings = generate_embeddings(chunks)

    print("Number of embeddings:", len(embeddings))
    print("Embedding dimension:", len(embeddings[0]))
    print("\nFirst chunk:\n", chunks[0]["text"])
    print("\nDocument ID of first chunk:", chunks[0]["metadata"]["document_id"])