-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Host: 127.0.0.1
-- Generation Time: May 09, 2026 at 05:54 PM
-- Server version: 10.4.32-MariaDB
-- PHP Version: 8.0.30

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `school_map_db2`
--

DELIMITER $$
--
-- Procedures
--
CREATE DEFINER=`root`@`localhost` PROCEDURE `sp_add_legend_category` (IN `p_name` VARCHAR(50), IN `p_color` VARCHAR(20), IN `p_icon` VARCHAR(255))   BEGIN
    IF p_name IS NULL OR p_name = '' THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Category name is required.';
    END IF;

    IF p_color IS NULL OR p_color = '' THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Category color is required.';
    END IF;

    INSERT INTO legend_categories (name, color, icon)
    VALUES (p_name, p_color, p_icon);

    SELECT LAST_INSERT_ID() AS new_category_id, 'Category added successfully.' AS message;
END$$

CREATE DEFINER=`root`@`localhost` PROCEDURE `sp_add_map` (IN `p_floor_name` VARCHAR(50), IN `p_image_path` VARCHAR(255))   BEGIN
    IF p_floor_name IS NULL OR p_floor_name = '' THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Floor name is required.';
    END IF;

    IF p_image_path IS NULL OR p_image_path = '' THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Image path is required.';
    END IF;

    INSERT INTO maps (floor_name, image_path, status)
    VALUES (p_floor_name, p_image_path, 'active');

    SELECT LAST_INSERT_ID() AS new_map_id, 'Map added successfully.' AS message;
END$$

CREATE DEFINER=`root`@`localhost` PROCEDURE `sp_add_pin` (IN `p_map_id` INT, IN `p_name` VARCHAR(100), IN `p_description` TEXT, IN `p_category_id` INT, IN `p_image` VARCHAR(255))   BEGIN
    IF NOT EXISTS (SELECT 1 FROM maps WHERE map_id = p_map_id) THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Map not found.';
    END IF;

    IF p_category_id IS NOT NULL AND
       NOT EXISTS (SELECT 1 FROM legend_categories WHERE category_id = p_category_id) THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Category not found.';
    END IF;

    INSERT INTO pins (map_id, name, description, category_id, image)
    VALUES (p_map_id, p_name, p_description, p_category_id, p_image);

    SELECT LAST_INSERT_ID() AS new_pin_id, 'Pin added successfully.' AS message;
END$$

CREATE DEFINER=`root`@`localhost` PROCEDURE `sp_add_route` (IN `p_from_pin_id` INT, IN `p_to_pin_id` INT, IN `p_direction` VARCHAR(255))   BEGIN
    IF NOT EXISTS (SELECT 1 FROM pins WHERE pin_id = p_from_pin_id) THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Starting pin not found.';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pins WHERE pin_id = p_to_pin_id) THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Destination pin not found.';
    END IF;

    IF p_from_pin_id = p_to_pin_id THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'A route cannot start and end at the same pin.';
    END IF;

    INSERT INTO routes (from_pin_id, to_pin_id, direction)
    VALUES (p_from_pin_id, p_to_pin_id, p_direction);

    SELECT LAST_INSERT_ID() AS new_route_id,
           'Route added successfully.' AS message;
END$$

CREATE DEFINER=`root`@`localhost` PROCEDURE `sp_add_route_points` (IN `p_route_id` INT, IN `p_point_order` INT, IN `p_x` FLOAT, IN `p_y` FLOAT)   BEGIN
    IF NOT EXISTS (SELECT 1 FROM routes WHERE route_id = p_route_id) THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Route not found.';
    END IF;

    INSERT INTO route_points (route_id, point_order, x, y)
    VALUES (p_route_id, p_point_order, p_x, p_y);

    SELECT LAST_INSERT_ID() AS new_point_id, 'Route point added successfully.' AS message;
END$$

CREATE DEFINER=`root`@`localhost` PROCEDURE `sp_delete_legend_category` (IN `p_category_id` INT)   BEGIN
    IF NOT EXISTS (SELECT 1 FROM legend_categories WHERE category_id = p_category_id) THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Category not found.';
    END IF;

    DELETE FROM legend_categories WHERE category_id = p_category_id;
    SELECT p_category_id AS category_id, 'Category deleted successfully.' AS message;
END$$

