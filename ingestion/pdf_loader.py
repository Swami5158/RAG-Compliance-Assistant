import re , pymupdf

CHAPTER_PATTERN = re.compile(
    r"^\s*CHAPTER\s*[\u2013\u2014-]?\s*[IVXLCDM]+\s*$",
    re.IGNORECASE
)

SECTION_NUMBER_PATTERN = re.compile(
    r"^\s*\d+\.\s+"
)

CLAUSE_PATTERN = re.compile(
    r"^\s*(\d+)\.\s+"
)

def clean_text(text):
    # Remove PDF watermark
    text = re.sub(r"\bWithdrawn\b", "", text, flags=re.IGNORECASE)

    # Remove standalone page numbers
    # Only removes numbers that appear as their own token/line.
    text = re.sub(r"(?m)^\s*\d+\s*$", "", text)

    # Remove page numbers accidentally attached to the end of text
    # Example: "as the case may be. 4"
    text = re.sub(r"(?<=[.!?])\s+\d+\s*$", "", text)

    # Remove page numbers appearing between words
    # Example: "build and 5 security aspects"
    text = re.sub(r"(?<=\w)\s+\d+\s+(?=\w)", " ", text)

    # Clean excessive whitespace
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n\s*\n+", "\n", text)

    return text.strip()


def is_bold_line(line):
    spans = line["spans"]
    if not spans:
        return False

    meaningful_spans = [
        span for span in spans if span["text"].strip()
    ]

    return (
        meaningful_spans
        and all(span["flags"] & 16 for span in meaningful_spans)
    )


def get_line_text(line):
    return "".join(
        span["text"] for span in line["spans"]
    ).strip()


def looks_like_section(line_text, line):
    meaningful_spans = [
        span for span in line["spans"] if span["text"].strip()
    ]

    if not meaningful_spans:
        return False

    # Numbered section heading.
    if SECTION_NUMBER_PATTERN.match(line_text):
        has_bold_span = any(
            span["flags"] & 16 for span in meaningful_spans
        )
        return has_bold_span

    # Unnumbered section heading.
    if not is_bold_line(line):
        return False

    if len(line_text) > 120:
        return False

    if line_text.endswith((".", ",", ";", ":")):
        return False

    return True


