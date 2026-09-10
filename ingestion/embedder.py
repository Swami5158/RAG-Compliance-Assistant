from sentence_transformers import SentenceTransformer
from chunker import create_chunks
from pdf_loader import load_data

MODEL_NAME = "BAAI/bge-m3"

def load_embedding_model():
    model = SentenceTransformer(MODEL_NAME)
    return model

def generate_embeddings(chunks,model):
    texts = [chunk["text"] for chunk in chunks]

    embeddings = model.encode(
        texts,
        normalize_embeddings=True
    )

    return embeddings

if __name__ == "__main__":

    #1. Load pdf and create structured data
    chapters = load_data(
         "../documents/rbi_circular_2021_digital_payments.pdf"
    )

    # 2. Create chunks
    chunks = create_chunks(chapters)

    print("Total chunks : ",len(chunks))

    # 3 . load model
    model = load_embedding_model()

    # 4 . generate embeddings
    embeddings = generate_embeddings(chunks,model)

    # 5. Verify
    print("Number of embeddings : ",len(embeddings))
    print("Embedding dimension : " , len(embeddings[0]))

    print("\nFirst chunk : ")
    print(chunks[0]["text"])

    print("\nFirst Embedding :")
    print(embeddings[0])
    

