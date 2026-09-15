import pandas as pd
import psycopg2
import os

# =========================
# CONFIGURATION
# =========================

CSV_FILE = "documents.csv"

DB_HOST = "localhost"
DB_PORT = 5432
DB_NAME = "gramtrust"
DB_USER = "postgres"

# Enter your PostgreSQL password here
DB_PASSWORD = "reena"


# =========================
# READ CSV
# =========================

print("Reading documents.csv...")

df = pd.read_csv(CSV_FILE)

print(f"Documents found: {len(df)}")


# =========================
# CONNECT TO POSTGRESQL
# =========================

print("Connecting to PostgreSQL...")

conn = psycopg2.connect(
    host=DB_HOST,
    port=DB_PORT,
    database=DB_NAME,
    user=DB_USER,
    password=DB_PASSWORD
)

cursor = conn.cursor()

print("Database connected!")


# =========================
# INSERT DOCUMENTS
# =========================

inserted = 0
skipped = 0

for _, row in df.iterrows():

    document_id = str(row["document_id"])

    # Check whether document already exists
    cursor.execute(
        """
        SELECT id
        FROM document_records
        WHERE id = %s
        """,
        (document_id,)
    )

    existing = cursor.fetchone()

    if existing:
        print(f"SKIPPED: {document_id} already exists")
        skipped += 1
        continue

    document_name = str(row["document_name"])
    document_type = str(row["document_type"])

    file_path = str(row["file_path"])

    sha256_hash = str(row["sha256_hash"])

    verification_status = str(
        row["verification_status"]
    ).upper()

    is_tampered = bool(row["is_tampered"])

    # Insert into existing table
    cursor.execute(
        """
        INSERT INTO document_records
        (
            id,
            document_name,
            document_type,
            file_path,
            sha256_hash,
            source_dataset,
            verification_status,
            is_tampered,
            uploaded_by
        )
        VALUES
        (
            %s,
            %s,
            %s,
            %s,
            %s,
            %s,
            %s,
            %s,
            NULL
        )
        """,
        (
            document_id,
            document_name,
            document_type,
            file_path,
            sha256_hash,
            "MGNREGA SNA-SPARSH",
            verification_status,
            is_tampered
        )
    )

    inserted += 1

    print(f"INSERTED: {document_id}")


# =========================
# COMMIT
# =========================

conn.commit()

print()
print("===================================")
print("IMPORT COMPLETED")
print("===================================")
print(f"CSV records : {len(df)}")
print(f"Inserted    : {inserted}")
print(f"Skipped     : {skipped}")


# =========================
# CLOSE DATABASE
# =========================

cursor.close()
conn.close()

print("Database connection closed.")