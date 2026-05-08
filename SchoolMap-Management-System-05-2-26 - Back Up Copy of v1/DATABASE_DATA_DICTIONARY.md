# SchoolMap Database — Data Dictionary
## Milestone 1: Database Design & Milestone 2: Server-Side Logic

---

## TABLE: `admin`
**Purpose:** Stores administrator user accounts for system management.  
**Type:** Core Reference Table  
**Records:** ~5-10 (small set of authorized users)

| Column Name | Data Type | Length | Constraint | Description |
|---|---|---|---|---|
| `user_id` | INT | 11 | PK, AI, NOT NULL | Auto-incremented unique identifier for each admin account. |
| `name` | VARCHAR | 100 | NOT NULL | Full name of the admin user. |
| `email` | VARCHAR | 100 | NOT NULL, UNIQUE | Login credential. Must be unique across all accounts. |
| `password` | VARCHAR | 255 | NOT NULL | Hashed password. VARCHAR(255) accommodates bcrypt output. |
| `role` | VARCHAR | 20 | NOT NULL | Access level: `super_admin`, `admin`, or `viewer`. Determines system privileges. |
| `created_at` | DATETIME | — | NOT NULL | Timestamp of account creation. Recorded automatically. |

**Indexes:** PRIMARY KEY (`user_id`), UNIQUE KEY (`email`)  
**Foreign Keys:** None  
**Referenced By:** `audit_log` (user_id)

---

## TABLE: `audit_log`
**Purpose:** Immutable log of all system operations for compliance & debugging.  
**Type:** Audit/Logging Table  
**Retention:** Permanent (never purged)

| Column Name | Data Type | Length | Constraint | Description |
|---|---|---|---|---|
| `audit_id` | INT | 11 | PK, AI, NOT NULL | Unique identifier for each audit entry. |
| `user_id` | INT | 11 | FK, NOT NULL | References `admin.user_id`. Identifies which admin performed the action. |
| `action` | VARCHAR | 50 | NOT NULL | Type of operation: `CREATE`, `UPDATE`, `DELETE`, `LOGIN`, `LOGOUT`. |
| `description` | TEXT | — | NULL | Detailed description of what changed (e.g., "Pin 'Room 101' updated: category 1→2"). |
| `timestamp` | DATETIME | — | NOT NULL | Exact date and time the action occurred. Recorded automatically by triggers. |

**Indexes:** PRIMARY KEY (`audit_id`), FOREIGN KEY (`user_id`)  
**Foreign Keys:** `user_id` → `admin.user_id`  
**Triggers:** 
- `trg_after_admin_insert`, `trg_after_admin_update`, `trg_after_admin_delete`
- `trg_after_map_update`, `trg_after_map_delete`
- `trg_after_legend_insert`, `trg_after_legend_update`, `trg_after_legend_delete`
- `trg_after_pin_insert`, `trg_after_pin_update`, `trg_after_pin_delete`
- `trg_after_route_insert`, `trg_after_route_update`, `trg_after_route_delete`
- `trg_after_visitor_log_insert`

---

## TABLE: `maps`
**Purpose:** Stores floor/building maps with their metadata and visibility state.  
**Type:** Core Reference Table  
**Records:** ~10-20 (one per floor per building)

| Column Name | Data Type | Length | Constraint | Description |
|---|---|---|---|---|
| `map_id` | INT | 11 | PK, AI, NOT NULL | Unique identifier for each floor/building map. |
| `floor_name` | VARCHAR | 50 | NOT NULL | Descriptive name (e.g., "Ground Floor", "Building A - Level 2"). |
| `image_path` | VARCHAR | 255 | NOT NULL | Server-relative path to map image (e.g., "uploads/maps/ground_floor.png"). |
| `status` | VARCHAR | 20 | NOT NULL | Visibility: `active` (shown to users) or `inactive` (hidden). Default: `active`. |

**Indexes:** PRIMARY KEY (`map_id`)  
**Foreign Keys:** None  
**Referenced By:** `pins` (map_id), `routes` (implicit via pins)  
**Related Procedures:** `sp_add_map`, `sp_update_map`, `sp_delete_map`, `sp_toggle_map_status`

---

