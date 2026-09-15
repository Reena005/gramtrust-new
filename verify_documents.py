import os
import hashlib
import psycopg2
from dotenv import load_dotenv

# Load GramTrust backend environment variables
load_dotenv("backend/.env")

DATABASE_URL = os.getenv("DATABASE_URL")

# Remove Prisma-only schema parameter
if DATABASE_URL and "?schema=" in DATABASE_URL:
    DATABASE_URL = DATABASE_URL.split("?schema=")[0]


def calculate_sha256(file_path):
    sha256 = hashlib.sha256()

    with open(file_path, "rb") as f:
        while True:
            data = f.read(8192)

            if not data:
                break

            sha256.update(data)

    return sha256.hexdigest()


print("===================================")
print("GRAMTRUST DOCUMENT VERIFICATION")
print("===================================")

print("Connecting to PostgreSQL...")

conn = psycopg2.connect(DATABASE_URL)
cursor = conn.cursor()

print("Database connected!")

cursor.execute("""
    SELECT id, file_path, sha256_hash
    FROM document_records
    ORDER BY created_at
""")

documents = cursor.fetchall()

print("Documents found:", len(documents))

verified = 0
tampered = 0
missing = 0

for document_id, file_path, stored_hash in documents:

    print(f"\n[{document_id}]")

    if not file_path:
        print("  ERROR: File path missing")
        missing += 1
        continue

    # Convert database path to Windows path
    local_path = file_path.replace("/", os.sep)

    print("  File:", local_path)

    if not os.path.exists(local_path):
        print("  ERROR: PDF file not found")
        missing += 1
        continue

    # Calculate current SHA-256
    current_hash = calculate_sha256(local_path)

    print("  Stored SHA-256 :", stored_hash)
    print("  Current SHA-256:", current_hash)

    if current_hash == stored_hash:

        cursor.execute("""
            UPDATE document_records
            SET verification_status = 'VERIFIED',
                is_tampered = FALSE,
                verified_at = CURRENT_TIMESTAMP
            WHERE id = %s
        """, (document_id,))

        print("  STATUS: VERIFIED")
        verified += 1

    else:

        cursor.execute("""
            UPDATE document_records
            SET verification_status = 'TAMPERED',
                is_tampered = TRUE,
                verified_at = CURRENT_TIMESTAMP
            WHERE id = %s
        """, (document_id,))

        print("  STATUS: TAMPERED")
        tampered += 1


conn.commit()

cursor.close()
conn.close()

print("\n===================================")
print("VERIFICATION COMPLETED")
print("===================================")

print("Total documents :", len(documents))
print("Verified        :", verified)
print("Tampered        :", tampered)
print("Missing         :", missing)

print("===================================")