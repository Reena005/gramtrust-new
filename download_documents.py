import pandas as pd
import requests
import hashlib
import os
import time

CSV_FILE = "documents.csv"
DOWNLOAD_DIR = "documents"

os.makedirs(DOWNLOAD_DIR, exist_ok=True)

df = pd.read_csv(CSV_FILE)

# Force columns that we modify to object/string
df["file_path"] = df["file_path"].astype("object")
df["sha256_hash"] = df["sha256_hash"].astype("object")

print(f"Total documents: {len(df)}")

session = requests.Session()

headers = {
    "User-Agent": "Mozilla/5.0"
}

for index, row in df.iterrows():

    document_id = str(row["document_id"])
    url = str(row["document_url"])

    output_file = os.path.join(
        DOWNLOAD_DIR,
        f"{document_id}.pdf"
    )

    print(f"\n[{index + 1}/{len(df)}] {document_id}")

    # Already downloaded
    if os.path.exists(output_file):
        print("  Already exists - calculating hash")

        with open(output_file, "rb") as f:
            file_bytes = f.read()

        sha256 = hashlib.sha256(file_bytes).hexdigest()

        df.at[index, "file_path"] = output_file
        df.at[index, "sha256_hash"] = sha256

        print(f"  SHA-256: {sha256}")
        continue

    try:
        print("  Downloading...")

        response = session.get(
            url,
            headers=headers,
            timeout=(15, 60),
            verify=False
        )

        if response.status_code == 200:

            content = response.content

            # Check that it actually looks like a PDF
            if not content.startswith(b"%PDF"):
                print("  ERROR: Server did not return a PDF")
                continue

            with open(output_file, "wb") as f:
                f.write(content)

            sha256 = hashlib.sha256(content).hexdigest()

            df.at[index, "file_path"] = output_file
            df.at[index, "sha256_hash"] = sha256

            print(f"  Downloaded: {output_file}")
            print(f"  Size: {len(content):,} bytes")
            print(f"  SHA-256: {sha256}")

        else:
            print(f"  ERROR: HTTP {response.status_code}")

    except requests.exceptions.RequestException as e:
        print(f"  ERROR: {e}")

    time.sleep(1)

# Save updated CSV
df.to_csv(CSV_FILE, index=False)

print("\n===================================")
print("DOWNLOAD PROCESS FINISHED")
print("===================================")

downloaded = df["file_path"].notna().sum()

print(f"Records: {len(df)}")
print(f"Files recorded: {downloaded}")
print(f"CSV updated: {CSV_FILE}")