## TABLE: `legend_categories`
**Purpose:** Defines icon/color categories used to classify location pins on maps.  
**Type:** Core Reference Table  
**Records:** ~10-15 (pre-defined location types)

| Column Name | Data Type | Length | Constraint | Description |
|---|---|---|---|---|
| `category_id` | INT | 11 | PK, AI, NOT NULL | Unique identifier for each category. |
| `name` | VARCHAR | 50 | NOT NULL | Display label (e.g., "Classroom", "Lab", "Office", "Restroom"). |
| `color` | VARCHAR | 20 | NOT NULL | Hex color code for map visualization (e.g., "#3498DB", "#E74C3C"). |
| `icon` | VARCHAR | 255 | NULL | Optional emoji or icon file path (e.g., "📚", "🔬", "💼"). |

**Indexes:** PRIMARY KEY (`category_id`)  
**Foreign Keys:** None  
**Referenced By:** `pins` (category_id)  
**Related Procedures:** `sp_add_legend_category`, `sp_update_legend_category`, `sp_delete_legend_category`

---

## TABLE: `pins`
**Purpose:** Stores individual location markers (rooms, offices, facilities) on maps.  
**Type:** Core Transactional Table  
**Records:** ~100-200+ (scales with campus size)

| Column Name | Data Type | Length | Constraint | Description |
|---|---|---|---|---|
| `pin_id` | INT | 11 | PK, AI, NOT NULL | Unique identifier for each pin. |
| `map_id` | INT | 11 | FK, NOT NULL | References `maps.map_id`. Indicates which floor the pin belongs to. |
| `name` | VARCHAR | 100 | NOT NULL | Display label (e.g., "Room 101", "Main Library", "Science Lab 3"). |
| `description` | TEXT | — | NULL | Detailed description of the location. TEXT allows long content (up to 65KB). |
| `category_id` | INT | 11 | FK, NULL | References `legend_categories.category_id`. Identifies location type/color. |
| `image` | VARCHAR | 255 | NULL | File path to location photo/image (e.g., "uploads/pins/room101.jpg"). |

**Indexes:** PRIMARY KEY (`pin_id`), FOREIGN KEY (`map_id`), FOREIGN KEY (`category_id`)  
**Foreign Keys:** 
- `map_id` → `maps.map_id`
- `category_id` → `legend_categories.category_id`

**Referenced By:** `routes` (from_pin_id, to_pin_id), `route_points`  
**Related Procedures:** `sp_add_pin`, `sp_update_pin`, `sp_delete_pin`

---

## TABLE: `routes`
**Purpose:** Stores navigation routes between locations on the same map.  
**Type:** Core Transactional Table  
**Records:** ~50-100+ (grows with pin count)

| Column Name | Data Type | Length | Constraint | Description |
|---|---|---|---|---|
| `route_id` | INT | 11 | PK, AI, NOT NULL | Unique identifier for each route. |
| `from_pin_id` | INT | 11 | FK, NOT NULL | References `pins.pin_id`. The starting location. |
| `to_pin_id` | INT | 11 | FK, NOT NULL | References `pins.pin_id`. The destination location. |
| `direction` | VARCHAR | 255 | NOT NULL | Text instructions (e.g., "Turn left at stairwell, up to 2nd floor"). |

**Indexes:** PRIMARY KEY (`route_id`), FOREIGN KEY (`from_pin_id`), FOREIGN KEY (`to_pin_id`)  
**Foreign Keys:** 
- `from_pin_id` → `pins.pin_id`
- `to_pin_id` → `pins.pin_id`

**Referenced By:** `route_points` (route_id)  
**Related Procedures:** `sp_add_route`, `sp_update_route`, `sp_delete_route`

---

## TABLE: `route_points`
**Purpose:** Stores waypoint coordinates for visual rendering of routes on maps.  
**Type:** Detail/Child Table  
**Records:** ~500-2000 (depends on route complexity)

