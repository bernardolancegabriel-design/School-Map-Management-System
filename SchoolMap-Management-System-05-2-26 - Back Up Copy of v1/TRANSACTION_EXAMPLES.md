# SchoolMap Database — Transaction Examples & ACID Compliance
## Milestone 2: Reliability & ACID Transactions

---

## TRANSACTION 1: User Registration with Audit Trail (ATOMICITY)
**Scenario:** Register a new admin account. If any step fails, ROLLBACK entire transaction.  
**ACID Property:** ATOMICITY — "All or Nothing"

```sql
-- Set the current admin performing this operation
SET @current_admin_id = 1;

-- Start transaction: Registration must succeed completely or not at all
START TRANSACTION;

-- Step 1: Validate email doesn't exist
IF EXISTS (SELECT 1 FROM admin WHERE email = 'newadmin@school.edu') THEN
    ROLLBACK;
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Email already registered.';
END IF;

-- Step 2: Create new admin account
INSERT INTO admin (name, email, password, role, created_at)
VALUES ('Maria Santos', 'newadmin@school.edu', 'hashed_password_bcrypt', 'admin', NOW());

-- Step 3: Log the registration event (trigger handles this automatically)
-- But we can also explicitly log if needed:
INSERT INTO audit_log (user_id, action, description, timestamp)
VALUES (@current_admin_id, 'LOGIN', 'New admin registered: Maria Santos', NOW());

-- If all steps succeed, COMMIT the transaction
COMMIT;

-- Output: Transaction complete. Both admin creation and audit log recorded atomically.
```

**Rollback Scenario:**
```sql
SET @current_admin_id = 1;
START TRANSACTION;

INSERT INTO admin (name, email, password, role, created_at)
VALUES ('John Doe', 'john@school.edu', 'hashed_password', 'admin', NOW());

-- Simulate an error condition (e.g., system detected duplicate role attempt)
IF (SELECT COUNT(*) FROM admin WHERE role = 'super_admin') > 1 THEN
    ROLLBACK;  -- <-- If condition true, ENTIRE transaction rolled back
    SELECT 'ERROR: Transaction rolled back. Database remains unchanged.' AS status;
ELSE
    COMMIT;
    SELECT 'SUCCESS: Admin registered and logged.' AS status;
END IF;
```

---

## TRANSACTION 2: Complex Route Creation with Waypoints (CONSISTENCY)
**Scenario:** Create a route between two pins with multiple waypoints. Ensure all components remain consistent.  
**ACID Property:** CONSISTENCY — Database maintains valid state before/after transaction

```sql
SET @current_admin_id = 1;

START TRANSACTION;

-- Step 1: Validate both pins exist and are on the same map
DECLARE v_from_map INT;
DECLARE v_to_map INT;

SELECT map_id INTO v_from_map FROM pins WHERE pin_id = 5;
SELECT map_id INTO v_to_map FROM pins WHERE pin_id = 12;

IF v_from_map != v_to_map THEN
    ROLLBACK;
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Pins must be on the same map.';
END IF;

-- Step 2: Create the main route
INSERT INTO routes (from_pin_id, to_pin_id, direction)
VALUES (5, 12, 'Exit Room 101, turn left at corridor, enter Room 112');

SET @new_route_id = LAST_INSERT_ID();

-- Step 3: Add waypoints (route is incomplete without them)
INSERT INTO route_points (route_id, point_order, x, y) VALUES (@new_route_id, 1, 100, 150);
INSERT INTO route_points (route_id, point_order, x, y) VALUES (@new_route_id, 2, 150, 150);
INSERT INTO route_points (route_id, point_order, x, y) VALUES (@new_route_id, 3, 150, 200);
INSERT INTO route_points (route_id, point_order, x, y) VALUES (@new_route_id, 4, 200, 200);

-- If any INSERT fails (e.g., duplicate point_order), entire transaction rolls back
-- This ensures route_id exists in routes table (referential integrity maintained)

COMMIT;
-- Output: Route with all 4 waypoints created consistently, or nothing at all.
```

---

## TRANSACTION 3: Visitor Log Entry with Cascade Effects (ISOLATION)
**Scenario:** Two simultaneous visitor checkins. Ensure they don't interfere with each other.  
**ACID Property:** ISOLATION — Concurrent transactions don't see partial updates

