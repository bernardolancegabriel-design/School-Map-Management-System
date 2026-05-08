# SchoolMap Database — Security & Privilege Management (DCL)
## Milestone 3: Security & Administration (Prepared for Submission)

---

## ⚠️ CRITICAL SECURITY NOTES

- ❌ **NEVER** use `root` or default accounts for application connections
- ✅ **ALWAYS** create dedicated database users with Principle of Least Privilege
- ✅ **ALWAYS** grant only minimum permissions needed for the application

---

## 1. APPLICATION USER CREATION

### Create the SchoolMap Application User (Limited Privileges)

```sql
-- Login as root (or DBA account with global privileges)
-- mysql -u root -p

-- Step 1: Create application user for SchoolMap
CREATE USER 'schoolmap_app'@'localhost' IDENTIFIED BY 'SecureAppPassword123!';

-- Alternative: If connecting from a different server:
-- CREATE USER 'schoolmap_app'@'192.168.1.100' IDENTIFIED BY 'SecureAppPassword123!';

-- Or allow from any host (less secure, not recommended for production):
-- CREATE USER 'schoolmap_app'@'%' IDENTIFIED BY 'SecureAppPassword123!';

-- Verify user created
SELECT user, host FROM mysql.user WHERE user = 'schoolmap_app';
```

---

## 2. PRINCIPLE OF LEAST PRIVILEGE - GRANT STATEMENTS

### Grant Minimal Permissions for Normal Operations

```sql
-- Give privileges only on schoolmap_db database
GRANT SELECT, INSERT, UPDATE, DELETE ON school_map_db.* TO 'schoolmap_app'@'localhost';

-- Grant EXECUTE for stored procedures only
GRANT EXECUTE ON school_map_db.* TO 'schoolmap_app'@'localhost';

-- Grant TRIGGER privilege (so app can use triggers via procedures)
GRANT TRIGGER ON school_map_db.* TO 'schoolmap_app'@'localhost';

-- Refresh privilege tables
FLUSH PRIVILEGES;

-- Verify grants
SHOW GRANTS FOR 'schoolmap_app'@'localhost';
```

**Expected Output:**
```
GRANT SELECT, INSERT, UPDATE, DELETE, EXECUTE, TRIGGER ON `school_map_db`.* TO `schoolmap_app`@`localhost`
```

### What schoolmap_app CAN Do:
- ✅ Execute all 15 stored procedures
- ✅ Select data from any table
- ✅ Insert new records
- ✅ Update existing records
- ✅ Delete records
- ✅ Trigger functions work automatically

### What schoolmap_app CANNOT Do:
- ❌ Create/alter tables
- ❌ Create/modify stored procedures
- ❌ Grant privileges to other users
- ❌ Backup/restore databases
- ❌ Connect as root
- ❌ Access other databases

---

## 3. ROLE-BASED ACCESS CONTROL (RBAC) - Application Level

While MySQL user privilege handles database-level access, **application-level RBAC** controls feature access:

### Admin Role Hierarchy (Stored in admin.role column)

```sql
-- Table: admin
-- Column: role (VARCHAR 20)
-- Allowed values:

-- Privilege Level 3: Full system access
'super_admin'   -- Can: Create/edit/delete everything, manage admins, view audit logs, reset system

-- Privilege Level 2: General administration  
'admin'         -- Can: Create/edit locations, routes, maps, manage visitor logs, view audit logs (READ-ONLY)

-- Privilege Level 1: Read-only monitoring
'viewer'        -- Can: View maps, view audit logs, export reports (NO modifications)
```

### Role Verification in Application Code (PHP Example)

```php
// After authentication via sp_authenticate_admin():
$admin = /* result from stored procedure */;

// Check authorization before each operation
function authorizeAction($requiredRole, $userRole) {
    $roleHierarchy = ['viewer' => 1, 'admin' => 2, 'super_admin' => 3];
    
    if ($roleHierarchy[$userRole] < $roleHierarchy[$requiredRole]) {
        return http_response_code(403);  // Forbidden
        die('{"error": "Insufficient privileges"}');
    }
    return true;
}

// Example usage
if ($_GET['action'] == 'reset_database') {
    authorizeAction('super_admin', $admin['role']);
    // Proceed with reset
}
```

---

## 4. AUDIT TRAIL - TRACKING WHO DID WHAT

### Automatic Audit Logging (via Triggers)

Every action is logged with:
- **user_id** — Which admin performed the action
- **action** — Type of operation (CREATE, UPDATE, DELETE, LOGIN, LOGOUT)
- **description** — Specific details of what changed
- **timestamp** — Exact time of operation (automatically recorded)