| Column Name | Data Type | Length | Constraint | Description |
|---|---|---|---|---|
| `id` | INT | 11 | PK, AI, NOT NULL | Unique identifier for each waypoint. |
| `route_id` | INT | 11 | FK, NOT NULL | References `routes.route_id`. Links waypoint to its parent route. Cascade DELETE enabled. |
| `point_order` | INT | — | NOT NULL | Sequence number (1, 2, 3...) ensuring waypoints are drawn in correct order. |
| `x` | FLOAT | — | NOT NULL | Horizontal pixel coordinate on map image. FLOAT allows sub-pixel precision. |
| `y` | FLOAT | — | NOT NULL | Vertical pixel coordinate on map image. FLOAT allows sub-pixel precision. |

**Indexes:** PRIMARY KEY (`id`), FOREIGN KEY (`route_id`)  
**Foreign Keys:** `route_id` → `routes.route_id` (ON DELETE CASCADE)  
**Related Procedures:** `sp_add_route_points`

---

## TABLE: `visitor_logs`
**Purpose:** Maintains record of visitors to campus for security & administrative purposes.  
**Type:** Transactional Log Table  
**Records:** ~1000+ (grows daily)

| Column Name | Data Type | Length | Constraint | Description |
|---|---|---|---|---|
| `log_id` | INT | 11 | PK, AI, NOT NULL | Unique identifier for each visitor log entry. |
| `name` | VARCHAR | 100 | NOT NULL | Full name of the visitor as written in logbook. |
| `purpose` | VARCHAR | 255 | NOT NULL | Reason for visit (e.g., "Meeting with Dean", "Document Request"). |
| `destination` | VARCHAR | 255 | NOT NULL | Specific room/office being visited (e.g., "Room 101", "Admin Office"). |
| `category` | VARCHAR | 50 | NOT NULL | Visit classification: `official`, `academic`, `medical`, `service`, or `personal`. |
| `time_in` | TIME | — | NOT NULL | Clock time of arrival (stored separately from date for flexible querying). |
| `date` | DATE | — | NOT NULL | Calendar date of visit (stored separately from time for flexible querying). |
| `plate_no` | VARCHAR | 20 | NULL | Vehicle plate number for vehicular visitors. NULL for walk-in visitors. |

**Indexes:** PRIMARY KEY (`log_id`)  
**Foreign Keys:** None (standalone transactional record)  
**Related Procedures:** `sp_add_visitor_log`

---

## NORMALIZATION & 3NF JUSTIFICATION

### Elimination of Data Redundancy:
1. **Separation of Maps & Pins:** Map metadata (floor_name, image_path) separated from location data (name, description). Eliminates repetition of map info across multiple pins.

2. **Legend Categories:** Legend properties (color, icon) stored separately from pins. Allows multiple pins to share the same category without duplication.

3. **Routes & Route_Points:** Route metadata (from_pin_id, to_pin_id) separated from waypoint coordinates. A single route can have many waypoints without duplicating route metadata.

4. **Audit Log Normalization:** Audit table stores only the user_id (FK), not redundant user data (name, email).

### Functional Dependencies (3NF):
- **Admin:** user_id → {name, email, password, role} ✓ (All non-key attributes depend on user_id)
- **Maps:** map_id → {floor_name, image_path, status} ✓
- **Legend:** category_id → {name, color, icon} ✓
- **Pins:** pin_id → {map_id, name, description, category_id, image} ✓
- **Routes:** route_id → {from_pin_id, to_pin_id, direction} ✓
- **Route_Points:** id → {route_id, point_order, x, y} ✓
- **Visitor_Logs:** log_id → {name, purpose, destination, category, time_in, date, plate_no} ✓
- **Audit_Log:** audit_id → {user_id, action, description, timestamp} ✓

**Conclusion:** All tables are in **3rd Normal Form (3NF)** with no transitive dependencies, partial dependencies, or non-key attribute anomalies.

---

## REFERENTIAL INTEGRITY & FOREIGN KEY CONSTRAINTS

| Constraint | References | ON DELETE | ON UPDATE | Purpose |
|---|---|---|---|---|
| `audit_log_ibfk_1` | admin.user_id | RESTRICT | CASCADE | Audit logs must reference valid admins. |
| `pins_ibfk_1` | maps.map_id | RESTRICT | CASCADE | Pins must exist on valid maps. |
| `pins_ibfk_2` | legend_categories.category_id | SET NULL | CASCADE | Pins can have NULL category if legend deleted. |
| `routes_ibfk_1` | pins.pin_id | RESTRICT | CASCADE | Routes must connect valid pins. |
| `routes_ibfk_2` | pins.pin_id | RESTRICT | CASCADE | Routes must connect valid pins. |
| `route_points_ibfk_1` | routes.route_id | CASCADE | CASCADE | Route points cascade-delete when route deleted. |