CREATE DEFINER=`root`@`localhost` PROCEDURE `sp_delete_map` (IN `p_map_id` INT)   BEGIN
    IF NOT EXISTS (SELECT 1 FROM maps WHERE map_id = p_map_id) THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Map not found.';
    END IF;

    IF EXISTS (SELECT 1 FROM pins WHERE map_id = p_map_id) THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Cannot delete map with existing pins. Delete pins first.';
    END IF;

    DELETE FROM maps WHERE map_id = p_map_id;
    SELECT p_map_id AS map_id, 'Map deleted successfully.' AS message;
END$$

CREATE DEFINER=`root`@`localhost` PROCEDURE `sp_delete_pin` (IN `p_pin_id` INT)   BEGIN
    IF NOT EXISTS (SELECT 1 FROM pins WHERE pin_id = p_pin_id) THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Pin not found.';
    END IF;

    DELETE FROM pins WHERE pin_id = p_pin_id;
    SELECT p_pin_id AS pin_id, 'Pin deleted successfully.' AS message;
END$$

CREATE DEFINER=`root`@`localhost` PROCEDURE `sp_delete_route` (IN `p_route_id` INT)   BEGIN
    IF NOT EXISTS (SELECT 1 FROM routes WHERE route_id = p_route_id) THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Route not found.';
    END IF;

    DELETE FROM routes WHERE route_id = p_route_id;
    SELECT p_route_id AS route_id, 'Route deleted successfully.' AS message;
END$$

CREATE DEFINER=`root`@`localhost` PROCEDURE `sp_register_admin` (IN `p_name` VARCHAR(100), IN `p_email` VARCHAR(100), IN `p_password` VARCHAR(255), IN `p_role` VARCHAR(20))   BEGIN
    IF p_role NOT IN ('super_admin', 'admin', 'viewer') THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Invalid role. Must be super_admin, admin, or viewer.';
    END IF;

    IF EXISTS (SELECT 1 FROM admin WHERE email = p_email) THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Email already exists.';
    END IF;

    INSERT INTO admin (name, email, password, role, created_at)
    VALUES (p_name, p_email, p_password, p_role, NOW());

    SELECT LAST_INSERT_ID() AS new_admin_id, 'Admin registered successfully.' AS message;
END$$

CREATE DEFINER=`root`@`localhost` PROCEDURE `sp_toggle_map_status` (IN `p_map_id` INT)   BEGIN
    DECLARE v_current_status VARCHAR(20);

    IF NOT EXISTS (SELECT 1 FROM maps WHERE map_id = p_map_id) THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Map not found.';
    END IF;

    SELECT status INTO v_current_status
    FROM maps WHERE map_id = p_map_id;

    IF v_current_status = 'active' THEN
        UPDATE maps SET status = 'inactive' WHERE map_id = p_map_id;
        SELECT p_map_id AS map_id, 'inactive' AS new_status, 'Map deactivated.' AS message;
    ELSE
        UPDATE maps SET status = 'active' WHERE map_id = p_map_id;
        SELECT p_map_id AS map_id, 'active' AS new_status, 'Map activated.' AS message;
    END IF;
END$$

CREATE DEFINER=`root`@`localhost` PROCEDURE `sp_update_legend_category` (IN `p_category_id` INT, IN `p_name` VARCHAR(50), IN `p_color` VARCHAR(20), IN `p_icon` VARCHAR(255))   BEGIN
    IF NOT EXISTS (SELECT 1 FROM legend_categories WHERE category_id = p_category_id) THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Category not found.';
    END IF;

    UPDATE legend_categories
    SET name = IFNULL(p_name, name),
        color = IFNULL(p_color, color),
        icon = IFNULL(p_icon, icon)
    WHERE category_id = p_category_id;

    SELECT p_category_id AS category_id, 'Category updated successfully.' AS message;
END$$

CREATE DEFINER=`root`@`localhost` PROCEDURE `sp_update_map` (IN `p_map_id` INT, IN `p_floor_name` VARCHAR(50), IN `p_image_path` VARCHAR(255))   BEGIN
    IF NOT EXISTS (SELECT 1 FROM maps WHERE map_id = p_map_id) THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Map not found.';
    END IF;

    UPDATE maps 
    SET floor_name = IFNULL(p_floor_name, floor_name),
        image_path = IFNULL(p_image_path, image_path)
    WHERE map_id = p_map_id;

    SELECT p_map_id AS map_id, 'Map updated successfully.' AS message;
END$$

