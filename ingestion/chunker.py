from pdf_loader import load_data 
import re

def clean_text(text):
    """Removes isolated page numbers and running footer artifacts."""

    # Remove Withdrawn
    text = re.sub(
        r'\bWithdrawn\b',
        ' ',
        text,
        flags=re.IGNORECASE
    )

    # Remove standalone numbers such as:
    # 4
    # 12
    #  7
    text = re.sub(
        r'(?m)^\s*\d+\s*$',
        '',
        text
    )

    # Normalize excessive whitespace
    return re.sub(r' +', ' ', text).strip()


def create_chunks(chapters):
    chunks = []

    for chapter in chapters:
        ch_label = chapter["chapter"]
        ch_title = chapter["title"]

        # --------------------------------------------------
        # 1. Chapter with Sections
        # --------------------------------------------------
        if chapter["sections"]:
            for section in chapter["sections"]:
                sec_title = section["section"]

                # Section with Clauses
                if section["clauses"]:
                    for clause in section["clauses"]:
                        raw_text = clean_text(clause["text"])
                        
                        # Add contextual prefix for RAG retrieval quality
                        context_header = f"{ch_label}: {ch_title}\nSection: {sec_title}\nClause {clause['number']}:\n"
                        full_text = context_header + raw_text

                        chunks.append({
                            "text": full_text,
                            "raw_text": raw_text,
                            "metadata": {
                                "chapter": ch_label,
                                "chapter_title": ch_title,
                                "section": sec_title,
                                "clause": clause["number"],
                                "page_start": clause["page_start"],
                                "page_end": clause["page_end"]
                            }
                        })

                # Section without Clauses
                else:
                    raw_text = clean_text(section["text"])
                    context_header = f"{ch_label}: {ch_title}\nSection: {sec_title}\n"
                    full_text = context_header + raw_text

                    chunks.append({
                        "text": full_text,
                        "raw_text": raw_text,
                        "metadata": {
                            "chapter": ch_label,
                            "chapter_title": ch_title,
                            "section": sec_title,
                            "clause": None,
                            "page_start": section["page_start"],
                            "page_end": section["page_end"]
                        }
                    })

        # --------------------------------------------------
        # 2. Chapter without Sections
        # --------------------------------------------------
        else:
            for clause in chapter["clauses"]:
                raw_text = clean_text(clause["text"])
                context_header = f"{ch_label}: {ch_title}\nClause {clause['number']}:\n"
                full_text = context_header + raw_text

                chunks.append({
                    "text": full_text,
                    "raw_text": raw_text,
                    "metadata": {
                        "chapter": ch_label,
                        "chapter_title": ch_title,
                        "section": None,
                        "clause": clause["number"],
                        "page_start": clause["page_start"],
                        "page_end": clause["page_end"]
                    }
                })

    return chunks


# if __name__ == "__main__":
#     chapters = load_data("../documents/rbi_circular_2021_digital_payments.pdf")
#     chunks = create_chunks(chapters)

#     # print("Total chunks:", len(chunks))

#     # for i, chunk in enumerate(chunks[2:4], start=2):
#     #     print("\n" + "=" * 60)
#     #     print(f"CHUNK: {i}")
#     #     print("=" * 60)
#     #     print("METADATA:", chunk["metadata"])
#     #     print("\nEMBEDDING TEXT:\n", chunk["text"])