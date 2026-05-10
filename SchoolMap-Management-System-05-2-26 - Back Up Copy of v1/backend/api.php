<?php
/*
 ============================================================
  SCHOOLMAP — api.php
  MySQL backend for SchoolMap — connects to school_map_db2
  Uses stored procedures and triggers via PDO MySQL
  Requires: PHP 7.4+, PDO, PDO_MySQL extensions
 ============================================================
 
  ENDPOINTS:
  ----------
  POST   api.php?action=login                — Login an admin
  POST   api.php?action=logout               — Logout current admin
  GET    api.php?action=me                   — Get current session user
 
  GET    api.php?action=floors               — Get all maps/floors
  POST   api.php?action=floors               — Add a new floor
  PUT    api.php?action=floors&id=X          — Update a floor
  DELETE api.php?action=floors&id=X          — Delete a floor
  POST   api.php?action=floors&action2=toggle&id=X — Toggle floor status
 
  GET    api.php?action=pins                 — Get all pins
  POST   api.php?action=pins                 — Add a new pin
  PUT    api.php?action=pins&id=X            — Update a pin
  DELETE api.php?action=pins&id=X            — Delete a pin
 
  GET    api.php?action=routes               — Get all routes
  POST   api.php?action=routes               — Add a new route
  PUT    api.php?action=routes&id=X          — Update a route
  DELETE api.php?action=routes&id=X          — Delete a route
 
  GET    api.php?action=legends              — Get all legend categories
  POST   api.php?action=legends              — Add a legend category
  PUT    api.php?action=legends&id=X         — Update a legend category
  DELETE api.php?action=legends&id=X         — Delete a legend category
 
  GET    api.php?action=visitor_logs         — Get all visitor logs
  POST   api.php?action=visitor_logs         — Add a visitor log
 
  GET    api.php?action=audit_log            — Get audit log (admin only)
 ============================================================
*/
 
/* ============================================================
   CONFIGURATION — update DB credentials if needed
   ============================================================ */
 
define('DB_HOST',   'localhost');
define('DB_NAME',   'school_map_db2');
define('DB_USER',   'schoolmap_user'); // Milestone 3 — Least Privilege user
define('DB_PASS',   'SchoolMap@Secure2025!'); // schoolmap_user password
define('DB_CHARSET','utf8mb4');
define('SESSION_NAME', 'schoolmap_session');
define('APP_VERSION',  '2.0');
 
/* ============================================================
   BOOTSTRAP
   ============================================================ */
 
session_name(SESSION_NAME);
session_start();
 
header('Content-Type: application/json; charset=UTF-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-Requested-With');
header('Access-Control-Allow-Credentials: true');
 
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}
 
$requestBody = file_get_contents('php://input');
$requestData = [];
if (!empty($requestBody)) {
    $requestData = json_decode($requestBody, true) ?? [];
}
 
$action     = isset($_GET['action'])  ? trim($_GET['action'])  : '';
$action2    = isset($_GET['action2']) ? trim($_GET['action2']) : '';
$resourceId = isset($_GET['id'])      ? trim($_GET['id'])      : '';
$method     = $_SERVER['REQUEST_METHOD'];
 
/* ============================================================
   DATABASE CONNECTION
   ============================================================ */
 
function getDatabase()
{
    static $pdo = null;
    if ($pdo !== null) { return $pdo; }
 
    try {
        $dsn = 'mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=' . DB_CHARSET;
        $pdo = new PDO($dsn, DB_USER, DB_PASS);
        $pdo->setAttribute(PDO::ATTR_ERRMODE,            PDO::ERRMODE_EXCEPTION);
        $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
        $pdo->setAttribute(PDO::ATTR_EMULATE_PREPARES,   false);
        return $pdo;
    } catch (PDOException $e) {
        jsonError(500, 'Database connection failed: ' . $e->getMessage());
        exit;
    }
}
 
/* ============================================================
   SET SESSION VARIABLE FOR TRIGGERS
   Must be called before any INSERT/UPDATE/DELETE so that
   trg_after_pin_insert/update/delete can log the admin ID.
   ============================================================ */
 
function setAdminSession(PDO $pdo)
{
    $adminId = isset($_SESSION['user_id']) ? (int)$_SESSION['user_id'] : 0;
    $pdo->exec("SET @current_admin_id = {$adminId}");
}
 
/* ============================================================
   RESPONSE HELPERS
   ============================================================ */
 
function jsonResponse($data, $statusCode = 200)
{
    http_response_code($statusCode);
    echo json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
    exit;
}
 
function jsonError($statusCode, $message, $details = null)
{
    $response = ['error' => true, 'message' => $message];
    if ($details !== null) { $response['details'] = $details; }
    http_response_code($statusCode);
    echo json_encode($response, JSON_PRETTY_PRINT);
    exit;
}
 
function jsonSuccess($message = 'Success', $data = null)
{
    $response = ['success' => true, 'message' => $message];
    if ($data !== null) { $response['data'] = $data; }
    jsonResponse($response, 200);
}
 
function requireAuth()
{
    if (!isset($_SESSION['user_id'])) {
        jsonError(401, 'Unauthorized. Please log in.');
    }
}
 
function requireAdmin()
{
    requireAuth();
    $role = $_SESSION['user_role'] ?? '';
    if (!in_array($role, ['admin', 'super_admin'], true)) {
        jsonError(403, 'Forbidden. Admin access required.');
    }
}
 
function sanitizeString($value)
{
    return htmlspecialchars(strip_tags(trim((string)$value)), ENT_QUOTES, 'UTF-8');
}

function ensureAutoIncrementColumn(PDO $pdo, $table, $column)
{
    static $checked = [];
    $key = "{$table}.{$column}";
    if (isset($checked[$key])) {
        return;
    }
    $checked[$key] = true;

    try {
        $stmt = $pdo->prepare(
            "SELECT EXTRA FROM information_schema.columns " .
            "WHERE table_schema = DATABASE() " .
            "AND table_name = :table " .
            "AND column_name = :column"
        );
        $stmt->execute([':table' => $table, ':column' => $column]);
        $extra = $stmt->fetchColumn();

        if ($extra !== false && stripos($extra, 'auto_increment') === false) {
            $pdo->exec("ALTER TABLE {$table} MODIFY {$column} int(11) NOT NULL AUTO_INCREMENT");
        }
    } catch (PDOException $e) {
        // Ignore schema migration failures to keep the API available.
    }
}