```sql
-- CONNECTION 1: Admin A checking in Visitor 1
SET @current_admin_id = 1;
START TRANSACTION;

INSERT INTO visitor_logs (name, purpose, destination, category, time_in, date, plate_no)
VALUES ('Juan Dela Cruz', 'Meeting with Dean', 'Admin Office', 'official', '09:30:00', '2026-05-02', 'ABC-1234');

-- Simulate processing time
SELECT SLEEP(2);  -- Intentional 2-second delay

COMMIT;

-- CONNECTION 2: Admin B checking in Visitor 2 (runs in parallel)
-- Admin B's transaction sees consistent state despite Admin A's transaction
SET @current_admin_id = 2;
START TRANSACTION;

INSERT INTO visitor_logs (name, purpose, destination, category, time_in, date, plate_no)
VALUES ('Maria Garcia', 'Document Request', 'Registrar Office', 'academic', '09:35:00', '2026-05-02', NULL);

COMMIT;

-- Result: Both visitor logs created successfully without interference
-- Each transaction had isolated view of data at transaction start time
SELECT * FROM visitor_logs ORDER BY log_id DESC LIMIT 2;
```

---

## TRANSACTION 4: Update Pin with Referential Integrity Check (ATOMICITY + CONSISTENCY)
**Scenario:** Change a pin's category. Ensure all related references remain valid.  
**ACID Property:** ATOMICITY + CONSISTENCY — Atomic change that maintains referential integrity

```sql
SET @current_admin_id = 1;

START TRANSACTION;

-- Validate new category exists
DECLARE v_category_exists INT;
SELECT COUNT(*) INTO v_category_exists FROM legend_categories WHERE category_id = 2;

IF v_category_exists = 0 THEN
    ROLLBACK;
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Category does not exist.';
END IF;

-- Update pin's category (triggers will log this change)
UPDATE pins
SET category_id = 2, description = 'Updated: Now a laboratory space'
WHERE pin_id = 1;

-- Verify the update succeeded
IF ROW_COUNT() = 0 THEN
    ROLLBACK;
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Pin not found.';
END IF;

COMMIT;
-- Output: Pin updated successfully with audit trail automatically created
```

---

## TRANSACTION 5: Delete Operation with Cascade Validation (ATOMICITY)
**Scenario:** Delete a pin that might have associated routes. Prevent orphaned records.  
**ACID Property:** ATOMICITY — Either fully delete with all dependencies or fail completely

```sql
SET @current_admin_id = 1;

START TRANSACTION;

-- Step 1: Check if pin has any routes (from_pin_id or to_pin_id)
DECLARE v_route_count INT;
SELECT COUNT(*) INTO v_route_count 
FROM routes 
WHERE from_pin_id = 5 OR to_pin_id = 5;

IF v_route_count > 0 THEN
    ROLLBACK;
    SIGNAL SQLSTATE '45000' 
    SET MESSAGE_TEXT = CONCAT('Cannot delete pin. It has ', v_route_count, ' associated routes. Delete routes first.');
END IF;

-- Step 2: If no routes exist, safe to delete the pin
DELETE FROM pins WHERE pin_id = 5;

-- Trigger automatically logs this deletion to audit_log

COMMIT;
-- Output: Pin deleted successfully (or entire transaction rolled back if routes existed)
```

---

## TRANSACTION 6: Multi-Step Admin Account Deprovisioning (CONSISTENCY + DURABILITY)
**Scenario:** Remove an admin account and ensure all their audit logs are preserved.  
**ACID Property:** CONSISTENCY + DURABILITY — Admin removed but audit trail preserved

```sql
SET @current_admin_id = 1;  -- System admin performing this

START TRANSACTION;

DECLARE v_admin_name VARCHAR(100);
DECLARE v_admin_email VARCHAR(100);

-- Step 1: Retrieve admin details (for audit before deletion)
SELECT name, email INTO v_admin_name, v_admin_email
FROM admin WHERE user_id = 3;

IF v_admin_name IS NULL THEN
    ROLLBACK;
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Admin user not found.';
END IF;

-- Step 2: Log the deprovisioning action
INSERT INTO audit_log (user_id, action, description, timestamp)
VALUES (@current_admin_id, 'DELETE', 
        CONCAT('Admin account deprovisioned: ', v_admin_name, ' (', v_admin_email, ')'), NOW());

-- Step 3: Delete the admin account (triggers also log this)
DELETE FROM admin WHERE user_id = 3;

COMMIT;
-- Output: Admin deleted, but audit trail preserved (DURABILITY)
-- If database crashes after COMMIT, deletion persists.
-- If crash before COMMIT, entire transaction rolled back automatically.
```

---

## TESTING ROLLBACK BEHAVIOR

### Test Case: Verify ROLLBACK on Error
```sql
-- This should ROLLBACK because email is duplicate
SET @current_admin_id = 1;

START TRANSACTION;

INSERT INTO admin (name, email, password, role, created_at)
VALUES ('Duplicate Admin', 'admin@schoolmap.edu', 'password', 'admin', NOW());

-- This will fail (email already exists from seed data)
-- ROLLBACK will happen automatically

COMMIT;
```

**Result:** 
- Error message: "Email already exists" or duplicate key error
- No record inserted
- Audit log unchanged (transaction rolled back)

