-- ============================================================
-- DISABLED ACCOUNTS SETUP SCRIPT
-- ============================================================
-- This script implements the disable-instead-of-delete functionality
-- for admin accounts. When an admin is disabled, they are moved to
-- the disabled_accounts table, and cannot log in anymore.
-- ============================================================

-- Step 1: Add is_disabled column to admin table
ALTER TABLE `admin` ADD COLUMN `is_disabled` TINYINT(1) NOT NULL DEFAULT 0;

-- Step 2: Create triggers to handle account disabling
-- When an admin is disabled, move them to disabled_accounts table
DELIMITER $$
CREATE TRIGGER `trg_admin_disable` AFTER UPDATE ON `admin` FOR EACH ROW
BEGIN
    IF NEW.is_disabled = 1 AND OLD.is_disabled = 0 THEN
        -- Move admin to disabled_accounts table
        INSERT INTO disabled_accounts (user_id, name, email, password, role, created_at, disabled_at, disabled_by, reason)
        VALUES (NEW.user_id, NEW.name, NEW.email, NEW.password, NEW.role, NEW.created_at, NOW(), COALESCE(@current_admin_id, 0), NULL);
    END IF;
END
$$
DELIMITER ;

-- When an admin is re-enabled, remove them from disabled_accounts table
DELIMITER $$
CREATE TRIGGER `trg_admin_enable` AFTER UPDATE ON `admin` FOR EACH ROW
BEGIN
    IF NEW.is_disabled = 0 AND OLD.is_disabled = 1 THEN
        -- Remove from disabled_accounts table
        DELETE FROM disabled_accounts WHERE user_id = NEW.user_id;
    END IF;
END
$$
DELIMITER ;

-- ============================================================
-- TESTING: Disable an admin account
-- ============================================================
-- Uncomment to test:
-- UPDATE admin SET is_disabled = 1 WHERE user_id = 3;
-- SELECT * FROM admin WHERE user_id = 3;
-- SELECT * FROM disabled_accounts WHERE user_id = 3;

-- ============================================================
-- TESTING: Re-enable a disabled admin account
-- ============================================================
-- Uncomment to test:
-- UPDATE admin SET is_disabled = 0 WHERE user_id = 3;
-- SELECT * FROM admin WHERE user_id = 3;
-- SELECT * FROM disabled_accounts WHERE user_id = 3;