```sql
-- Query audit trail for specific admin
SELECT * FROM audit_log WHERE user_id = 1 ORDER BY timestamp DESC;

-- Query all changes to a specific table (e.g., admin table)
SELECT * FROM audit_log WHERE action IN ('CREATE', 'UPDATE', 'DELETE') 
AND description LIKE '%admin%' 
ORDER BY timestamp DESC;

-- Find who deleted a pin
SELECT * FROM audit_log 
WHERE action = 'DELETE' AND description LIKE '%Pin deleted%'
ORDER BY timestamp DESC;

-- Audit report: Changes in last 24 hours
SELECT 
    a.user_id,
    ad.name AS admin_name,
    a.action,
    a.description,
    a.timestamp
FROM audit_log a
JOIN admin ad ON a.user_id = ad.user_id
WHERE a.timestamp >= DATE_SUB(NOW(), INTERVAL 1 DAY)
ORDER BY a.timestamp DESC;
```

---

## 5. SESSION SECURITY - Setting Current User

### Proper User Context Management

```sql
-- BEFORE any operation, set the current admin context:
SET @current_admin_id = 1;  -- Or whatever the logged-in user's ID is

-- Triggers use this variable to know WHO made the change
UPDATE pins SET name = 'New Name' WHERE pin_id = 1;

-- This automatically logs to audit_log with user_id = 1

-- ⚠️ If @current_admin_id is not set:
-- - Triggers will record NULL for user_id (BAD - not auditable)
-- - Better to RAISE ERROR if @current_admin_id is NULL

-- Trigger with safety check:
TRIGGER trg_enforce_current_admin BEFORE INSERT ON audit_log
FOR EACH ROW
BEGIN
    IF @current_admin_id IS NULL THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Must set @current_admin_id before database operations.';
    END IF;
END;
```

### Application Connection Setup (PHP)

```php
<?php
// After successful login via sp_authenticate_admin()
$adminId = $result['user_id'];  // From authentication query

// Set session context immediately
$mysqli->query("SET @current_admin_id = " . intval($adminId));

// All subsequent queries now have audit trail
$mysqli->query("UPDATE pins SET name = 'New Name' WHERE pin_id = 1");
// This is automatically logged with user_id = $adminId
?>
```

---

## 6. PASSWORD SECURITY BEST PRACTICES

### Hashing Passwords (NOT Storing Plaintext!)

```sql
-- ❌ BAD - Plaintext password
INSERT INTO admin (name, email, password, role, created_at)
VALUES ('Admin User', 'admin@school.edu', 'admin123', 'admin', NOW());

-- ✅ GOOD - Hashed with bcrypt (60 characters)
INSERT INTO admin (name, email, password, role, created_at)
VALUES ('Admin User', 'admin@school.edu', '$2y$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcg7b3XeKeUxWdeS86E36P4/GOK', 'admin', NOW());
```

### Password Hashing in PHP

```php
<?php
// During registration
$plainPassword = 'UserPassword123';
$hashedPassword = password_hash($plainPassword, PASSWORD_BCRYPT, ['cost' => 10]);

// Insert into database
$stmt = $mysqli->prepare("INSERT INTO admin (name, email, password, role, created_at) VALUES (?, ?, ?, ?, NOW())");
$stmt->bind_param("ssss", $name, $email, $hashedPassword, $role);
$stmt->execute();

// During authentication
$stmt = $mysqli->prepare("SELECT password FROM admin WHERE email = ?");
$stmt->bind_param("s", $email);
$stmt->execute();
$result = $stmt->get_result()->fetch_assoc();

if (password_verify($inputPassword, $result['password'])) {
    // Password correct - authenticate user
}
?>
```

---

## 7. CONNECTION SECURITY

### MySQL Connection String (Application Configuration)

```php
<?php
// config.php - Store outside web root
$dbConfig = [
    'host'     => 'localhost',      // Or secured private network IP
    'user'     => 'schoolmap_app',  // NOT root
    'password' => 'SecureAppPassword123!',  // Strong password
    'database' => 'school_map_db',
    'port'     => 3306,
    'charset'  => 'utf8mb4'
];

$mysqli = new mysqli(
    $dbConfig['host'],
    $dbConfig['user'],
    $dbConfig['password'],
    $dbConfig['database'],
    $dbConfig['port']
);

// Enable SSL for remote connections (production)
$mysqli->ssl_set(
    '/path/to/client-key.pem',      // Client private key
    '/path/to/client-cert.pem',     // Client certificate
    '/path/to/ca-cert.pem',         // CA certificate
    NULL,
    NULL
);
?>
```

---

## 8. DEFENSE DEMONSTRATION CHECKLIST

### Security Check #1: Verify Application User Has No Root Access