---

## TEST CASE: Concurrent Transaction Isolation

### Simulating Race Condition (Connection A & B)

**Connection A:**
```sql
SET @current_admin_id = 1;
START TRANSACTION;
SELECT COUNT(*) FROM visitor_logs;  -- Sees: 1 record
CALL sp_add_visitor_log('Visitor A', 'Purpose A', 'Dest A', 'official', '10:00:00', CURDATE(), NULL);
COMMIT;
-- Now visitor_logs has 2 records
```

**Connection B (runs in parallel with Connection A):**
```sql
SET @current_admin_id = 2;
START TRANSACTION;
SELECT COUNT(*) FROM visitor_logs;  -- May still see 1 record (before A's commit)
CALL sp_add_visitor_log('Visitor B', 'Purpose B', 'Dest B', 'academic', '10:05:00', CURDATE(), NULL);
COMMIT;
-- Now visitor_logs has 3 records
```

**Expected Result:** 
- Both transactions succeed independently
- Each has isolated view of data
- Final count: 3 visitor logs (including seed data)
- No "dirty reads" or lost updates

---

## DEMONSTRATION SCRIPT FOR PROFESSOR (DEFENSE)

### Demo 1: Live Trigger Verification
```sql
-- Before update
SELECT * FROM audit_log ORDER BY audit_id DESC LIMIT 1;

-- Set current admin
SET @current_admin_id = 1;

-- Update a pin
UPDATE pins SET name = 'Updated Room Name' WHERE pin_id = 1;

-- After update - Show new audit log entry
SELECT * FROM audit_log ORDER BY audit_id DESC LIMIT 1;
-- Shows: UPDATE action with before/after values, timestamp, user_id automatically captured by trigger
```

### Demo 2: ROLLBACK Demonstration
```sql
-- Show initial state
SELECT COUNT(*) AS visitor_count FROM visitor_logs;  -- e.g., 1 record

SET @current_admin_id = 1;
START TRANSACTION;

-- Add visitor
INSERT INTO visitor_logs (name, purpose, destination, category, time_in, date)
VALUES ('Test Visitor', 'Demo', 'Room 101', 'official', '10:00:00', CURDATE());

-- Count shows 2 records inside transaction
SELECT COUNT(*) AS visitor_count FROM visitor_logs;  -- Shows: 2

-- Simulate crash/error: ROLLBACK
ROLLBACK;

-- Count returns to 1 (rolled back)
SELECT COUNT(*) AS visitor_count FROM visitor_logs;  -- Shows: 1
```

### Demo 3: Referential Integrity Protection
```sql
-- Try to delete a map with pins (should fail)
DELETE FROM maps WHERE map_id = 1;
-- Error: "Cannot delete map with existing pins. Delete pins first."

-- Try to add pin with invalid category (should fail via procedure)
CALL sp_add_pin(1, 'Test', 'Description', 999, NULL);
-- Error: "Category not found."
```

---

## CONCURRENCY & DEADLOCK PREVENTION STRATEGY

### Row-Level Locking (DEFAULT in MySQL InnoDB)
```sql
-- Explicit locking to prevent deadlocks
SET TRANSACTION ISOLATION LEVEL READ COMMITTED;

START TRANSACTION;

-- Acquire row lock on specific record
SELECT * FROM pins WHERE pin_id = 1 FOR UPDATE;

-- Perform update while holding lock
UPDATE pins SET name = 'Updated' WHERE pin_id = 1;

COMMIT;  -- Lock released
```

### Lock Timeout Configuration
```sql
-- Set lock wait timeout (in seconds)
SET innodb_lock_wait_timeout = 50;

-- If transaction waits > 50 seconds for lock, it's aborted
-- Prevents indefinite waiting (deadlock protection)
```

### Deadlock Resolution Strategy
```sql
-- If deadlock detected by MySQL:
-- 1. Error: "Deadlock found when trying to get lock; try restarting transaction"
-- 2. Application retries transaction from beginning
-- 3. Retry logic in API: 
--    try {
--        BEGIN TRANSACTION;
--        ... SQL operations ...
--        COMMIT;
--    } catch (DeadlockException) {
--        retry();  // Restart transaction
--    }
```

---

## KEY TAKEAWAYS: ACID PROPERTIES DEMONSTRATED

| Property | Example | Proof |
|---|---|---|
| **Atomicity** | Route creation with waypoints | Either all waypoints inserted or none (no partial route) |
| **Consistency** | Pin update with category validation | Invalid categories rejected; database stays valid |
| **Isolation** | Concurrent visitor checkins | Each transaction independent; no interference |
| **Durability** | Deleted admin record | After COMMIT, deletion persists despite crashes |

---

*Transaction Examples Version 1.0 - Milestone 2 - May 2, 2026*
