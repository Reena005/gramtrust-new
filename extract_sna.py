import pandas as pd
from bs4 import BeautifulSoup
from urllib.parse import urljoin

HTML_FILE = "sna_sparsh.html"
OUTPUT_FILE = "documents.csv"

print("Reading SNA-SPARSH webpage...")

with open(HTML_FILE, "r", encoding="utf-8") as f:
    html = f.read()

soup = BeautifulSoup(html, "html.parser")

# Extract all PDF links
pdf_links = []

for a in soup.find_all("a", href=True):
    href = a["href"]

    if ".pdf" in href.lower():
        pdf_links.append({
            "document_url": urljoin(
                "https://mnregaweb4.nic.in/",
                href
            ),
            "document_name": a.get_text(" ", strip=True)
        })

print("PDF links found:", len(pdf_links))

# Extract tables
tables = pd.read_html(HTML_FILE)

print("Tables found:", len(tables))

# The sanction-order table is table 1
df = tables[1]

# Add our Module 3 fields
df["document_id"] = [
    f"DOC{i:03d}" for i in range(1, len(df) + 1)
]

df["document_type"] = "SANCTION_ORDER"

# Match PDF links with table rows
df["document_url"] = ""

for i in range(min(len(df), len(pdf_links))):
    df.loc[i, "document_url"] = pdf_links[i]["document_url"]

df["file_path"] = ""
df["sha256_hash"] = ""
df["verification_status"] = "PENDING"
df["is_tampered"] = False

# Rename columns
df = df.rename(columns={
    "S.No": "serial_no",
    "State Name": "state",
    "Sanction Order Date": "sanction_date",
    "Sanction Order No.": "document_name",
    "Total Amount (Rs. in Lakh)": "amount_lakh"
})

# Arrange columns
df = df[
    [
        "document_id",
        "serial_no",
        "state",
        "sanction_date",
        "document_name",
        "document_type",
        "document_url",
        "file_path",
        "sha256_hash",
        "amount_lakh",
        "verification_status",
        "is_tampered"
    ]
]

df.to_csv(
    OUTPUT_FILE,
    index=False,
    encoding="utf-8-sig"
)

print()
print("SUCCESS!")
print("Created:", OUTPUT_FILE)
print("Records:", len(df))
print("PDF links:", df["document_url"].ne("").sum())