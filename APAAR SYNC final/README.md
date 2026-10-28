# APAAR-Sync

**Tagline:** One Student, One ID, One Version of the Truth  
**Purpose:** A standalone, single-file sandbox portal that links a student's APAAR ID and Academic Bank of Credits (ABC) record to college admissions, credit transfers, AICTE compliance and fraud detection. All data is synthetic.

---

## 📁 Project Folder Locations

- **Primary Working Directory:**  
  `c:\Users\YOKESHKANNA\Downloads\apaar-integrity-platform-main\apaar-integrity-platform-main\apaar-sync\`
- **Final Submission Folder:**  
  `c:\Users\YOKESHKANNA\Downloads\apaar-integrity-platform-main\apaar-integrity-platform-main\APAAR SYNC final\`

Both folders contain the complete, synchronized single-file distribution: `index.html`.

---

## 🚀 Running the App

The entire application is completely self-contained in a single file: `index.html`.  
No React, no Vite, no Tailwind, no database, no backend dependencies.

### Local Server Command
You can serve the application on port **8080** using Python's built-in HTTP server:

```powershell
python -m http.server 8080 --directory "c:\Users\YOKESHKANNA\Downloads\apaar-integrity-platform-main\apaar-integrity-platform-main\apaar-sync"
```

Then open your browser at:  
👉 **[http://localhost:8080](http://localhost:8080)**

---

## 🔑 Demo Credentials

All roles and features are accessible from the unified login screen:

### 1. College Administrator (Apex Institute of Technology)
- **Role Tab:** `College Admin`
- **Email:** `registrar@apex.edu`
- **Password:** `Demo@123`
- *(Or click **"Fill demo"** under the collapsible "Demo credentials" section)*

### 2. AICTE Regulator (Central Directorate)
- **Role Tab:** `AICTE Regulator`
- **Official Email:** `officer@aicte.gov.in`
- **Password:** `Demo@123`
- *(Or click **"Fill demo"** under the collapsible "Demo credentials" section)*

### 3. Student (Aarav Sharma)
- **Role Tab:** `Student`
- **APAAR ID:** `9182-3841-0012`
- **Date of Birth:** `2004-05-14`
- **Step 2 Mock OTP:** `123456`
- *(Or click **"Fill demo"** in both Step 1 & Step 2)*

---

## 🌟 4 SIH Innovation Features

### 1. Offline Certificate QR (Dual Mode Verification)
- **Student Documents Page:**
  - **Live Mode:** 30-second rotating TOTP QR for connected verification terminals.
  - **Offline Certificate QR:** ECDSA P-256 + SHA-256 digitally signed academic credential containing masked APAAR, masked name, verified ABC credits, issuing institution, and certificate ID.
  - Includes token view box, **"Copy token"**, and **"Download JSON certificate"**.
- **Public Verification Tab on Sign-in Screen:**
  - Public **"Verify certificate"** tab on login screen (zero-trust, zero-network).
  - Validates cryptographic signature locally in browser via WebCrypto.
  - Displays instant **Valid** badge with verified breakdown or **Tampered** badge with alteration detection.
  - One-click testing via **"Load Aarav's certificate"** and **"Simulate tampered token"**.

### 2. Fuzzy Matching + Fix Guidance (Bulk Admission CSV)
- **Algorithms:** Levenshtein Distance & Jaro-Winkler Similarity ($\ge 0.85$ threshold) on applicant name & DOB.
- **Duplicate & Error Detection:**
  - Flags intra-batch typos and cross-institution collisions against national student registry.
  - Generates plain-language fix hints:
    - *"Did you mean Rohan Varma? Check candidate identity against national registry."*
    - *"DOB format must be YYYY-MM-DD (e.g. 2004-05-14)."*
    - *"Candidate birth year must fall within 1980–2010 for regular undergraduate admissions."*
- Rendered in a dedicated **Automated Fuzzy Validation & Fix Guidance Report** table in the College Admin Admission portal.

### 3. Tamper-Evident Audit Trail (Cryptographic Hash Chaining)
- Every statutory event (admissions, transfers, credit approvals, quota exceptions) is chained:
  $$\text{hash} = \text{SHA-256}(\text{time} \mid \text{actor} \mid \text{role} \mid \text{institutionId} \mid \text{action} \mid \text{apaar} \mid \text{details} \mid \text{prevHash})$$
- Interactive verification buttons on both **College Admin &rarr; Audit log** and **AICTE Regulator &rarr; Compliance centre**:
  - **"Verify chain"**: Sequentially validates cryptographic hashes across all historical records.
  - **"Tamper entry (demo)"**: Simulates unauthorized database record alteration, visibly breaking the cryptographic chain and pinpointing the exact corrupted block index.

### 4. Seat-Rule Exception Workflow
- **College Request:** College Admins facing filled category quotas can submit an official statutory exception request (Category, Additional Seats, Justification).
- **Regulator Review:** AICTE Officers inspect pending requests in the Compliance Centre and click **"Approve"** or **"Reject"** with mandatory statutory remarks.
- **Real-time Quota & Ledger Update:** Approvals immediately update institutional approved seat matrix, write to the SHA-256 audit log, and raise national compliance alerts.

### 5. Multi-Tab Real-Time Sync & Reset
- **localStorage Persistence:** All changes are automatically persisted to browser local storage.
- **BroadcastChannel Sync:** Changes made in one browser tab (e.g. an admin approval or student transfer) instantly propagate to all other open tabs in real time without refreshing.
- **Reset Demo Data:** Click **"Reset demo data"** on the login screen or drawer menu to restore the clean initial sandbox baseline.
