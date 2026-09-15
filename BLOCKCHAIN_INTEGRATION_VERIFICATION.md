# Document Blockchain Integration Verification Guide

## Quick Start

### Option 1: Run Automated Test Script
```bash
cd backend
npx ts-node test-blockchain-integration.ts
```

This will:
- ✓ Check database schema
- ✓ Verify all service functions exist
- ✓ Check tamper log table
- ✓ Display document anchoring stats
- ✓ Show tamper log entries

---

## Manual Verification Steps

### Step 1: Check Database Schema
```sql
-- Connect to your database and run:

-- Check document_records table
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'document_records'
AND column_name LIKE '%blockchain%'
ORDER BY column_name;

-- Expected output:
-- blockchain_hash | text
-- blockchain_status | text
-- blockchain_tx_id | text
```

### Step 2: Check Tamper Logs Table
```sql
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'tamper_logs'
ORDER BY column_name;

-- Should include: record_id, user_id, field_name, change_type, status
```

### Step 3: View Document Statistics
```sql
-- Check how many documents are anchored to blockchain
SELECT 
  COUNT(*) as total_documents,
  COUNT(CASE WHEN blockchain_hash IS NOT NULL THEN 1 END) as anchored_documents,
  COUNT(CASE WHEN blockchain_status = 'TAMPERED' THEN 1 END) as tampered_documents
FROM document_records;
```

### Step 4: View Tamper Log Entries
```sql
-- See all document-related tamper logs
SELECT 
  record_id,
  change_type,
  status,
  created_at,
  old_value,
  new_value
FROM tamper_logs
WHERE record_id IN (SELECT id FROM document_records)
ORDER BY created_at DESC
LIMIT 20;

-- Filter by change type:
SELECT * FROM tamper_logs 
WHERE record_id IN (SELECT id FROM document_records)
AND change_type = 'BLOCKCHAIN_MISMATCH'
ORDER BY created_at DESC;
```

---

## API Testing

### Get All Documents
```bash
curl http://localhost:3000/api/documents
```

Response includes: `blockchain_hash`, `blockchain_status`, `blockchain_tx_id`

### Get Single Document
```bash
curl http://localhost:3000/api/documents/{document-id}
```

### Anchor a Document to Blockchain
```bash
curl -X POST http://localhost:3000/api/documents/{document-id}/anchor
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "id": "DOC001",
    "blockchain_hash": "abc123def456...",
    "blockchain_tx_id": "txid_...",
    "blockchain_status": "RECORDED",
    "verification_status": "RECORDED"
  }
}
```

### Verify Document Integrity
```bash
curl -X GET http://localhost:3000/api/documents/{document-id}/verify
```

**If document is anchored:**
```json
{
  "success": true,
  "data": {
    "id": "DOC001",
    "storedHash": "abc123...",
    "currentHash": "abc123...",
    "status": "VERIFIED",
    "isTampered": false
  }
}
```

**If document is tampered:**
```json
{
  "success": true,
  "data": {
    "id": "DOC001",
    "storedHash": "abc123...",
    "currentHash": "xyz789...",
    "status": "TAMPERED",
    "isTampered": true
  }
}
```

### Run Blockchain Integrity Monitor
```bash
curl -X POST http://localhost:3000/api/actions/verify-blockchain
```

This triggers `documentService.monitorIntegrity()` which:
- Checks all documents with blockchain hashes
- Detects any that have been modified
- Logs tampering to `tamper_logs`

---

## Code Trace: Integration Points

### 1. Document Anchoring Flow
```
POST /api/documents/{id}/anchor
  → documentController.anchor()
  → documentService.anchor(id)
    ├─ Computes documentHash(document)
    ├─ Calls fabricGateway.store() to blockchain
    └─ Updates database:
        - blockchain_hash = computed hash
        - blockchain_tx_id = transaction ID
        - blockchain_status = 'RECORDED'
```

### 2. Document Verification Flow
```
GET /api/documents/{id}/verify
  → documentController.verify()
  → documentService.verify(id)
    ├─ If blockchain_hash exists:
    │   ├─ Compute currentHash
    │   ├─ Compare with blockchain_hash
    │   └─ If mismatch:
    │       ├─ Update document: blockchain_status = 'TAMPERED'
    │       └─ Call tamperLogService.logDocumentMismatch()
    │           → Creates tamper_logs entry
    └─ Return verification result
```

### 3. Continuous Monitoring Flow
```
POST /api/actions/verify-blockchain
  → actionsController.verifyBlockchain()
  → documentService.monitorIntegrity()
    ├─ Get all documents with blockchain_hash
    ├─ For each document:
    │   ├─ Compute current hash
    │   ├─ Compare with blockchain_hash
    │   └─ If mismatch:
    │       ├─ Update document: blockchain_status = 'TAMPERED'
    │       └─ Log to tamper_logs
    └─ Return list of tampered documents
```

---

## Expected Tamper Log Entries

### Document Tamper Detection
```
change_type: 'BLOCKCHAIN_MISMATCH'
status: 'DETECTED'
field_name: (specific field that changed)
old_value: (original hash)
new_value: (current hash)
created_at: (when tampering was detected)
```

---

## Verification Checklist

- [ ] Database schema includes `blockchain_hash`, `blockchain_tx_id`, `blockchain_status`
- [ ] `tamper_logs` table exists with appropriate columns
- [ ] `documentService.anchor()` method updates blockchain fields
- [ ] `documentService.verify()` detects hash mismatches
- [ ] `documentService.monitorIntegrity()` continuously monitors
- [ ] `tamperLogService.logDocumentMismatch()` is called on mismatch
- [ ] Tamper logs are created with proper change types
- [ ] API endpoints return blockchain status information
- [ ] Fabric gateway integration is working (if enabled)

---

## Troubleshooting

### No tamper logs found?
- Ensure `logDocumentMismatch()` is being called in `document.service.ts`
- Check if documents have been anchored yet
- Verify blockchain hashes have been set

### Blockchain status always null?
- Documents may not be anchored yet
- Run anchor endpoint to set blockchain fields
- Check Fabric gateway configuration

### Verification always returns null?
- Documents need to have `blockchain_hash` set
- Anchor documents first using the anchor endpoint
