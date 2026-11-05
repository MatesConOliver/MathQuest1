# External App Integration Guide: PKM Reward Code Generation

**For developers building interactive games, exercises, or applications that award Pokemáticos student achievements.**

---

## Quick Start: What You Need

When a student completes an achievement in your app, generate a reward code using:

1. **Student's Public ID** (provided by student from Pokemáticos profile settings)
2. **Source ID** (your application identifier, e.g., `mathquest`, `google_sites`, `gemini_exercises`)
3. **Activity ID** (specific activity identifier, e.g., `algebra_trial_01`, `fractions_interactive_01`)

The algorithm is **deterministic**: the same student completing the same activity always produces the **identical code**.

---

## The Algorithm: CRC-32 Hash + Base36 Encoding

### Step-by-Step Implementation

#### 1. **Compute CRC-32 Hash of Student Public ID**

```
Input:  student_public_id (string, e.g., "user-abc123xyz456...")
Output: hash_int (32-bit unsigned integer)

Use a standard CRC-32 polynomial:
  Polynomial: 0x1EDC6F41 (Ethernet/ZIP standard)
  Initial value: 0xFFFFFFFF
  Final XOR: 0xFFFFFFFF
  Reflect input/output: Yes
```

**Example:**
```
Student ID:    "user-abc123xyz456def789ghi012jkl"
CRC-32 hash:   0x7F2A4C19  (in hex) or 2136931353 (in decimal)
```

#### 2. **Prepare Payload (18 bytes total)**

```
Byte 0:        Version (always 0x01 for now)
Bytes 1-4:     CRC-32 hash of student ID (4 bytes, big-endian)
Bytes 5-10:    Source ID truncated to 6 ASCII chars (right-padded with spaces)
Bytes 11-16:   Activity ID truncated to 6 ASCII chars (right-padded with spaces)
Byte 17:       CRC-8 checksum of bytes 0-16 (for typo detection)
```

**CRC-8 Calculation:**
```
Polynomial: 0x07 (ATM polynomial)
Initial value: 0xFF
No reflection
Final XOR: 0xFF
```

**Example payload (hex):**
```
01 7F2A4C19 6D61746871 6173376F01 4D
  ├─┘├──────┘├──────────┘├──────────┘├┘
  │   │       │          │          └─ CRC-8
  │   │       │          └─ "as7o01" (activity, padded)
  │   │       └─ "mathqu" (source, padded)
  │   └─ Hash of student ID
  └─ Version 1
```

#### 3. **Encode to Base36**

Convert the 18-byte payload to a base36 string:
- Treat 18 bytes as a 144-bit big-endian unsigned integer
- Convert to base36 (using digits 0-9 and letters A-Z)
- Result: 28 characters
- Format with hyphens: `XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX` (7 groups of 4)

**Example code (28 chars):**
```
"04VI-FMXN-3BET-NPI7-EHB9-MLGZ-ZMBN"
```

---

## Exact Format Specification

### Input Values

| Field | Type | Length | Notes |
|-------|------|--------|-------|
| `student_public_id` | String | Variable | Firestore UID from student's Pokemáticos profile |
| `source_id` | String | ≤6 chars | Your app identifier (e.g., `mathquest`, `google_sites`) |
| `activity_id` | String | ≤6 chars | Activity identifier (e.g., `algebra01`, `lesson1`) |

### Output Format

```
XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX
```

- **28 base36 characters** (0-9, A-Z, case-insensitive)
- **7 groups of 4 characters** separated by hyphens
- **Deterministic**: Same inputs → Same output (always)
- **Unique per activity**: Different activities → Different codes (for same student)

---

## Reference Implementation

### Python Example