CREATE DEFINER=`root`@`localhost` PROCEDURE `sp_update_pin` (IN `p_pin_id` INT, IN `p_name` VARCHAR(100), IN `p_description` TEXT, IN `p_category_id` INT, IN `p_image` VARCHAR(255))   BEGIN
    IF NOT EXISTS (SELECT 1 FROM pins WHERE pin_id = p_pin_id) THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Pin not found.';
    END IF;

    UPDATE pins
    SET name = IFNULL(p_name, name),
        description = IFNULL(p_description, description),
        category_id = IFNULL(p_category_id, category_id),
        image = IFNULL(p_image, image)
    WHERE pin_id = p_pin_id;

    SELECT p_pin_id AS pin_id, 'Pin updated successfully.' AS message;
END$$

CREATE DEFINER=`root`@`localhost` PROCEDURE `sp_update_route` (IN `p_route_id` INT, IN `p_from_pin_id` INT, IN `p_to_pin_id` INT, IN `p_direction` VARCHAR(255))   BEGIN
    IF NOT EXISTS (SELECT 1 FROM routes WHERE route_id = p_route_id) THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Route not found.';
    END IF;

    IF p_from_pin_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pins WHERE pin_id = p_from_pin_id) THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Starting pin not found.';
    END IF;

    IF p_to_pin_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pins WHERE pin_id = p_to_pin_id) THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Destination pin not found.';
    END IF;

    UPDATE routes
    SET from_pin_id = IFNULL(p_from_pin_id, from_pin_id),
        to_pin_id = IFNULL(p_to_pin_id, to_pin_id),
        direction = IFNULL(p_direction, direction)
    WHERE route_id = p_route_id;

    SELECT p_route_id AS route_id, 'Route updated successfully.' AS message;
END$$

DELIMITER ;

-- --------------------------------------------------------

--
-- Table structure for table `admin`
--