function ensurePinCoordinates(PDO $pdo)
{
    static $checked = false;
    if ($checked) { return; }
    $checked = true;

    try {
        $stmt = $pdo->prepare(
            "SELECT column_name FROM information_schema.columns " .
            "WHERE table_schema = DATABASE() " .
            "AND table_name = 'pins' " .
            "AND column_name IN ('x', 'y')"
        );
        $stmt->execute();
        $columns = $stmt->fetchAll(PDO::FETCH_COLUMN);

        if (!in_array('x', $columns, true)) {
            $pdo->exec("ALTER TABLE pins ADD COLUMN x FLOAT NOT NULL DEFAULT 50");
        }
        if (!in_array('y', $columns, true)) {
            $pdo->exec("ALTER TABLE pins ADD COLUMN y FLOAT NOT NULL DEFAULT 50");
        }
    } catch (PDOException $e) {
        // Ignore schema migration failures to keep the API available.
    }
}

function ensureVisitorLogsTimeOut(PDO $pdo)
{
    static $checked = false;
    if ($checked) { return; }
    $checked = true;

    try {
        $stmt = $pdo->prepare(
            "SELECT COLUMN_NAME FROM information_schema.COLUMNS " .
            "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'visitor_logs' AND COLUMN_NAME = 'time_out'"
        );
        $stmt->execute();
        if (!$stmt->fetch()) {
            $pdo->exec("ALTER TABLE visitor_logs ADD COLUMN time_out TIME NULL DEFAULT NULL");
        }
    } catch (PDOException $e) {
        // Ignore schema migration failures to keep the API available.
    }
}

function ensureDatabaseSchema(PDO $pdo)
{
    ensurePinCoordinates($pdo);
    ensureAutoIncrementColumn($pdo, 'pins', 'pin_id');
    ensureAutoIncrementColumn($pdo, 'routes', 'route_id');
    ensureAutoIncrementColumn($pdo, 'route_points', 'id');
    ensureAutoIncrementColumn($pdo, 'visitor_logs', 'log_id');
    ensureVisitorLogsTimeOut($pdo);
}
 
/* ============================================================
   ROUTE DISPATCHER
   ============================================================ */
 
try {
    $pdo = getDatabase();
    ensureDatabaseSchema($pdo);
    dispatchRequest($pdo, $action, $action2, $resourceId, $method, $requestData);
} catch (PDOException $e) {
    jsonError(500, 'Database error: ' . $e->getMessage());
} catch (Exception $e) {
    jsonError(500, 'Server error: ' . $e->getMessage());
}
 
function dispatchRequest(PDO $pdo, $action, $action2, $resourceId, $method, $requestData)
{
    switch ($action) {
 
        /* -------------------------------------------------------
           AUTH
           ------------------------------------------------------- */
        case 'login':
            if ($method !== 'POST') { jsonError(405, 'Method Not Allowed'); }
            handleLogin($pdo, $requestData);
            break;
 
        case 'logout':
            handleLogout();
            break;
 
        case 'me':
            handleGetCurrentUser($pdo);
            break;
 
        /* -------------------------------------------------------
           ADMINS
           ------------------------------------------------------- */
        case 'admins':
        case 'admin':
            if ($method === 'GET')        { requireAdmin(); handleGetAdmins($pdo); }
            elseif ($method === 'POST')   { requireAdmin(); handleCreateAdminAccount($pdo, $requestData); }
            elseif ($method === 'PUT')    { requireAdmin(); handleUpdateAdminAccount($pdo, $resourceId, $requestData); }
            elseif ($method === 'DELETE') { requireAdmin(); handleDeleteAdminAccount($pdo, $resourceId); }
            else { jsonError(405, 'Method Not Allowed'); }
            break;

        /* -------------------------------------------------------
           FLOORS (maps table)
           ------------------------------------------------------- */
        case 'floors':
            if ($method === 'GET')    { handleGetFloors($pdo); }
            elseif ($method === 'POST' && $action2 === 'toggle') {
                requireAdmin();
                handleToggleFloor($pdo, $resourceId);
            }
            elseif ($method === 'POST')   { requireAdmin(); handleCreateFloor($pdo, $requestData); }
            elseif ($method === 'PUT')    { requireAdmin(); handleUpdateFloor($pdo, $resourceId, $requestData); }
            elseif ($method === 'DELETE') { requireAdmin(); handleDeleteFloor($pdo, $resourceId); }
            else { jsonError(405, 'Method Not Allowed'); }
            break;
 
        /* -------------------------------------------------------
           PINS
           ------------------------------------------------------- */
        case 'pins':
            if ($method === 'GET')        { handleGetPins($pdo); }
            elseif ($method === 'POST')   { requireAdmin(); handleCreatePin($pdo, $requestData); }
            elseif ($method === 'PUT')    { requireAdmin(); handleUpdatePin($pdo, $resourceId, $requestData); }
            elseif ($method === 'DELETE') { requireAdmin(); handleDeletePin($pdo, $resourceId); }
            else { jsonError(405, 'Method Not Allowed'); }
            break;
 
        /* -------------------------------------------------------
           ROUTES
           ------------------------------------------------------- */
        case 'routes':
            if ($method === 'GET')        { handleGetRoutes($pdo); }
            elseif ($method === 'POST')   { requireAdmin(); handleCreateRoute($pdo, $requestData); }
            elseif ($method === 'PUT')    { requireAdmin(); handleUpdateRoute($pdo, $resourceId, $requestData); }
            elseif ($method === 'DELETE') { requireAdmin(); handleDeleteRoute($pdo, $resourceId); }
            else { jsonError(405, 'Method Not Allowed'); }
            break;
 
        /* -------------------------------------------------------
           LEGEND CATEGORIES
           ------------------------------------------------------- */
        case 'legends':
            if ($method === 'GET')        { handleGetLegends($pdo); }
            elseif ($method === 'POST')   { requireAdmin(); handleCreateLegend($pdo, $requestData); }
            elseif ($method === 'PUT')    { requireAdmin(); handleUpdateLegend($pdo, $resourceId, $requestData); }
            elseif ($method === 'DELETE') { requireAdmin(); handleDeleteLegend($pdo, $resourceId); }
            else { jsonError(405, 'Method Not Allowed'); }
            break;
 
        /* -------------------------------------------------------
           VISITOR LOGS
           ------------------------------------------------------- */
        case 'visitor_logs':
            if ($method === 'GET')      { requireAdmin(); handleGetVisitorLogs($pdo); }
            elseif ($method === 'POST') { handleCreateVisitorLog($pdo, $requestData); }
            elseif ($method === 'PUT')  { handleUpdateVisitorLogTimeOut($pdo, $resourceId, $requestData); }
            else { jsonError(405, 'Method Not Allowed'); }
            break;
 
        /* -------------------------------------------------------
           AUDIT LOG
           ------------------------------------------------------- */
        case 'audit_log':
            if ($method === 'GET')        { requireAdmin(); handleGetAuditLog($pdo); }
            elseif ($method === 'POST')   { requireAuth();  handleCreateAuditLog($pdo, $requestData); }
            elseif ($method === 'DELETE') { requireAdmin(); handleDeleteAuditLog($pdo); }
            else { jsonError(405, 'Method Not Allowed'); }
            break;
 
        /* -------------------------------------------------------
           HEALTH CHECK
           ------------------------------------------------------- */
        case 'ping':
        case '':
            jsonResponse([
                'status'  => 'ok',
                'app'     => 'SchoolMap API',
                'version' => APP_VERSION,
                'db'      => DB_NAME,
                'time'    => date('Y-m-d H:i:s'),
            ]);
            break;
 
        default:
            jsonError(404, "Unknown action: {$action}");
    }
}
 