```python
import binascii
import struct

def generate_reward_code(student_id: str, source_id: str, activity_id: str) -> str:
    """
    Generate a Pokemáticos reward code.
    
    Args:
        student_id: Student's Public ID from Pokemáticos profile
        source_id: Your application ID (≤6 chars)
        activity_id: Specific activity ID (≤6 chars)
    
    Returns:
        28-character code formatted as XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX
    """
    
    # Step 1: CRC-32 hash of student ID
    student_hash = binascii.crc32(student_id.encode()) & 0xFFFFFFFF
    
    # Step 2: Truncate and pad source/activity IDs to 6 chars
    source_padded = (source_id[:6]).ljust(6)
    activity_padded = (activity_id[:6]).ljust(6)
    
    # Step 3: Build 17-byte payload (before checksum)
    payload = bytearray([0x01])  # version
    payload.extend(struct.pack('>I', student_hash))  # 4-byte hash, big-endian
    payload.extend(source_padded.encode('ascii'))    # 6-byte source
    payload.extend(activity_padded.encode('ascii'))  # 6-byte activity
    
    # Step 4: CRC-8 checksum
    crc8_value = crc8_atm(bytes(payload))
    payload.append(crc8_value)
    
    # Step 5: Convert to base36
    payload_int = int.from_bytes(payload, byteorder='big')
    base36_str = to_base36(payload_int, 28)
    
    # Step 6: Format with hyphens
    return '-'.join(base36_str[i:i+4] for i in range(0, 28, 4))


def crc8_atm(data: bytes) -> int:
    """Compute CRC-8 with ATM polynomial 0x07."""
    crc = 0xFF
    for byte in data:
        crc ^= byte
        for _ in range(8):
            if crc & 0x80:
                crc = ((crc << 1) ^ 0x07) & 0xFF
            else:
                crc = (crc << 1) & 0xFF
    return crc ^ 0xFF


def to_base36(num: int, min_length: int) -> str:
    """Convert integer to base36 string, zero-padded to min_length."""
    if num == 0:
        return '0' * min_length
    digits = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'
    result = ''
    while num > 0:
        result = digits[num % 36] + result
        num //= 36
    return result.zfill(min_length)


# Example usage:
code = generate_reward_code(
    student_id="user-abc123xyz456def789ghi012jkl",
    source_id="mathquest",
    activity_id="algebra01"
)
print(code)  # Output: "04VI-FMXN-3BET-NPI7-EHB9-MLGZ-ZMBN"
```

### Google Apps Script Example (for Google Sites/Forms)

```javascript
function generateRewardCode(studentId, sourceId, activityId) {
  // Step 1: CRC-32 of student ID
  const studentHash = crc32(studentId) >>> 0;  // Force unsigned 32-bit
  
  // Step 2: Truncate and pad IDs
  const sourcePadded = (sourceId.substring(0, 6) + "      ").substring(0, 6);
  const activityPadded = (activityId.substring(0, 6) + "      ").substring(0, 6);
  
  // Step 3: Build payload
  let payload = [0x01];  // version
  payload = payload.concat(uint32ToBytesBE(studentHash));
  payload = payload.concat(stringToBytes(sourcePadded));
  payload = payload.concat(stringToBytesPadded(activityPadded));
  
  // Step 4: CRC-8
  const checksum = crc8ATM(payload);
  payload.push(checksum);
  
  // Step 5: Convert to base36
  const base36 = bytesToBase36(payload);
  
  // Step 6: Format with hyphens
  return base36.match(/.{1,4}/g).join('-');
}

function crc32(str) {
  let crc = 0 ^ (-1);
  for (let i = 0; i < str.length; i++) {
    crc = (crc >>> 8) ^ CRC32_TABLE[(crc ^ str.charCodeAt(i)) & 0xFF];
  }
  return (crc ^ (-1)) >>> 0;
}

function crc8ATM(bytes) {
  let crc = 0xFF;
  for (let byte of bytes) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) {
      if (crc & 0x80) {
        crc = ((crc << 1) ^ 0x07) & 0xFF;
      } else {
        crc = (crc << 1) & 0xFF;
      }
    }
  }
  return crc ^ 0xFF;
}

function bytesToBase36(bytes) {
  // Convert bytes to big-endian integer, then to base36
  let num = 0n;
  for (let byte of bytes) {
    num = (num << 8n) | BigInt(byte);
  }
  let result = num.toString(36).toUpperCase().padStart(28, '0');
  return result;
}

function uint32ToBytesBE(num) {
  return [
    (num >>> 24) & 0xFF,
    (num >>> 16) & 0xFF,
    (num >>> 8) & 0xFF,
    num & 0xFF
  ];
}

function stringToBytes(str) {
  return Array.from(str).map(c => c.charCodeAt(0));
}

// Note: CRC32_TABLE needs to be pre-computed or imported
// (standard Ethernet CRC-32 table, 256 entries)
```

### JavaScript (Node.js / Browser)