```bash
# Try to connect as root (should fail in production)
mysql -u schoolmap_app -p school_map_db
# Should work only with the app password

# Try a restricted operation (should fail)
mysql> CREATE USER new_admin;
# Error: Access Denied for user 'schoolmap_app'@'localhost'
```

### Security Check #2: Attempt Unauthorized SQL (Should Fail)

```sql
-- As 'schoolmap_app' user, try to:

-- 1. Create a table (NOT ALLOWED)
CREATE TABLE unauthorized_table (id INT);
-- Error: Access Denied

-- 2. Drop the database (NOT ALLOWED)
DROP DATABASE school_map_db;
-- Error: Access Denied

-- 3. Modify user privileges (NOT ALLOWED)
GRANT ALL PRIVILEGES ON *.* TO someuser;
-- Error: Access Denied

-- 4. Access other databases (NOT ALLOWED)
USE mysql;
SELECT * FROM user;
-- Error: Access Denied
```

### Security Check #3: Audit Log Verification

```sql
-- Query shows who did what and when
SELECT 
    audit_id,
    user_id,
    action,
    description,
    timestamp
FROM audit_log
ORDER BY timestamp DESC
LIMIT 10;

-- Sample output:
/*
| audit_id | user_id | action | description | timestamp |
|----------|---------|--------|-------------|-----------|
| 5 | 1 | UPDATE | Pin updated — ID: 1... | 2026-05-02 15:45:30 |
| 4 | 1 | CREATE | New admin created... | 2026-05-02 15:44:15 |
| 3 | 1 | UPDATE | Map updated — ID: 1... | 2026-05-02 15:43:00 |
*/
```

---

## 9. CREATING ADDITIONAL APP USERS (IF NEEDED)

### Example: Create Admin User with Higher Privilege Level

```sql
-- Create a "super user" for database administration tasks
CREATE USER 'schoolmap_dba'@'localhost' IDENTIFIED BY 'DBAdmin_SecurePass456!';

-- Grant broader permissions (but still NOT root-level)
GRANT SELECT, INSERT, UPDATE, DELETE, EXECUTE, TRIGGER, CREATE, ALTER ON school_map_db.* 
TO 'schoolmap_dba'@'localhost';

-- Cannot grant global privileges (database-wide only)
FLUSH PRIVILEGES;

-- This user can:
-- ✅ Create backup procedures
-- ✅ Modify stored procedures if needed
-- ✅ Rebuild indexes
-- But still cannot:
-- ❌ Access other databases
-- ❌ Create new database users
-- ❌ Access MySQL system tables
```

---

## 10. COMPLIANCE SUMMARY

| Security Requirement | Implementation | Verified |
|---|---|---|
| No root account for app | Uses 'schoolmap_app' user | ✅ |
| Least privilege enforcement | Only SELECT, INSERT, UPDATE, DELETE, EXECUTE, TRIGGER | ✅ |
| Role-based access | admin.role column with 3 levels (super_admin, admin, viewer) | ✅ |
| Audit trail | Automatic logging via triggers to audit_log table | ✅ |
| User identification | @current_admin_id session variable tracked in audit | ✅ |
| Password hashing | bcrypt (60 char) stored in admin.password column | ✅ |
| Database isolation | Application user cannot access other databases | ✅ |
| Operation logging | Every CREATE, UPDATE, DELETE automatically logged | ✅ |

---

## COMMANDS FOR PROFESSOR DEMO

### Live Demonstration Script

```sql
-- SETUP: Login as root, then create app user
CREATE USER 'schoolmap_app'@'localhost' IDENTIFIED BY 'Demo123!';
GRANT SELECT, INSERT, UPDATE, DELETE, EXECUTE, TRIGGER ON school_map_db.* TO 'schoolmap_app'@'localhost';
FLUSH PRIVILEGES;

-- TEST 1: Connect as app user (should work)
EXIT;
mysql -u schoolmap_app -p -D school_map_db  -- Password: Demo123!

-- TEST 2: Try unauthorized operation (should fail)
CREATE TABLE unauthorized_test (id INT);
-- Expected: Error 1142: CREATE command denied for user 'schoolmap_app'@'localhost'

-- TEST 3: Use stored procedure (should work)
SET @current_admin_id = 1;
CALL sp_add_pin(1, 'Demo Room', 'This is a demo', 1, NULL);
-- Should return: new_pin_id and message

-- TEST 4: View audit log (should show the creation)
SELECT * FROM audit_log ORDER BY audit_id DESC LIMIT 1;
-- Should show: user_id=1, action='CREATE', description with pin details
```

---

*Security & DCL Implementation Version 1.0 - Milestone 2/3 - May 2, 2026*