def load_data(pdf_path):
    doc = pymupdf.open(pdf_path)

    chapters = []

    current_chapter = None
    current_section = None
    current_clause = None

    current_chapter_text = []
    current_section_text = []
    current_clause_text = []

    expecting_chapter_title = False

    for page in doc:
        # Skip first two pages
        if page.number < 2:
            continue

        page_number = page.number + 1
        # "Extract all the text blocks from this page, along with their internal lines and spans."
        blocks = page.get_text("dict")["blocks"]

        for block in blocks:
            if "lines" not in block:
                continue

            for line in block["lines"]:
                line_text = get_line_text(line)

                if not line_text:
                    continue

                # ==================================================
                # 1. CHAPTER DETECTION
                # ==================================================
                if CHAPTER_PATTERN.fullmatch(line_text):
                    # Save previous clause
                    if current_clause is not None:
                        current_clause["text"] = " ".join(current_clause_text).strip()

                    # Save previous section
                    if current_section is not None:
                        current_section["text"] = "\n".join(current_section_text).strip()

                    # Save previous chapter
                    if current_chapter is not None:
                        current_chapter["text"] = "\n".join(current_chapter_text).strip()

                    # Create new chapter
                    current_chapter = {
                        "chapter": line_text,
                        "title": "",
                        "page_start": page_number,
                        "page_end": page_number,
                        "text": "",
                        "sections": [],
                        "clauses": []
                    }

                    chapters.append(current_chapter)

                    current_section = None
                    current_clause = None

                    current_chapter_text = []
                    current_section_text = []
                    current_clause_text = []

                    expecting_chapter_title = True
                    continue

                # ==================================================
                # 2. CHAPTER TITLE
                # ==================================================
                if expecting_chapter_title:
                    if is_bold_line(line):
                        current_chapter["title"] = line_text
                        current_chapter["page_end"] = page_number
                        expecting_chapter_title = False
                    continue

                # ==================================================
                # 3. SECTION DETECTION
                # ==================================================
                if current_chapter is not None and looks_like_section(line_text, line):
                    # Save previous clause
                    if current_clause is not None:
                        current_clause["text"] = " ".join(current_clause_text).strip()

                    # Save previous section
                    if current_section is not None:
                        current_section["text"] = "\n".join(current_section_text).strip()

                    # Create new section
                    current_section = {
                        "section": line_text,
                        "page_start": page_number,
                        "page_end": page_number,
                        "text": "",
                        "clauses": []
                    }

                    current_chapter["sections"].append(current_section)
                    current_chapter["page_end"] = page_number

                    current_clause = None
                    current_section_text = []
                    current_clause_text = []
                    continue

                # ==================================================
                # 4. CLAUSE DETECTION
                # ==================================================
                clause_match = CLAUSE_PATTERN.match(line_text)

                if clause_match:
                    # Save previous clause
                    if current_clause is not None:
                        current_clause["text"] = " ".join(current_clause_text).strip()

                    # Create new clause
                    current_clause = {
                        "number": clause_match.group(1),
                        "page_start": page_number,
                        "page_end": page_number,
                        "text": ""
                    }

                    content = line_text[clause_match.end():].strip()
                    current_clause_text = [content]

                    # Attach clause to parent
                    if current_section is not None:
                        current_section["clauses"].append(current_clause)
                        current_section["page_end"] = page_number
                    elif current_chapter is not None:
                        current_chapter["clauses"].append(current_clause)

                    if current_chapter is not None:
                        current_chapter["page_end"] = page_number

                    continue

                # ==================================================
                # 5. NORMAL CONTENT
                # ==================================================
                if current_clause is not None:
                    current_clause_text.append(line_text)
                    current_clause["page_end"] = page_number

                if current_section is not None:
                    current_section_text.append(line_text)
                    current_section["page_end"] = page_number

                if current_chapter is not None:
                    current_chapter_text.append(line_text)
                    current_chapter["page_end"] = page_number

    # ==============================================================
    # SAVE FINAL BLOCKS AT END OF FILE
    # ==============================================================
    if current_clause is not None:
        current_clause["text"] = " ".join(current_clause_text).strip()

    if current_section is not None:
        current_section["text"] = "\n".join(current_section_text).strip()

    if current_chapter is not None:
        current_chapter["text"] = "\n".join(current_chapter_text).strip()

    doc.close()
    return chapters

# # ==============================================================
# # TEST & VERIFY OUTPUT
# # ==============================================================

# chapters = load_data("../documents/rbi_circular_2021_digital_payments.pdf")

# for chapter in chapters:
#     print("\n" + "=" * 60)
#     print(f"CHAPTER: {chapter['chapter']} - {chapter['title']}")
#     print(f"PAGES  : {chapter['page_start']} -> {chapter['page_end']}")
#     print("=" * 60)

#     if chapter["sections"]:
#         for section in chapter["sections"]:
#             print(f"\n  SECTION: {section['section']}")
#             print(f"  PAGES  : {section['page_start']} -> {section['page_end']}")
            
#             if section["clauses"]:
#                 clause_strs = [
#                     f"C{c['number']} ({c['page_start']}-{c['page_end']})"
#                     if c['page_start'] != c['page_end']
#                     else f"C{c['number']} (p.{c['page_start']})"
#                     for c in section["clauses"]
#                 ]
#                 print("  CLAUSES: " + ", ".join(clause_strs))
#             else:
#                 print("  CLAUSES: None")
#     else:
#         print("\n  [NO SECTIONS]")
#         if chapter["clauses"]:
#             clause_strs = [
#                 f"C{c['number']} ({c['page_start']}-{c['page_end']})"
#                 if c['page_start'] != c['page_end']
#                 else f"C{c['number']} (p.{c['page_start']})"
#                 for c in chapter["clauses"]
#             ]
#             print("  CLAUSES: " + ", ".join(clause_strs))
#         else:
#             print("  CLAUSES: None")    

