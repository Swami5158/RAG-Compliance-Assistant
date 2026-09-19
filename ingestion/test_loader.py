# import time
from pathlib import Path
# from pdf_loader import extract_structured_pdf  # Your Docling-backed function

# # 1. Resolve relative target path
# relative_path = "../documents/MD_DigitalPaymentSecurity_2021.pdf"
# pdf_path = Path(relative_path).resolve()

# # 2. Path Verification
# print(f"[+] Target File Path: {pdf_path}")
# if not pdf_path.exists():
#     raise FileNotFoundError(f"[-] Target file missing at: {pdf_path}")

# # 3. Execute Docling Conversion (Measure Processing Latency)
# print("[+] Initializing Docling layout models and parsing PDF...")
# start_time = time.time()

# # Option B Function Call
# extracted_pages = extract_structured_pdf(str(pdf_path))

# elapsed_time = time.time() - start_time
# print(f"[+] Parsing Complete in {elapsed_time:.2f} seconds!")
# print(f"[+] Total Pages Parsed: {len(extracted_pages)}")

# # 4. Preview and Inspect Extraction Quality
# if extracted_pages:
#     print("\n" + "="*50)
#     print(" SAMPLE OUTPUT (PAGE 1) ")
#     print("="*50)
#     print(extracted_pages[2]["markdown_content"])
#     print("\n[...] [Output Truncated]")

from pdf_loader import inspect_docling_structure

pdf_path = Path("../documents/MD_DigitalPaymentSecurity_2021.pdf").resolve()
inspect_docling_structure(str(pdf_path), target_page=3)