/* ============================================================
   AUTH HANDLERS
   ============================================================ */
 
function handleLogin(PDO $pdo, $data)
{
    $identifier = isset($data['identifier']) ? trim($data['identifier']) : '';
    $password   = isset($data['password'])   ? $data['password']        : '';
 
    if (!$identifier || !$password) {
        jsonError(400, 'Email/username and password are required.');
    }
 
    // Support login by email or by username (stored as email prefix)
    $stmt = $pdo->prepare("
        SELECT user_id, name, email, password, role, is_disabled
        FROM   admin
        WHERE  email = :id1 OR email = :id2
        LIMIT  1
    ");
    $stmt->execute([
        ':id1' => $identifier,
        ':id2' => $identifier . '@school.com',
    ]);
    $user = $stmt->fetch();
 
    if (!$user) {
        jsonError(401, 'Invalid email/username or password.');
    }
 
    // Support both plain text (legacy) and bcrypt hashed passwords
    $passwordValid = false;
    if (substr($user['password'], 0, 4) === '$2y$') {
        $passwordValid = password_verify($password, $user['password']);
    } else {
        // Legacy plain text — still works but should be updated
        $passwordValid = ($user['password'] === $password);
    }
 
    if (!$passwordValid) {
        jsonError(401, 'Invalid email/username or password.');
    }

    // Block disabled accounts from logging in
    if ((int)($user['is_disabled'] ?? 0) === 1) {
        jsonError(403, 'Your account has been disabled. Please contact the Super Admin.');
    }
 
    // Store session
    $_SESSION['user_id']   = $user['user_id'];
    $_SESSION['user_role'] = $user['role'];
    $_SESSION['user_name'] = $user['name'];
 
    jsonSuccess('Login successful', [
        'id'       => $user['user_id'],
        'fullName' => $user['name'],
        'email'    => $user['email'],
        'username' => explode('@', $user['email'])[0],
        'role'     => $user['role'],
    ]);
}
 
function handleLogout()
{
    $_SESSION = [];
    if (ini_get('session.use_cookies')) {
        $params = session_get_cookie_params();
        setcookie(session_name(), '', time() - 42000,
            $params['path'], $params['domain'],
            $params['secure'], $params['httponly']);
    }
    session_destroy();
    jsonSuccess('Logged out successfully.');
}
 
function handleGetCurrentUser(PDO $pdo)
{
    if (!isset($_SESSION['user_id'])) {
        jsonResponse(['user' => null]);
    }
 
    $stmt = $pdo->prepare("
        SELECT user_id, name, email, role
        FROM   admin
        WHERE  user_id = :id
    ");
    $stmt->execute([':id' => $_SESSION['user_id']]);
    $user = $stmt->fetch();
 
    if (!$user) {
        session_destroy();
        jsonResponse(['user' => null]);
    }
 
    jsonResponse(['user' => [
        'id'       => $user['user_id'],
        'fullName' => $user['name'],
        'email'    => $user['email'],
        'username' => explode('@', $user['email'])[0],
        'role'     => $user['role'],
    ]]);
}
 
/* ============================================================
   FLOORS HANDLERS (maps table)
   ============================================================ */
 
function handleGetFloors(PDO $pdo)
{
    $stmt = $pdo->query("
        SELECT map_id AS id, floor_name AS name, image_path, status
        FROM   maps
        ORDER  BY map_id ASC
    ");
    $floors = $stmt->fetchAll();
 
    // Give each floor a label like 1F, 2F, etc.
    foreach ($floors as $i => &$floor) {
        $floor['id']    = (int)$floor['id'];
        $floor['label'] = ($i + 1) . 'F';
    }
 
    jsonResponse(['floors' => $floors]);
}
 
function handleCreateFloor(PDO $pdo, $data)
{
    setAdminSession($pdo);
 
    $name      = sanitizeString($data['name']       ?? '');
    $imagePath = sanitizeString($data['image_path'] ?? 'maps/default.png');
 
    if (!$name) { jsonError(400, 'Floor name is required.'); }
 
    $stmt = $pdo->prepare("CALL sp_add_map(:name, :image_path)");
    $stmt->execute([':name' => $name, ':image_path' => $imagePath]);
    $result = $stmt->fetch();
 
    jsonSuccess('Floor added successfully.', [
        'id'         => (int)($result['new_map_id'] ?? 0),
        'name'       => $name,
        'image_path' => $imagePath,
        'status'     => 'active',
    ]);
}
 
function handleUpdateFloor(PDO $pdo, $id, $data)
{
    setAdminSession($pdo);
 
    if (!$id) { jsonError(400, 'Floor ID is required.'); }
 
    $name      = sanitizeString($data['name']       ?? '');
    $imagePath = sanitizeString($data['image_path'] ?? '');
 
    $stmt = $pdo->prepare("CALL sp_update_map(:id, :name, :image_path)");
    $stmt->execute([
        ':id'         => (int)$id,
        ':name'       => $name ?: null,
        ':image_path' => $imagePath ?: null,
    ]);
 
    jsonSuccess('Floor updated successfully.', ['id' => (int)$id]);
}
 
function handleToggleFloor(PDO $pdo, $id)
{
    setAdminSession($pdo);
 
    if (!$id) { jsonError(400, 'Floor ID is required.'); }
 
    $stmt = $pdo->prepare("CALL sp_toggle_map_status(:id)");
    $stmt->execute([':id' => (int)$id]);
    $result = $stmt->fetch();
 
    jsonSuccess($result['message'] ?? 'Status toggled.', [
        'id'        => (int)$id,
        'newStatus' => $result['new_status'] ?? 'unknown',
    ]);
}
 
function handleDeleteFloor(PDO $pdo, $id)
{
    setAdminSession($pdo);
 
    if (!$id) { jsonError(400, 'Floor ID is required.'); }
 
    try {
        $stmt = $pdo->prepare("CALL sp_delete_map(:id)");
        $stmt->execute([':id' => (int)$id]);
        jsonSuccess('Floor deleted successfully.');
    } catch (PDOException $e) {
        jsonError(400, 'Failed to delete floor: ' . $e->getMessage());
    }
}
 
/* ============================================================
   PINS HANDLERS
   ============================================================ */
 
function handleGetPins(PDO $pdo)
{
    ensurePinCoordinates($pdo);

    $stmt = $pdo->query("
        SELECT p.pin_id   AS id,
               p.map_id,
               p.name,
               p.description,
               p.category_id,
               p.x,
               p.y,
               p.image,
               lc.name    AS category_name,
               lc.color   AS category_color,
               lc.icon    AS category_icon,
               m.floor_name
        FROM   pins p
        LEFT JOIN legend_categories lc ON lc.category_id = p.category_id
        LEFT JOIN maps m               ON m.map_id        = p.map_id
        ORDER  BY p.map_id ASC, p.name ASC
    ");
    $pins = $stmt->fetchAll();
 
    foreach ($pins as &$pin) {
        $pin['id']          = (int)$pin['id'];
        $pin['map_id']      = (int)$pin['map_id'];
        $pin['category_id'] = $pin['category_id'] ? (int)$pin['category_id'] : null;
    }
 
    jsonResponse(['pins' => $pins]);
}
 
function handleCreatePin(PDO $pdo, $data)
{
    setAdminSession($pdo);
    ensurePinCoordinates($pdo);
 
    $mapId      = isset($data['map_id'])      ? (int)$data['map_id']             : 0;
    $name       = sanitizeString($data['name']        ?? '');
    $desc       = sanitizeString($data['description'] ?? '');
    $categoryId = isset($data['category_id']) ? (int)$data['category_id']        : null;
    $image      = sanitizeString($data['image']       ?? '');
    $x          = isset($data['x'])               ? (float)$data['x']                 : 50.0;
    $y          = isset($data['y'])               ? (float)$data['y']                 : 50.0;
 
    if (!$mapId) { jsonError(400, 'map_id is required.'); }
    if (!$name)  { jsonError(400, 'Pin name is required.'); }
 
    try {
        $stmt = $pdo->prepare("CALL sp_add_pin(:map_id, :name, :description, :category_id, :image, :x, :y)");
        $stmt->execute([
            ':map_id'      => $mapId,
            ':name'        => $name,
            ':description' => $desc ?: null,
            ':category_id' => $categoryId,
            ':image'       => $image ?: null,
            ':x'           => $x,
            ':y'           => $y,
        ]);
        $result = $stmt->fetch();
 
        $newPinId = (int)($result['new_pin_id'] ?? 0);
    } catch (PDOException $e) {
        try {
            $stmt = $pdo->prepare(
                "INSERT INTO pins (map_id, name, description, category_id, image, x, y) " .
                "VALUES (:map_id, :name, :description, :category_id, :image, :x, :y)"
            );
            $stmt->execute([
                ':map_id'      => $mapId,
                ':name'        => $name,
                ':description' => $desc ?: null,
                ':category_id' => $categoryId,
                ':image'       => $image ?: null,
                ':x'           => $x,
                ':y'           => $y,
            ]);
            $newPinId = (int)$pdo->lastInsertId();
        } catch (PDOException $inner) {
            jsonError(400, 'Failed to create pin: ' . $inner->getMessage());
        }
    }
 
    jsonSuccess('Pin created successfully.', [
        'id'          => $newPinId,
        'map_id'      => $mapId,
        'name'        => $name,
        'description' => $desc,
        'category_id' => $categoryId,
        'image'       => $image,
        'x'           => $x,
        'y'           => $y,
    ]);
}
 
function handleUpdatePin(PDO $pdo, $id, $data)
{
    setAdminSession($pdo);
    ensurePinCoordinates($pdo);
 
    if (!$id) { jsonError(400, 'Pin ID is required.'); }
 
    $name       = sanitizeString($data['name']        ?? '');
    $desc       = sanitizeString($data['description'] ?? '');
    $categoryId = isset($data['category_id']) ? (int)$data['category_id'] : null;
    $image      = sanitizeString($data['image']       ?? '');
    $x          = isset($data['x'])               ? (float)$data['x']                 : null;
    $y          = isset($data['y'])               ? (float)$data['y']                 : null;
 
    try {
        $stmt = $pdo->prepare("CALL sp_update_pin(:id, :name, :description, :category_id, :image, :x, :y)");
        $stmt->execute([
            ':id'          => (int)$id,
            ':name'        => $name ?: null,
            ':description' => $desc ?: null,
            ':category_id' => $categoryId,
            ':image'       => $image ?: null,
            ':x'           => $x,
            ':y'           => $y,
        ]);
    } catch (PDOException $e) {
        try {
            $stmt = $pdo->prepare(
                "UPDATE pins SET " .
                "name = IFNULL(:name, name), " .
                "description = IFNULL(:description, description), " .
                "category_id = IFNULL(:category_id, category_id), " .
                "image = IFNULL(:image, image), " .
                "x = IFNULL(:x, x), " .
                "y = IFNULL(:y, y) " .
                "WHERE pin_id = :id"
            );
            $stmt->execute([
                ':id'          => (int)$id,
                ':name'        => $name ?: null,
                ':description' => $desc ?: null,
                ':category_id' => $categoryId,
                ':image'       => $image ?: null,
                ':x'           => $x,
                ':y'           => $y,
            ]);
        } catch (PDOException $inner) {
            jsonError(400, 'Failed to update pin: ' . $inner->getMessage());
        }
    }
 
    jsonSuccess('Pin updated successfully.', ['id' => (int)$id]);
}
 
function handleDeletePin(PDO $pdo, $id)
{
    setAdminSession($pdo);
 
    if (!$id) { jsonError(400, 'Pin ID is required.'); }
 
    try {
        $stmt = $pdo->prepare("CALL sp_delete_pin(:id)");
        $stmt->execute([':id' => (int)$id]);
        jsonSuccess('Pin deleted successfully.');
    } catch (PDOException $e) {
        jsonError(400, 'Failed to delete pin: ' . $e->getMessage());
    }
}
 
/* ============================================================
   ROUTES HANDLERS
   ============================================================ */
 
function handleGetRoutes(PDO $pdo)
{
    $stmt = $pdo->query("
        SELECT r.route_id   AS id,
               r.from_pin_id AS originId,
               r.to_pin_id   AS destinationId,
               r.direction,
               fp.name      AS from_pin_name,
               tp.name      AS to_pin_name,
               fp.map_id    AS floor
        FROM   routes r
        LEFT JOIN pins fp ON fp.pin_id = r.from_pin_id
        LEFT JOIN pins tp ON tp.pin_id = r.to_pin_id
        ORDER  BY r.route_id ASC
    ");
    $routes = $stmt->fetchAll();
 
    foreach ($routes as &$route) {
        $route['id']          = (int)$route['id'];
        $route['from_pin_id'] = (int)$route['from_pin_id'];
        $route['to_pin_id']   = (int)$route['to_pin_id'];
        $route['floor']       = (int)$route['floor'];
 
        // Fetch route points
        $rpStmt = $pdo->prepare("
            SELECT x, y, point_order
            FROM   route_points
            WHERE  route_id = :id
            ORDER  BY point_order ASC
        ");
        $rpStmt->execute([':id' => $route['id']]);
        $route['points'] = $rpStmt->fetchAll();
    }
 
    jsonResponse(['routes' => $routes]);
}
 
function resolvePinId(PDO $pdo, $pinIdRaw)
{
    // If it's already a numeric ID, return it directly
    if (is_numeric($pinIdRaw) && (int)$pinIdRaw > 0) {
        return (int)$pinIdRaw;
    }
 
    // If it's a string like "loc-xxx" or a pin name, try to find by name
    if (is_string($pinIdRaw) && $pinIdRaw !== '') {
        $stmt = $pdo->prepare("SELECT pin_id FROM pins WHERE name = :name LIMIT 1");
        $stmt->execute([':name' => $pinIdRaw]);
        $row = $stmt->fetch();
        if ($row) { return (int)$row['pin_id']; }
    }
 
    return null;
}
 
function handleCreateRoute(PDO $pdo, $data)
{
    setAdminSession($pdo);
 
    // Accept both from_pin_id/to_pin_id (API format) and originId/destinationId (JS format)
    $originRaw      = $data['originId']      ?? $data['from_pin_id']  ?? null;
    $destRaw        = $data['destinationId'] ?? $data['to_pin_id']    ?? null;
    $originName     = sanitizeString($data['origin']      ?? '');
    $destName       = sanitizeString($data['destination'] ?? '');
    $direction      = sanitizeString($data['direction']   ?? ($originName && $destName ? "{$originName} to {$destName}" : 'Go straight'));
    $points         = isset($data['points']) && is_array($data['points']) ? $data['points'] : [];
 
    // Resolve pin IDs — try by ID first, then by name
    $fromPinId = resolvePinId($pdo, $originRaw);
    if (!$fromPinId && $originName) {
        $fromPinId = resolvePinId($pdo, $originName);
    }
 
    $toPinId = resolvePinId($pdo, $destRaw);
    if (!$toPinId && $destName) {
        $toPinId = resolvePinId($pdo, $destName);
    }
 
    if (!$fromPinId) { jsonError(400, 'Origin pin not found. Make sure the pin exists in the database.'); }
    if (!$toPinId)   { jsonError(400, 'Destination pin not found. Make sure the pin exists in the database.'); }
 
    try {
        $pdo->beginTransaction();
 
        $stmt = $pdo->prepare("CALL sp_add_route(:from_pin_id, :to_pin_id, :direction)");
        $stmt->execute([
            ':from_pin_id' => $fromPinId,
            ':to_pin_id'   => $toPinId,
            ':direction'   => $direction,
        ]);
        $result  = $stmt->fetch();
        $routeId = (int)($result['new_route_id'] ?? 0);
        $stmt->closeCursor();
 
        // Insert route points if provided
        if ($routeId && !empty($points)) {
            $rpStmt = $pdo->prepare("CALL sp_add_route_points(:route_id, :point_order, :x, :y)");
            foreach ($points as $i => $point) {
                $rpStmt->execute([
                    ':route_id'    => $routeId,
                    ':point_order' => (int)($point['point_order'] ?? $i + 1),
                    ':x'           => (float)($point['x'] ?? 0),
                    ':y'           => (float)($point['y'] ?? 0),
                ]);
                $rpStmt->closeCursor();
            }
        }
 
        $pdo->commit();
 
        jsonSuccess('Route created successfully.', [
            'route' => [
                'id'            => $routeId,
                'name'          => sanitizeString($data['name'] ?? ''),
                'from_pin_id'   => $fromPinId,
                'to_pin_id'     => $toPinId,
                'originId'      => $fromPinId,
                'destinationId' => $toPinId,
                'origin'        => $originName,
                'destination'   => $destName,
                'direction'     => $direction,
                'floor'         => (int)($data['floor'] ?? 1),
                'archived'      => false,
                'points'        => $points,
            ]
        ]);
    } catch (PDOException $e) {
        $pdo->rollBack();
        jsonError(400, 'Failed to create route: ' . $e->getMessage());
    }
}
 
function handleUpdateRoute(PDO $pdo, $id, $data)
{
    setAdminSession($pdo);
 
    if (!$id) { jsonError(400, 'Route ID is required.'); }
 
    $originRaw  = $data['originId']      ?? $data['from_pin_id']  ?? null;
    $destRaw    = $data['destinationId'] ?? $data['to_pin_id']    ?? null;
    $originName = sanitizeString($data['origin']      ?? '');
    $destName   = sanitizeString($data['destination'] ?? '');
    $direction  = sanitizeString($data['direction']   ?? '');
    $points     = isset($data['points']) && is_array($data['points']) ? $data['points'] : [];
 
    $fromPinId = resolvePinId($pdo, $originRaw);
    if (!$fromPinId && $originName) {
        $fromPinId = resolvePinId($pdo, $originName);
    }
 
    $toPinId = resolvePinId($pdo, $destRaw);
    if (!$toPinId && $destName) {
        $toPinId = resolvePinId($pdo, $destName);
    }
 
    try {
        $pdo->beginTransaction();
 
        $stmt = $pdo->prepare("CALL sp_update_route(:id, :from_pin_id, :to_pin_id, :direction)");
        $stmt->execute([
            ':id'          => (int)$id,
            ':from_pin_id' => $fromPinId,
            ':to_pin_id'   => $toPinId,
            ':direction'   => $direction ?: null,
        ]);
        $stmt->closeCursor();
 
        // Replace route points
        $del = $pdo->prepare("DELETE FROM route_points WHERE route_id = :id");
        $del->execute([':id' => (int)$id]);
 
        if (!empty($points)) {
            $rpStmt = $pdo->prepare("CALL sp_add_route_points(:route_id, :point_order, :x, :y)");
            foreach ($points as $i => $point) {
                $rpStmt->execute([
                    ':route_id'    => (int)$id,
                    ':point_order' => (int)($point['point_order'] ?? $i + 1),
                    ':x'           => (float)($point['x'] ?? 0),
                    ':y'           => (float)($point['y'] ?? 0),
                ]);
                $rpStmt->closeCursor();
            }
        }
 
        $pdo->commit();
 
        jsonSuccess('Route updated successfully.', [
            'route' => [
                'id'            => (int)$id,
                'name'          => sanitizeString($data['name'] ?? ''),
                'from_pin_id'   => $fromPinId,
                'to_pin_id'     => $toPinId,
                'originId'      => $fromPinId,
                'destinationId' => $toPinId,
                'origin'        => $originName,
                'destination'   => $destName,
                'direction'     => $direction,
                'floor'         => (int)($data['floor'] ?? 1),
                'archived'      => (bool)($data['archived'] ?? false),
                'points'        => $points,
            ]
        ]);
    } catch (PDOException $e) {
        $pdo->rollBack();
        jsonError(400, 'Failed to update route: ' . $e->getMessage());
    }
}
 
function handleDeleteRoute(PDO $pdo, $id)
{
    setAdminSession($pdo);
 
    if (!$id) { jsonError(400, 'Route ID is required.'); }
 
    try {
        $stmt = $pdo->prepare("CALL sp_delete_route(:id)");
        $stmt->execute([':id' => (int)$id]);
        jsonSuccess('Route deleted successfully.');
    } catch (PDOException $e) {
        jsonError(400, 'Failed to delete route: ' . $e->getMessage());
    }
}
 
/* ============================================================
   LEGEND CATEGORIES HANDLERS
   ============================================================ */
 
function handleGetLegends(PDO $pdo)
{
    $stmt = $pdo->query("
        SELECT category_id AS id,
               name,
               color,
               icon
        FROM   legend_categories
        ORDER  BY category_id ASC
    ");
    $legends = $stmt->fetchAll();
 
    foreach ($legends as &$leg) {
        $leg['id']   = (int)$leg['id'];
        $leg['type'] = strtolower(str_replace([' ', '/'], ['_', '_'], $leg['name']));
    }
 
    jsonResponse(['legends' => $legends]);
}
 
function handleCreateLegend(PDO $pdo, $data)
{
    setAdminSession($pdo);
 
    $name  = sanitizeString($data['name']  ?? '');
    $color = sanitizeString($data['color'] ?? '#000000');
    $icon  = sanitizeString($data['icon']  ?? '');
 
    if (!$name)  { jsonError(400, 'Legend name is required.'); }
    if (!preg_match('/^#[0-9a-fA-F]{3,8}$/', $color)) {
        jsonError(400, 'Invalid color format. Must be a hex color (e.g. #3498DB).');
    }
 
    $stmt = $pdo->prepare("CALL sp_add_legend_category(:name, :color, :icon)");
    $stmt->execute([
        ':name'  => $name,
        ':color' => $color,
        ':icon'  => $icon ?: null,
    ]);
    $result = $stmt->fetch();
 
    jsonSuccess('Legend category added successfully.', [
        'id'    => (int)($result['new_category_id'] ?? 0),
        'name'  => $name,
        'color' => $color,
        'icon'  => $icon,
    ]);
}
 
function handleUpdateLegend(PDO $pdo, $id, $data)
{
    setAdminSession($pdo);
 
    if (!$id) { jsonError(400, 'Legend ID is required.'); }
 
    $name  = sanitizeString($data['name']  ?? '');
    $color = sanitizeString($data['color'] ?? '');
    $icon  = sanitizeString($data['icon']  ?? '');
 
    if ($color && !preg_match('/^#[0-9a-fA-F]{3,8}$/', $color)) {
        jsonError(400, 'Invalid color format. Must be a hex color.');
    }
 
    $stmt = $pdo->prepare("CALL sp_update_legend_category(:id, :name, :color, :icon)");
    $stmt->execute([
        ':id'    => (int)$id,
        ':name'  => $name  ?: null,
        ':color' => $color ?: null,
        ':icon'  => $icon  ?: null,
    ]);
 
    jsonSuccess('Legend updated successfully.', ['id' => (int)$id]);
}
 
function handleDeleteLegend(PDO $pdo, $id)
{
    setAdminSession($pdo);
 
    if (!$id) { jsonError(400, 'Legend ID is required.'); }
 
    try {
        $stmt = $pdo->prepare("CALL sp_delete_legend_category(:id)");
        $stmt->execute([':id' => (int)$id]);
        jsonSuccess('Legend deleted successfully.');
    } catch (PDOException $e) {
        jsonError(400, 'Failed to delete legend: ' . $e->getMessage());
    }
}
 
/* ============================================================
   VISITOR LOGS HANDLERS
   ============================================================ */
 
function handleGetVisitorLogs(PDO $pdo)
{
    ensureVisitorLogsTimeOut($pdo);
    $stmt = $pdo->query("
        SELECT log_id, name, purpose, destination,
               category, time_in, time_out, date, plate_no
        FROM   visitor_logs
        ORDER  BY date DESC, time_in DESC
    ");
    $logs = $stmt->fetchAll();

    foreach ($logs as &$log) {
        $log['log_id'] = (int)$log['log_id'];
    }

    jsonResponse(['visitor_logs' => $logs]);
}

function handleUpdateVisitorLogTimeOut(PDO $pdo, $logId, $data)
{
    if (!$logId) { jsonError(400, 'Log ID is required.'); }
    ensureVisitorLogsTimeOut($pdo);

    $timeOut = sanitizeString($data['time_out'] ?? date('H:i:s'));

    try {
        $stmt = $pdo->prepare(
            "UPDATE visitor_logs SET time_out = :time_out WHERE log_id = :log_id"
        );
        $stmt->execute([':time_out' => $timeOut, ':log_id' => (int)$logId]);
        jsonSuccess('Visitor log updated with time_out.', ['log_id' => (int)$logId]);
    } catch (PDOException $e) {
        jsonError(400, 'Failed to update visitor log: ' . $e->getMessage());
    }
}
 
function handleCreateVisitorLog(PDO $pdo, $data)
{
    $name        = sanitizeString($data['name']        ?? '');
    $purpose     = sanitizeString($data['purpose']     ?? '');
    $destination = sanitizeString($data['destination'] ?? '');
    $category    = sanitizeString($data['category']    ?? 'general');
    $timeIn      = sanitizeString($data['time_in']     ?? date('H:i:s'));
    $date        = sanitizeString($data['date']        ?? date('Y-m-d'));
    $plateNo     = sanitizeString($data['plate_no']    ?? '');
 
    if (!$name)        { jsonError(400, 'Visitor name is required.'); }
    if (!$purpose)     { jsonError(400, 'Purpose is required.'); }
    if (!$destination) { jsonError(400, 'Destination is required.'); }
 
    try {
        $stmt = $pdo->prepare(
            "INSERT INTO visitor_logs (name, purpose, destination, category, time_in, date, plate_no) VALUES (:name, :purpose, :destination, :category, :time_in, :date, :plate_no)"
        );
        $stmt->execute([
            ':name'        => $name,
            ':purpose'     => $purpose,
            ':destination' => $destination,
            ':category'    => $category,
            ':time_in'     => $timeIn,
            ':date'        => $date,
            ':plate_no'    => $plateNo ?: null,
        ]);
 
        jsonSuccess('Visitor log added successfully.', [
            'log_id' => (int)$pdo->lastInsertId(),
        ]);
    } catch (PDOException $e) {
        jsonError(400, 'Failed to add visitor log: ' . $e->getMessage());
    }
}
 
/* ============================================================
   ADMINS HANDLERS
   ============================================================ */

function handleGetAdmins(PDO $pdo)
{
    $stmt = $pdo->query("
        SELECT user_id AS id, name AS fullName, email, role,
               is_disabled AS isDisabled, created_at
        FROM   admin
        ORDER  BY user_id ASC
    ");
    $admins = $stmt->fetchAll();

    foreach ($admins as &$admin) {
        $admin['id']         = (int)$admin['id'];
        $admin['username']   = explode('@', $admin['email'])[0];
        $admin['isDisabled'] = (bool)$admin['isDisabled'];
    }

    jsonResponse(['success' => true, 'data' => ['admins' => $admins]]);
}

function handleCreateAdminAccount(PDO $pdo, $data)
{
    setAdminSession($pdo);

    $name     = sanitizeString($data['fullName'] ?? $data['name'] ?? '');
    $email    = sanitizeString($data['email']    ?? '');
    $password = $data['password'] ?? '';
    $role     = sanitizeString($data['role']     ?? 'admin');

    if (!$name)     { jsonError(400, 'Name is required.'); }
    if (!$email)    { jsonError(400, 'Email is required.'); }
    if (!$password) { jsonError(400, 'Password is required.'); }
    if (strlen($password) < 6) { jsonError(400, 'Password must be at least 6 characters.'); }

    // Hash the password before storing
    $hashedPassword = password_hash($password, PASSWORD_BCRYPT);

    try {
        $stmt = $pdo->prepare("CALL sp_register_admin(:name, :email, :password, :role)");
        $stmt->execute([
            ':name'     => $name,
            ':email'    => $email,
            ':password' => $hashedPassword,
            ':role'     => $role,
        ]);
        $result = $stmt->fetch();

        jsonSuccess('Admin created successfully.', [
            'admin' => [
                'id'         => (int)($result['new_admin_id'] ?? 0),
                'fullName'   => $name,
                'email'      => $email,
                'username'   => explode('@', $email)[0],
                'role'       => $role,
                'isDisabled' => false,
            ]
        ]);

        // Audit log
        $stmt = $pdo->prepare("
            INSERT INTO audit_log (user_id, action, description, timestamp)
            VALUES (:user_id, 'CREATE', :description, NOW())
        ");
        $stmt->execute([
            ':user_id' => $_SESSION['user_id'] ?? null,
            ':description' => 'Created new admin account: ' . $name . ' (' . $email . ')',
        ]);
    } catch (PDOException $e) {
        if (strpos($e->getMessage(), 'already exists') !== false ||
            strpos($e->getMessage(), 'Duplicate') !== false) {
            jsonError(409, 'Email already exists.');
        }
        jsonError(400, 'Failed to create admin: ' . $e->getMessage());
    }
}

function handleUpdateAdminAccount(PDO $pdo, $id, $data)
{
    setAdminSession($pdo);

    if (!$id) { jsonError(400, 'Admin ID is required.'); }

    $name       = sanitizeString($data['fullName'] ?? $data['name'] ?? '');
    $role       = sanitizeString($data['role']     ?? '');
    $isDisabled = isset($data['isDisabled']) ? (int)(bool)$data['isDisabled'] : null;

    if ($name || $role || $isDisabled !== null) {
        $stmt = $pdo->prepare("
            UPDATE admin
            SET    name        = COALESCE(NULLIF(:name, ''), name),
                   role        = COALESCE(NULLIF(:role, ''), role),
                   is_disabled = CASE WHEN :disabled_set = 1
                                 THEN :is_disabled
                                 ELSE is_disabled END
            WHERE  user_id = :id
        ");
        $stmt->execute([
            ':name'         => $name,
            ':role'         => $role,
            ':disabled_set' => $isDisabled !== null ? 1 : 0,
            ':is_disabled'  => $isDisabled ?? 0,
            ':id'           => (int)$id,
        ]);
    }

    // If password reset is requested
    if (!empty($data['password'])) {
        $hashed = password_hash($data['password'], PASSWORD_BCRYPT);
        $stmt = $pdo->prepare("UPDATE admin SET password = :password WHERE user_id = :id");
        $stmt->execute([':password' => $hashed, ':id' => (int)$id]);
    }

    jsonSuccess('Admin updated successfully.', ['id' => (int)$id]);

    // Audit log
    $description = 'Updated admin account ID: ' . $id;
    if ($name) $description .= ' - Name: ' . $name;
    if ($role) $description .= ' - Role: ' . $role;
    if (!empty($data['password'])) $description .= ' - Password reset';

    $stmt = $pdo->prepare("
        INSERT INTO audit_log (user_id, action, description, timestamp)
        VALUES (:user_id, 'UPDATE', :description, NOW())
    ");
    $stmt->execute([
        ':user_id' => $_SESSION['user_id'] ?? null,
        ':description' => $description,
    ]);
}

function handleDeleteAdminAccount(PDO $pdo, $id)
{
    setAdminSession($pdo);

    if (!$id) { jsonError(400, 'Admin ID is required.'); }

    // Prevent deleting yourself
    if ((int)$id === (int)($_SESSION['user_id'] ?? 0)) {
        jsonError(400, 'You cannot delete your own account.');
    }

    // Get admin details for audit log
    $stmt = $pdo->prepare("SELECT name, email FROM admin WHERE user_id = :id");
    $stmt->execute([':id' => (int)$id]);
    $admin = $stmt->fetch();

    $stmt = $pdo->prepare("DELETE FROM admin WHERE user_id = :id");
    $stmt->execute([':id' => (int)$id]);
    $deletedRows = $stmt->rowCount();

    if ($deletedRows === 0) {
        jsonError(404, 'Admin not found or already deleted.');
    }

    // Audit log
    if ($admin) {
        $stmt = $pdo->prepare("
            INSERT INTO audit_log (user_id, action, description, timestamp)
            VALUES (:user_id, 'DELETE', :description, NOW())
        ");
        $stmt->execute([
            ':user_id' => $_SESSION['user_id'] ?? null,
            ':description' => 'Deleted admin account: ' . $admin['name'] . ' (' . $admin['email'] . ')',
        ]);
    }

    jsonSuccess('Admin deleted successfully.', ['deleted_id' => (int)$id, 'deleted_rows' => $deletedRows]);
}

function handleCreateAuditLog(PDO $pdo, $data)
{
    setAdminSession($pdo);

    $action      = sanitizeString($data['action']      ?? 'ACTION');
    $description = sanitizeString($data['description'] ?? '');

    $stmt = $pdo->prepare("
        INSERT INTO audit_log (user_id, action, description, timestamp)
        VALUES (:user_id, :action, :description, NOW())
    ");
    $stmt->execute([
        ':user_id'     => $_SESSION['user_id'] ?? null,
        ':action'      => strtoupper($action),
        ':description' => $description,
    ]);

    jsonSuccess('Log recorded.');
}

/* ============================================================
   AUDIT LOG HANDLER
   ============================================================ */
 
function handleGetAuditLog(PDO $pdo)
{
    $stmt = $pdo->query("
        SELECT al.audit_id,
               al.user_id,
               a.name      AS admin_name,
               al.action,
               al.description,
               al.timestamp
        FROM   audit_log al
        LEFT JOIN admin a ON a.user_id = al.user_id
        ORDER  BY al.timestamp DESC
        LIMIT  200
    ");
    $logs = $stmt->fetchAll();
 
    foreach ($logs as &$log) {
        $log['audit_id'] = (int)$log['audit_id'];
        $log['user_id']  = (int)$log['user_id'];
    }
 
    jsonResponse(['audit_log' => $logs]);
}

function handleDeleteAuditLog(PDO $pdo)
{
    try {
        $pdo->exec("DELETE FROM audit_log");
        jsonSuccess('Audit log cleared.');
    } catch (PDOException $e) {
        jsonError(400, 'Failed to clear audit log: ' . $e->getMessage());
    }
}