---

## STORED PROCEDURES SUMMARY

### User & Authentication
- **`sp_authenticate_admin`**: Validates login credentials; returns user details or error.
- **`sp_register_admin`**: Creates new admin account with role validation.
- **`sp_update_admin`**: Updates admin details with email uniqueness check.
- **`sp_delete_admin`**: Removes admin account from system.

### Map Management
- **`sp_add_map`**: Inserts new floor/building map.
- **`sp_update_map`**: Modifies existing map metadata.
- **`sp_delete_map`**: Removes map (with cascade delete check for pins).
- **`sp_toggle_map_status`**: Switches map visibility between active/inactive.

### Legend Categories
- **`sp_add_legend_category`**: Creates new location type with color.
- **`sp_update_legend_category`**: Updates category properties.
- **`sp_delete_legend_category`**: Removes category from system.

### Pin Management
- **`sp_add_pin`**: Creates location pin with referential integrity checks.
- **`sp_update_pin`**: Modifies pin name, description, category, or image.
- **`sp_delete_pin`**: Removes pin (triggers cascade deletion of associated routes).

### Route Management
- **`sp_add_route`**: Creates navigation route between two pins with validation.
- **`sp_update_route`**: Modifies route endpoints or directions.
- **`sp_delete_route`**: Removes route (triggers cascade deletion of waypoints).
- **`sp_add_route_points`**: Inserts waypoint coordinates for route visualization.

### Visitor Tracking
- **`sp_add_visitor_log`**: Records visitor entry with all required fields.

---

## TRIGGERS & AUDIT TRAIL

All sensitive operations automatically log to `audit_log` table via triggers:

| Table | Trigger Name | Action | Audit Entry Content |
|---|---|---|---|
| **admin** | trg_after_admin_insert | CREATE | New admin: ID, name, email, role |
| | trg_after_admin_update | UPDATE | Changed admin details: before→after values |
| | trg_after_admin_delete | DELETE | Deleted admin: ID, name, email |
| **maps** | trg_after_map_update | UPDATE | Modified map: floor name, status changes |
| | trg_after_map_delete | DELETE | Removed map: ID, floor name |
| **legend_categories** | trg_after_legend_insert | CREATE | New category: ID, name, color |
| | trg_after_legend_update | UPDATE | Updated category: before→after values |
| | trg_after_legend_delete | DELETE | Deleted category: ID, name |
| **pins** | trg_after_pin_insert | CREATE | New pin: ID, name, map_id, category_id |
| | trg_after_pin_update | UPDATE | Updated pin: before→after field values |
| | trg_after_pin_delete | DELETE | Removed pin: ID, name, map_id |
| **routes** | trg_after_route_insert | CREATE | New route: ID, from/to pins, direction |
| | trg_after_route_update | UPDATE | Modified route: before→after values |
| | trg_after_route_delete | DELETE | Deleted route: ID, endpoints |
| **visitor_logs** | trg_after_visitor_log_insert | CREATE | Visitor entry: name, purpose, destination, date/time |

**Session Variable Requirement:** Set `@current_admin_id = <user_id>` before operations so triggers capture WHO made the change.

---

## DATABASE DESIGN PRINCIPLES APPLIED

✅ **Normalization:** 3NF with no data redundancy  
✅ **Referential Integrity:** Foreign key constraints with proper cascade/restrict rules  
✅ **Audit Trail:** Automatic logging of all sensitive operations via triggers  
✅ **Data Validation:** Stored procedures validate input before insert/update  
✅ **Scalability:** Tables indexed on frequently queried columns (FK, status, email)  
✅ **Security:** Audit log immutable; role-based access control via admin.role  
✅ **ACID Compliance:** Transactions supported for multi-step critical operations (see transaction examples)

---

*Data Dictionary Version 1.0 - Milestone 2 Submission - May 2, 2026*
