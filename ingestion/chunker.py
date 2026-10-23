import re
from collections import Counter
from pdf_loader import load_data


def clean_text(text):
    """Removes isolated page numbers and running footer artifacts."""

    # Remove Withdrawn
    text = re.sub(
        r'\bWithdrawn\b',
        ' ',
        text,
        flags=re.IGNORECASE
    )

    # Remove standalone numbers (page numbers)
    text = re.sub(
        r'(?m)^\s*\d+\s*$',
        '',
        text
    )

    # Normalize excessive whitespace
    return re.sub(r' +', ' ', text).strip()


def compute_bm25_features(text):
    """Tokenizes clean text and returns term frequency dictionary and doc_length."""
    # 1. Lowercase, remove non-alphanumeric chars
    clean = re.sub(r'[^a-z0-9\s]', ' ', text.lower())
    
    # 2. Split into tokens
    tokens = [t for t in clean.split() if t]
    
    # 3. Calculate term frequencies
    tf_map = dict(Counter(tokens))
    
    return {
        "doc_length": len(tokens),
        "tf_map": tf_map
    }


def create_chunks(chapters):
    chunks = []

    def build_chunk_object(full_text, raw_text, metadata):
        bm25_info = compute_bm25_features(raw_text)
        return {
            "text": full_text,
            "raw_text": raw_text,
            "doc_length": bm25_info["doc_length"],
            "tf_map": bm25_info["tf_map"],
            "metadata": metadata
        }

    for chapter in chapters:
        ch_label = chapter["chapter"]
        ch_title = chapter["title"]
        doc_id = chapter["document_id"]

        # Chapter-level clauses (content before any section header appeared)
        for clause in chapter["clauses"]:
            raw_text = clean_text(clause["text"])
            context_header = f"{ch_label}: {ch_title}\nClause {clause['number']}:\n"
            full_text = context_header + raw_text

            metadata = {
                "document_id": doc_id,
                "chapter": ch_label,
                "chapter_title": ch_title,
                "section": None,
                "clause": clause["number"],
                "page_start": clause["page_start"],
                "page_end": clause["page_end"]
            }
            chunks.append(build_chunk_object(full_text, raw_text, metadata))

        # Sections (if any), unchanged from before
        for section in chapter["sections"]:
            sec_title = section["section"]

            if section["clauses"]:
                for clause in section["clauses"]:
                    raw_text = clean_text(clause["text"])
                    context_header = f"{ch_label}: {ch_title}\nSection: {sec_title}\nClause {clause['number']}:\n"
                    full_text = context_header + raw_text

                    metadata = {
                        "document_id": doc_id,
                        "chapter": ch_label,
                        "chapter_title": ch_title,
                        "section": sec_title,
                        "clause": clause["number"],
                        "page_start": clause["page_start"],
                        "page_end": clause["page_end"]
                    }
                    chunks.append(build_chunk_object(full_text, raw_text, metadata))
            else:
                raw_text = clean_text(section["text"])
                context_header = f"{ch_label}: {ch_title}\nSection: {sec_title}\n"
                full_text = context_header + raw_text

                metadata = {
                    "document_id": doc_id,
                    "chapter": ch_label,
                    "chapter_title": ch_title,
                    "section": sec_title,
                    "clause": None,
                    "page_start": section["page_start"],
                    "page_end": section["page_end"]
                }
                chunks.append(build_chunk_object(full_text, raw_text, metadata))

    return chunks