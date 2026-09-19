import re
from pathlib import Path
from docling.document_converter import DocumentConverter, PdfFormatOption
from docling.datamodel.pipeline_options import PdfPipelineOptions
from docling.datamodel.base_models import InputFormat

CHAPTER_PATTERN = re.compile(r'^(CHAPTER|PART)\s*[-–]?\s*([IVXLCM0-9]*)\s*[-–:]?\s*(.*)$', re.IGNORECASE)
SECTION_PATTERN = re.compile(r'^([A-Z]|\d+)\.\s*(.*)$')


def _get_converter():
    pipeline_options = PdfPipelineOptions()
    pipeline_options.do_ocr = False
    pipeline_options.do_table_structure = True

    return DocumentConverter(
        format_options={
            InputFormat.PDF: PdfFormatOption(pipeline_options=pipeline_options)
        }
    )


def extract_items(pdf_path: str):
    converter = _get_converter()
    result = converter.convert(pdf_path)
    doc = result.document

    items = []
    for item, level in doc.iterate_items():
        label = getattr(item, "label", None)
        text = getattr(item, "text", "").strip()
        prov = getattr(item, "prov", None)
        page_no = prov[0].page_no if prov else None

        items.append({
            "text": text,
            "label": label,
            "level": level,
            "page_no": page_no
        })

    return items


def inspect_docling_structure(pdf_path: str, target_page: int = None, max_items: int = 200):
    items = extract_items(pdf_path)
    count = 0
    for item in items:
        if target_page is not None and item["page_no"] != target_page:
            continue
        print(f"[page={item['page_no']}] [level={item['level']}] [label={item['label']}] {item['text']}")
        count += 1
        if count >= max_items:
            break


def classify_header(text):
    chapter_match = CHAPTER_PATTERN.match(text)
    if chapter_match:
        label = chapter_match.group(2).strip()
        title = chapter_match.group(3).strip()
        return {"type": "chapter", "label": label, "title": title or None}

    section_match = SECTION_PATTERN.match(text)
    if section_match:
        label = section_match.group(1).strip()
        title = section_match.group(2).strip()
        return {"type": "section", "label": label, "title": title or None}

    return {"type": "plain", "text": text}


def load_data(pdf_path: str, document_id: str):
    items = extract_items(pdf_path)

    chapters = []
    current_chapter = None
    current_section = None
    current_clause = None
    pending = None
    clause_counter = 0

    def close_clause():
        nonlocal current_clause
        if current_clause is not None:
            current_clause["text"] = current_clause["text"].strip()

    def close_section():
        nonlocal current_section
        close_clause()
        if current_section is not None:
            current_section["text"] = current_section["text"].strip()

    def close_chapter():
        nonlocal current_chapter
        close_section()
        if current_chapter is not None:
            current_chapter["text"] = current_chapter["text"].strip()

    for item in items:
        label = item["label"]
        text = item["text"]
        page_no = item["page_no"]

        if not text or label in ("picture", "table"):
            continue

        if label == "section_header":
            parsed = classify_header(text)

            if parsed["type"] == "chapter":
                close_chapter()
                current_chapter = {
                    "document_id": document_id,
                    "chapter": text,
                    "title": parsed["title"] or "",
                    "page_start": page_no,
                    "page_end": page_no,
                    "text": "",
                    "sections": [],
                    "clauses": []
                }
                chapters.append(current_chapter)
                current_section = None
                current_clause = None
                clause_counter = 0
                pending = None if parsed["title"] else "chapter_title"
                continue

            if parsed["type"] == "section":
                close_section()
                current_section = {
                    "section": text,
                    "page_start": page_no,
                    "page_end": page_no,
                    "text": "",
                    "clauses": []
                }
                if current_chapter is not None:
                    current_chapter["sections"].append(current_section)
                    current_chapter["page_end"] = page_no
                current_clause = None
                clause_counter = 0
                pending = None if parsed["title"] else "section_title"
                continue

            if pending == "chapter_title" and current_chapter is not None:
                current_chapter["title"] = text
                pending = None
                continue

            if pending == "section_title" and current_section is not None:
                current_section["section"] += f" — {text}"
                pending = None
                continue

            close_section()
            current_section = {
                "section": text,
                "page_start": page_no,
                "page_end": page_no,
                "text": "",
                "clauses": []
            }
            if current_chapter is not None:
                current_chapter["sections"].append(current_section)
                current_chapter["page_end"] = page_no
            current_clause = None
            clause_counter = 0
            continue

        if label == "list_item":
            text = re.sub(r'\s*Withdrawn\s*$', '', text).strip()

            # FIX 1: split embedded sub-markers glued into one item, e.g. "...declines); f) Efficient... g) Adequate..."
            parts = re.split(r'\s(?=[a-z]\)\s)', text)

            for part in parts:
                part = re.sub(r'^[a-z]\)\s*', '', part.strip()).strip()
                if not part:
                    continue
                clause_counter += 1
                current_clause = {
                    "number": str(clause_counter),
                    "page_start": page_no,
                    "page_end": page_no,
                    "text": part
                }
                if current_section is not None:
                    current_section["clauses"].append(current_clause)
                    current_section["page_end"] = page_no
                elif current_chapter is not None:
                    current_chapter["clauses"].append(current_clause)
                if current_chapter is not None:
                    current_chapter["page_end"] = page_no
            continue

        # FIX 2: text/footnote after clauses = section-level closing text, not a clause continuation
        if label in ("text", "footnote"):
            if current_clause is not None:
                if current_section is not None:
                    current_section["text"] += " " + text
                elif current_chapter is not None:
                    current_chapter["text"] += " " + text
                current_clause = None
            elif current_section is not None:
                current_section["text"] += " " + text
                current_section["page_end"] = page_no
            elif current_chapter is not None:
                current_chapter["text"] += " " + text
                current_chapter["page_end"] = page_no
            continue

    close_chapter()
    return chapters


if __name__ == "__main__":
    pdf_path = "../documents/MD_DigitalPaymentSecurity_2021.pdf"
    chapters = load_data(pdf_path, "MD_DIGITAL_PAYMENT_SECURITY_2021")

    for ch in chapters:
        if ch["page_start"] <= 4 <= ch["page_end"]:
            print(f"\nCHAPTER: {ch['chapter']} — {ch['title']}")
            for sec in ch["sections"]:
                if sec["page_start"] <= 4 <= sec["page_end"]:
                    print(f"\n  SECTION: {sec['section']}")
                    print(f"  SECTION TEXT: {sec['text']}")
                    for clause in sec["clauses"]:
                        if clause["page_start"] <= 4 <= clause["page_end"]:
                            print(f"\n    CLAUSE {clause['number']}:")
                            print(f"    {clause['text']}")