CREATE TABLE `admin` (
  `user_id` int(11) NOT NULL,
  `name` varchar(100) NOT NULL,
  `email` varchar(100) NOT NULL,
  `password` varchar(255) NOT NULL,
  `role` varchar(20) NOT NULL,
  `created_at` datetime NOT NULL,
  `is_disabled` tinyint(1) NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `admin`
--

INSERT INTO `admin` (`user_id`, `name`, `email`, `password`, `role`, `created_at`) VALUES
(2, 'Super Administrator', 'superadmin@school.com', 'superadmin123', 'super_admin', '2026-05-03 10:23:39'),
(3, 'LANCE GABRIEL BERNARDO', 'lancegaby1004@school.com', 'Lance100405', 'admin', '2026-05-03 10:24:43'),
(4, 'Joaquin Borloloy', 'borloloy@school.com', 'borloloy1234', 'admin', '2026-05-03 10:40:34'),
(6, 'Aaron', 'superaaron@school.com', '$2y$10$9jm7e5zaxPv50QPwuAGc4eB0qwzgdOQ.Ge//JIvaHAxprT2FckJUe', 'admin', '2026-05-08 15:34:14');

-- --------------------------------------------------------

--
-- Table structure for table `audit_log`
--

CREATE TABLE `audit_log` (
  `audit_id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `action` varchar(50) NOT NULL,
  `description` text DEFAULT NULL,
  `timestamp` datetime NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `audit_log`
--

INSERT INTO `audit_log` (`audit_id`, `user_id`, `action`, `description`, `timestamp`) VALUES
(1, 1, 'CREATE', 'New pin created: \"Room 101\" on map_id 1 under category_id 1', '2026-05-02 21:18:48'),
(2, 4, 'DELETE', 'Pin deleted — ID: 1 | Name: \"Room 101\" | Was on map_id: 1 | Category_id: 1', '2026-05-03 10:41:31'),
(3, 4, 'CREATE', 'New pin created: \"Classroom\" on map_id 1 under category_id 1', '2026-05-03 10:43:00'),
(4, 2, 'ADMIN', 'Created admin account: Aaron — Admin Management', '2026-05-08 15:33:51'),
(5, 2, 'DELETE', 'Deleted admin account: Aaron (superaaron@school.com)', '2026-05-08 15:33:54'),
(6, 2, 'ADMIN', 'Deleted admin: Aaron — Admin Management', '2026-05-08 15:33:54'),
(7, 2, 'ADMIN', 'Created admin account: Aaron — Admin Management', '2026-05-08 15:34:14'),
(8, 6, 'CREATE', 'New pin created: \"Pin1\" on map_id 1 under category_id 6', '2026-05-08 15:43:26'),
(9, 6, 'CREATE', 'New pin created: \"Pin1\" on map_id 1 under category_id 6', '2026-05-08 15:43:29'),
(10, 6, 'CREATE', 'New pin created: \"Pin1\" on map_id 1 under category_id 6', '2026-05-08 15:43:32'),
(11, 6, 'CREATE', 'New pin created: \"Pin2\" on map_id 1 under category_id 1', '2026-05-08 15:43:46'),
(12, 6, 'CREATE', 'New pin created: \"P2\" on map_id 1 under category_id 4', '2026-05-08 16:03:55'),
(13, 6, 'CREATE', 'New pin created: \"P2\" on map_id 1 under category_id 4', '2026-05-08 16:03:56'),
(14, 6, 'CREATE', 'New pin created: \"P1\" on map_id 1 under category_id 4', '2026-05-08 16:04:03'),
(15, 6, 'CREATE', 'New pin created: \"P1\" on map_id 1 under category_id 4', '2026-05-08 16:04:04'),
(16, 6, 'CREATE', 'New pin created: \"P2\" on map_id 1 under category_id 4', '2026-05-08 16:05:09'),
(17, 6, 'CREATE', 'New pin created: \"P2\" on map_id 1 under category_id 4', '2026-05-08 16:05:10'),
(18, 6, 'CREATE', 'New pin created: \"P2\" on map_id 1 under category_id 4', '2026-05-08 16:05:11'),
(19, 2, 'DELETE', 'Deleted admin account: Juan dela Cruz (juan@school.edu.ph)', '2026-05-09 23:51:53'),
(20, 2, 'ADMIN', 'Deleted admin: 1 — Admin Management', '2026-05-09 23:51:53');

-- --------------------------------------------------------

--
-- Table structure for table `disabled_accounts`
--

CREATE TABLE `disabled_accounts` (
  `disabled_id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `name` varchar(100) NOT NULL,
  `email` varchar(100) NOT NULL,
  `password` varchar(255) NOT NULL,
  `role` varchar(20) NOT NULL,
  `created_at` datetime NOT NULL,
  `disabled_at` datetime NOT NULL DEFAULT current_timestamp(),
  `disabled_by` int(11) DEFAULT NULL,
  `reason` varchar(255) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `legend_categories`
--

CREATE TABLE `legend_categories` (
  `category_id` int(11) NOT NULL,
  `name` varchar(50) NOT NULL,
  `color` varchar(20) NOT NULL,
  `icon` varchar(255) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `legend_categories`
--

INSERT INTO `legend_categories` (`category_id`, `name`, `color`, `icon`) VALUES
(1, 'Classroom', '#3498DB', '📚');

-- --------------------------------------------------------

--
-- Table structure for table `maps`
--

CREATE TABLE `maps` (
  `map_id` int(11) NOT NULL,
  `floor_name` varchar(50) NOT NULL,
  `image_path` varchar(255) NOT NULL,
  `status` varchar(20) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `maps`
--

INSERT INTO `maps` (`map_id`, `floor_name`, `image_path`, `status`) VALUES
(1, 'Ground Floor', 'maps/ground.png', 'active');

-- --------------------------------------------------------

--
-- Table structure for table `pins`
--

CREATE TABLE `pins` (
  `pin_id` int(11) NOT NULL,
  `map_id` int(11) NOT NULL,
  `name` varchar(100) NOT NULL,
  `description` text DEFAULT NULL,
  `category_id` int(11) DEFAULT NULL,
  `image` varchar(255) DEFAULT NULL,
  `x` float NOT NULL DEFAULT 50,
  `y` float NOT NULL DEFAULT 50
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `pins`
--

INSERT INTO `pins` (`pin_id`, `map_id`, `name`, `description`, `category_id`, `image`, `x`, `y`) VALUES
(1, 1, 'Classroom', '', 1, NULL, 50, 50),
(2, 1, 'Pin1', NULL, 6, NULL, 17.1822, 46.5855),
(3, 1, 'Pin1', NULL, 6, NULL, 17.1822, 46.5855),
(4, 1, 'Pin1', NULL, 6, NULL, 17.1822, 46.5855),
(5, 1, 'Pin2', NULL, 1, NULL, 65.4204, 58.4049),
(6, 1, 'P2', NULL, 4, NULL, 93.3945, 48.0864),
(7, 1, 'P2', NULL, 4, NULL, 93.3945, 48.0864),
(8, 1, 'P1', NULL, 4, NULL, 93.3945, 48.0864),
(9, 1, 'P1', NULL, 4, NULL, 93.3945, 48.0864),
(10, 1, 'P2', NULL, 4, NULL, 92.1095, 46.7731),
(11, 1, 'P2', NULL, 4, NULL, 92.1095, 46.7731),
(12, 1, 'P2', NULL, 4, NULL, 92.1095, 46.7731);

--
-- Triggers `pins`
--
DELIMITER $$
CREATE TRIGGER `trg_after_pin_delete` AFTER DELETE ON `pins` FOR EACH ROW BEGIN
    INSERT INTO audit_log (user_id, action, description, timestamp)
    VALUES (
        @current_admin_id,
        'DELETE',
        CONCAT('Pin deleted — ID: ', OLD.pin_id,
               ' | Name: "', OLD.name, '"',
               ' | Was on map_id: ', OLD.map_id,
               ' | Category_id: ', IFNULL(OLD.category_id, 'None')),
        NOW()
    );
END
$$
DELIMITER ;
DELIMITER $$
CREATE TRIGGER `trg_after_pin_insert` AFTER INSERT ON `pins` FOR EACH ROW BEGIN
    INSERT INTO audit_log (user_id, action, description, timestamp)
    VALUES (
        @current_admin_id,
        'CREATE',
        CONCAT('New pin created: "', NEW.name, '" on map_id ', NEW.map_id,
               ' under category_id ', IFNULL(NEW.category_id, 'None')),
        NOW()
    );
END
$$
DELIMITER ;
DELIMITER $$
CREATE TRIGGER `trg_after_pin_update` AFTER UPDATE ON `pins` FOR EACH ROW BEGIN
    INSERT INTO audit_log (user_id, action, description, timestamp)
    VALUES (
        @current_admin_id,
        'UPDATE',
        CONCAT('Pin updated — ID: ', OLD.pin_id,
               ' | Name: "', OLD.name, '" → "', NEW.name, '"',
               ' | Map: ', OLD.map_id, ' → ', NEW.map_id,
               ' | Category: ', IFNULL(OLD.category_id, 'None'),
               ' → ', IFNULL(NEW.category_id, 'None')),
        NOW()
    );
END
$$
DELIMITER ;

-- --------------------------------------------------------

--
-- Triggers for `admin` table - handle disabled accounts
--
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

-- --------------------------------------------------------

--
-- Table structure for table `routes`
--

CREATE TABLE `routes` (
  `route_id` int(11) NOT NULL,
  `from_pin_id` int(11) NOT NULL,
  `to_pin_id` int(11) NOT NULL,
  `destination` varchar(255) NOT NULL,
  `direction` varchar(255) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `routes`
--

INSERT INTO `routes` (`route_id`, `from_pin_id`, `to_pin_id`, `destination`, `direction`) VALUES
(1, 2, 5, '', 'Pin1 to Pin2');

-- --------------------------------------------------------

--
-- Table structure for table `route_points`
--

CREATE TABLE `route_points` (
  `id` int(11) NOT NULL,
  `route_id` int(11) NOT NULL,
  `point_order` int(11) NOT NULL,
  `x` float NOT NULL,
  `y` float NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `visitor_logs`
--

CREATE TABLE `visitor_logs` (
  `log_id` int(11) NOT NULL,
  `name` varchar(100) NOT NULL,
  `purpose` varchar(255) NOT NULL,
  `destination` varchar(255) NOT NULL,
  `category` varchar(50) NOT NULL,
  `time_in` time NOT NULL,
  `time_out` time DEFAULT NULL,
  `date` date NOT NULL,
  `plate_no` varchar(20) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `visitor_logs`
--

INSERT INTO `visitor_logs` (`log_id`, `name`, `purpose`, `destination`, `category`, `time_in`, `time_out`, `date`, `plate_no`) VALUES
(1, 'Lance', 'Enrollment', 'Room 191', 'Student', '15:37:10', NULL, '2026-05-08', NULL),
(2, 'Vincent Adolf Sablay', 'SportFest', 'Gym', 'Visitor', '15:40:01', NULL, '2026-05-08', NULL),
(3, 'Aaron Cayabyab', 'Enroll', 'Registrar', 'Student', '16:02:30', NULL, '2026-05-08', NULL);

--
-- Triggers `visitor_logs`
--
DELIMITER $$
CREATE TRIGGER `trg_visitor_log_delete` AFTER DELETE ON `visitor_logs` FOR EACH ROW BEGIN
    INSERT INTO audit_log (user_id, action, description, timestamp)
    VALUES (
        COALESCE(@current_admin_id, 0),
        'VISITOR_CHECKOUT',
        CONCAT('Visitor logged out: ', OLD.name, ' | Time in: ', OLD.time_in, ' | Date: ', OLD.date),
        NOW()
    );
END
$$
DELIMITER ;
DELIMITER $$
CREATE TRIGGER `trg_visitor_log_insert` AFTER INSERT ON `visitor_logs` FOR EACH ROW BEGIN
    INSERT INTO audit_log (user_id, action, description, timestamp)
    VALUES (
        COALESCE(@current_admin_id, 0),
        'VISITOR_CHECKIN',
        CONCAT('Visitor logged in: ', NEW.name, ' | Purpose: ', NEW.purpose, ' | Destination: ', NEW.destination),
        NOW()
    );
END
$$
DELIMITER ;
DELIMITER $$
CREATE TRIGGER `trg_visitor_log_update` AFTER UPDATE ON `visitor_logs` FOR EACH ROW BEGIN
    INSERT INTO audit_log (user_id, action, description, timestamp)
    VALUES (
        COALESCE(@current_admin_id, 0),
        'VISITOR_UPDATE',
        CONCAT('Visitor log updated: ', OLD.name, ' → ', NEW.name, ' | Time in: ', OLD.time_in, ' → ', NEW.time_in),
        NOW()
    );
END
$$
DELIMITER ;

--
-- Indexes for dumped tables
--

--
-- Indexes for table `admin`
--
ALTER TABLE `admin`
  ADD PRIMARY KEY (`user_id`),
  ADD UNIQUE KEY `email` (`email`);

--
-- Indexes for table `audit_log`
--
ALTER TABLE `audit_log`
  ADD PRIMARY KEY (`audit_id`),
  ADD KEY `user_id` (`user_id`);

--
-- Indexes for table `disabled_accounts`
--
ALTER TABLE `disabled_accounts`
  ADD PRIMARY KEY (`disabled_id`),
  ADD KEY `idx_disabled_user_id` (`user_id`),
  ADD KEY `idx_disabled_by` (`disabled_by`);

--
-- Indexes for table `legend_categories`
--
ALTER TABLE `legend_categories`
  ADD PRIMARY KEY (`category_id`);

--
-- Indexes for table `maps`
--
ALTER TABLE `maps`
  ADD PRIMARY KEY (`map_id`);

--
-- Indexes for table `pins`
--
ALTER TABLE `pins`
  ADD PRIMARY KEY (`pin_id`),
  ADD KEY `map_id` (`map_id`),
  ADD KEY `category_id` (`category_id`);

--
-- Indexes for table `routes`
--
ALTER TABLE `routes`
  ADD PRIMARY KEY (`route_id`),
  ADD KEY `from_pin_id` (`from_pin_id`),
  ADD KEY `to_pin_id` (`to_pin_id`);

--
-- Indexes for table `route_points`
--
ALTER TABLE `route_points`
  ADD PRIMARY KEY (`id`),
  ADD KEY `route_id` (`route_id`);

--
-- Indexes for table `visitor_logs`
--
ALTER TABLE `visitor_logs`
  ADD PRIMARY KEY (`log_id`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `admin`
--
ALTER TABLE `admin`
  MODIFY `user_id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=7;

--
-- AUTO_INCREMENT for table `audit_log`
--
ALTER TABLE `audit_log`
  MODIFY `audit_id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=21;

--
-- AUTO_INCREMENT for table `disabled_accounts`
--
ALTER TABLE `disabled_accounts`
  MODIFY `disabled_id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `legend_categories`
--
ALTER TABLE `legend_categories`
  MODIFY `category_id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

--
-- AUTO_INCREMENT for table `maps`
--
ALTER TABLE `maps`
  MODIFY `map_id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

--
-- AUTO_INCREMENT for table `pins`
--
ALTER TABLE `pins`
  MODIFY `pin_id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=13;

--
-- AUTO_INCREMENT for table `routes`
--
ALTER TABLE `routes`
  MODIFY `route_id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

--
-- AUTO_INCREMENT for table `route_points`
--
ALTER TABLE `route_points`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `visitor_logs`
--
ALTER TABLE `visitor_logs`
  MODIFY `log_id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=4;

--
-- Constraints for dumped tables
--

--
-- Constraints for table `disabled_accounts`
--
ALTER TABLE `disabled_accounts`
  ADD CONSTRAINT `fk_disabled_by_admin` FOREIGN KEY (`disabled_by`) REFERENCES `admin` (`user_id`);

COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