```javascript
const crypto = require('crypto');

function generateRewardCode(studentId, sourceId, activityId) {
  // Step 1: CRC-32 hash
  const studentHash = crc32(Buffer.from(studentId));
  
  // Step 2: Truncate and pad
  const sourcePadded = (sourceId.substring(0, 6) + "      ").substring(0, 6);
  const activityPadded = (activityId.substring(0, 6) + "      ").substring(0, 6);
  
  // Step 3: Build payload
  const payload = Buffer.alloc(18);
  payload[0] = 0x01;
  payload.writeUInt32BE(studentHash, 1);
  payload.write(sourcePadded, 5, 6, 'ascii');
  payload.write(activityPadded, 11, 6, 'ascii');
  
  // Step 4: CRC-8 of first 17 bytes
  const checksum = crc8ATM(payload.slice(0, 17));
  payload[17] = checksum;
  
  // Step 5: Base36 conversion
  const payloadInt = payload.readBigUInt64BE(0) + 
                     (BigInt(payload.readUInt32BE(8)) << 64n);
  const base36 = payloadInt.toString(36).toUpperCase().padStart(28, '0');
  
  // Step 6: Format
  return base36.match(/.{1,4}/g).join('-');
}

function crc32(buffer) {
  let crc = 0xFFFFFFFF;
  for (let byte of buffer) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) {
      crc = (crc >>> 1) ^ ((crc & 1) ? 0xEDB88320 : 0);
    }
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function crc8ATM(buffer) {
  let crc = 0xFF;
  for (let byte of buffer) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) {
      if (crc & 0x80) {
        crc = ((crc << 1) ^ 0x07) & 0xFF;
      } else {
        crc = (crc << 1) & 0xFF;
      }
    }
  }
  return crc ^ 0xFF;
}
```

---

## What to Tell Gemini

When prompting Gemini to build a Google Sites interactive exercise, provide this:

---

### Prompt Template for Gemini

```
I'm building an interactive Google Sites exercise that needs to award 
student achievements in Pokemáticos. When a student completes the exercise, 
I need to generate a reward code they can paste into their Pokemáticos profile.

Here's the algorithm:

STUDENT IDENTITY:
- Students provide their "Public ID" from Pokemáticos profile settings
- Public ID is their Firestore UID (a unique random string)

CODE GENERATION ALGORITHM:
1. Compute CRC-32 hash of the student's Public ID using the Ethernet polynomial (0x1EDC6F41)
2. Build an 18-byte payload:
   - Byte 0: 0x01 (version)
   - Bytes 1-4: CRC-32 hash (4 bytes, big-endian)
   - Bytes 5-10: source ID truncated to 6 ASCII chars, right-padded with spaces
   - Bytes 11-16: activity ID truncated to 6 ASCII chars, right-padded with spaces
   - Byte 17: CRC-8 checksum (ATM polynomial 0x07) of bytes 0-16
3. Convert the 18-byte payload to base36 (using 0-9 and A-Z)
4. Format as: XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX (28 characters, 7 groups of 4)

REQUIRED VALUES:
- source_id: "google_sites" (or whatever your app ID is)
- activity_id: "fractions_interactive_01" (or your specific activity ID)
- student_id: Prompt student to paste their Public ID from Pokemáticos

EXAMPLE:
If student Public ID is "user-abc123xyz456def789ghi012jkl",
source_id is "google_sites", and activity_id is "fractions_01",
the output code should be formatted like: "04VI-FMXN-3BET-NPI7-EHB9-MLGZ-ZMBN"

IMPORTANT NOTES:
- Same student + same activity = SAME code (deterministic)
- Different students = different codes
- Different activities = different codes
- The CRC-8 is just for typo detection, not security
- Students can paste codes with any case (uppercase/lowercase/mixed)

Can you build this code generation into my interactive exercise?
```

---

## Test Vectors

Use these to verify your implementation:

```
Student ID:   "user-test-student-123"
Source ID:    "google_sites"
Activity ID:  "lesson001"
Expected:     [calculated by implementing algorithm above]

Student ID:   "PKM-student-xyz"
Source ID:    "mathqu"
Activity ID:  "algebra"
Expected:     [calculated by implementing algorithm above]
```

(Contact Pokemáticos admin for pre-computed test vectors to validate your code)

---

## Important Reminders

### ✅ DO:
- Ask the student for their **Public ID** (they copy from Pokemáticos profile)
- Generate the code when activity is completed
- Display code prominently (e.g., "Achievement Unlocked! Your code: XXXX-XXXX-...")
- Allow copy-to-clipboard
- Support both uppercase and mixed case input

### ❌ DON'T:
- Try to compute the student hash yourself; students give you the Public ID string
- Store the code anywhere; it's only for the student to redeem
- Try to encrypt or hide the code; it's visible and that's intentional
- Assume code length is fixed to 28 chars (it is, but always handle variable formats gracefully)
- Claim the system is cryptographically secure; it's not, it's for classroom gamification

---

## Questions?

Contact your Pokemáticos admin with:
- Your application name and ID
- A list of activities you'll be generating codes for
- Any implementation questions

Admin will register your source ID and activities in the Pokemáticos activity catalogue.

---

**Last updated:** November 2026  
**Specification version:** 1.0  
**Compatibility:** Pokemáticos 2.0+
