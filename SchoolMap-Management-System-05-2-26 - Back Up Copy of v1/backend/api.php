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
define('DB_HOST',    'localhost');
define('DB_NAME',    'school_map_db2');
define('DB_USER',    'root');
define('DB_PASS',    '');
define('DB_CHARSET', 'utf8mb4');
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
 
function jsonResponse(array $data, int $statusCode = 200)
{
    http_response_code($statusCode);
    echo json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
    exit;
}
 
function jsonError(int $statusCode, string $message, ?array $details = null)
{
    $response = ['error' => true, 'message' => $message];
    if ($details !== null) { $response['details'] = $details; }
    http_response_code($statusCode);
    echo json_encode($response, JSON_PRETTY_PRINT);
    exit;
}
 
function jsonSuccess(string $message = 'Success', ?array $data = null)
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
 
function sanitizeString(string $value)
{
    return htmlspecialchars(strip_tags(trim((string)$value)), ENT_QUOTES, 'UTF-8');
}

function recordAuditLog(PDO $pdo, string $action, string $description, ?int $userId = null)
{
    $stmt = $pdo->prepare("
        INSERT INTO audit_log (user_id, action, description, timestamp)
        VALUES (:user_id, :action, :description, NOW())
    ");
    $stmt->execute([
        ':user_id' => $userId ?? ($_SESSION['user_id'] ?? 0),
        ':action' => strtoupper($action),
        ':description' => $description,
    ]);
}

function archiveDeletedItem(PDO $pdo, string $type, string $label, array $data)
{
    $payload = [
        'archive'    => true,
        'type'       => $type,
        'label'      => $label,
        'data'       => $data,
        'deleted_at' => date('Y-m-d H:i:s'),
        'deleted_by' => $_SESSION['user_name'] ?? 'Admin',
    ];

    recordAuditLog($pdo, 'ARCHIVE_ITEM', json_encode($payload, JSON_UNESCAPED_UNICODE));
}

function routeArchiveData(PDO $pdo, int $routeId)
{
    $stmt = $pdo->prepare("
        SELECT r.route_id AS id,
               r.route_name AS name,
               r.from_pin_id,
               r.to_pin_id,
               r.destination,
               r.direction,
               fp.name AS from_pin_name,
               tp.name AS to_pin_name
        FROM routes r
        LEFT JOIN pins fp ON fp.pin_id = r.from_pin_id
        LEFT JOIN pins tp ON tp.pin_id = r.to_pin_id
        WHERE r.route_id = :id
        LIMIT 1
    ");
    $stmt->execute([':id' => $routeId]);
    $route = $stmt->fetch();
    if (!$route) { return null; }

    $pointStmt = $pdo->prepare("
        SELECT id, route_id, point_order, x, y, floor
        FROM route_points
        WHERE route_id = :id
        ORDER BY point_order ASC
    ");
    $pointStmt->execute([':id' => $routeId]);
    $route['points'] = $pointStmt->fetchAll();

    return $route;
}

function saveBase64Image(string $base64Data)
{
    if (empty($base64Data) || !preg_match('/^data:image\/(png|jpeg|jpg|gif|webp);base64,/i', $base64Data)) {
        return '';
    }
    
    $uploadsDir = __DIR__ . '/../uploads/pins/';
    if (!is_dir($uploadsDir)) {
        @mkdir($uploadsDir, 0755, true);
    }
    
    if (!is_writable($uploadsDir)) {
        return '';
    }
    
    try {
        $parts = explode(',', $base64Data, 2);
        if (count($parts) !== 2) return '';
        
        $mimeMatch = [];
        if (!preg_match('/data:image\/([a-z]+);/i', $parts[0], $mimeMatch)) return '';
        
        $ext = strtolower($mimeMatch[1]);
        if (!in_array($ext, ['png', 'jpeg', 'jpg', 'gif', 'webp'], true)) return '';
        
        if ($ext === 'jpg') $ext = 'jpeg';
        
        $decoded = base64_decode($parts[1], true);
        if ($decoded === false) return '';
        
        $filename = 'pin_' . uniqid() . '_' . time() . '.' . ($ext === 'jpeg' ? 'jpg' : $ext);
        $filepath = $uploadsDir . $filename;
        
        if (file_put_contents($filepath, $decoded) === false) return '';
        
        @chmod($filepath, 0644);
        
        return '../uploads/pins/' . $filename;
    } catch (Exception $e) {
        return '';
    }
}

function ensureAutoIncrementColumn(PDO $pdo, string $table, string $column)
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
            "AND column_name IN ('x', 'y', 'image')"
        );
        $stmt->execute();
        $columns = $stmt->fetchAll(PDO::FETCH_COLUMN);

        if (!in_array('x', $columns, true)) {
            $pdo->exec("ALTER TABLE pins ADD COLUMN x FLOAT NOT NULL DEFAULT 50");
        }
        if (!in_array('y', $columns, true)) {
            $pdo->exec("ALTER TABLE pins ADD COLUMN y FLOAT NOT NULL DEFAULT 50");
        }
        if (!in_array('image', $columns, true)) {
            $pdo->exec("ALTER TABLE pins ADD COLUMN image MEDIUMTEXT NULL AFTER category_id");
        }
    } catch (PDOException $e) {
        // Ignore schema migration failures to keep the API available.
    }
}

function ensureRouteNameColumn(PDO $pdo)
{
    static $checked = false;
    if ($checked) { return; }
    $checked = true;

    try {
        $stmt = $pdo->prepare(
            "SELECT column_name FROM information_schema.columns " .
            "WHERE table_schema = DATABASE() " .
            "AND table_name = 'routes' " .
            "AND column_name = 'route_name'"
        );
        $stmt->execute();

        if (!$stmt->fetchColumn()) {
            $pdo->exec("ALTER TABLE routes ADD COLUMN route_name VARCHAR(150) NULL AFTER route_id");
        }
    } catch (PDOException $e) {
        // Ignore schema migration failures to keep the API available.
    }
}

function ensureRouteDestinationColumn(PDO $pdo)
{
    static $checked = false;
    if ($checked) { return; }
    $checked = true;

    try {
        $stmt = $pdo->prepare(
            "SELECT column_name FROM information_schema.columns " .
            "WHERE table_schema = DATABASE() " .
            "AND table_name = 'routes' " .
            "AND column_name = 'destination'"
        );
        $stmt->execute();

        if (!$stmt->fetchColumn()) {
            $pdo->exec("ALTER TABLE routes ADD COLUMN destination VARCHAR(255) NOT NULL DEFAULT '' AFTER to_pin_id");
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

function ensureAdminDisabledColumn(PDO $pdo)
{
    static $checked = false;
    if ($checked) { return; }
    $checked = true;

    try {
        $stmt = $pdo->prepare(
            "SELECT COLUMN_NAME FROM information_schema.COLUMNS " .
            "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'admin' AND COLUMN_NAME = 'is_disabled'"
        );
        $stmt->execute();
        if (!$stmt->fetch()) {
            $pdo->exec("ALTER TABLE admin ADD COLUMN is_disabled TINYINT(1) NOT NULL DEFAULT 0");
        }
    } catch (PDOException $e) {
        // Ignore schema migration failures to keep the API available.
    }
}

function saveBase64FloorImage(string $base64Data)
{
    if (
        empty($base64Data) ||
        !preg_match('/^data:image\/(png|jpeg|jpg|gif|webp|svg\+xml);base64,/i', $base64Data, $matches)
    ) {
        return '';
    }

    try {
        $uploadsDir = __DIR__ . '/../uploads/floors/';
        if (!is_dir($uploadsDir)) {
            mkdir($uploadsDir, 0777, true);
        }

        $parts = explode(',', $base64Data, 2);
        if (count($parts) !== 2) {
            return '';
        }

        $ext = strtolower($matches[1]);
        if ($ext === 'jpg' || $ext === 'jpeg') {
            $ext = 'jpg';
        } elseif ($ext === 'svg+xml') {
            $ext = 'svg';
        }

        $decoded = base64_decode($parts[1], true);
        if ($decoded === false) {
            return '';
        }

        $filename = 'floor_' . uniqid() . '_' . time() . '.' . $ext;
        $filepath = $uploadsDir . $filename;

        if (file_put_contents($filepath, $decoded) === false) {
            return '';
        }

        @chmod($filepath, 0644);

        return '../uploads/floors/' . $filename;
    } catch (Exception $e) {
        return '';
    }
}

function ensureRoutePointFloorColumn(PDO $pdo)
{
    static $checked = false;
    if ($checked) { return; }
    $checked = true;

    try {
        $stmt = $pdo->prepare(
            "SELECT COLUMN_NAME FROM information_schema.COLUMNS " .
            "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'route_points' AND COLUMN_NAME = 'floor'"
        );
        $stmt->execute();
        if (!$stmt->fetch()) {
            $pdo->exec("ALTER TABLE route_points ADD COLUMN floor INT NULL AFTER y");
        }
    } catch (PDOException $e) {
        // Ignore schema migration failures to keep the API available.
    }
}

function ensureLegendIconColumn(PDO $pdo)
{
    static $checked = false;
    if ($checked) { return; }
    $checked = true;

    try {
        $stmt = $pdo->prepare(
            "SELECT DATA_TYPE FROM information_schema.COLUMNS " .
            "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'legend_categories' AND COLUMN_NAME = 'icon'"
        );
        $stmt->execute();
        $dataType = strtolower((string)$stmt->fetchColumn());

        if ($dataType && !in_array($dataType, ['text', 'mediumtext', 'longtext'], true)) {
            $pdo->exec("ALTER TABLE legend_categories MODIFY icon MEDIUMTEXT NULL");
        }
    } catch (PDOException $e) {
        // Ignore schema migration failures to keep the API available.
    }
}

function ensureDatabaseSchema(PDO $pdo)
{
    ensurePinCoordinates($pdo);
    ensureRouteNameColumn($pdo);
    ensureRouteDestinationColumn($pdo);
    ensureRoutePointFloorColumn($pdo);
    ensureAdminDisabledColumn($pdo);
    ensureLegendIconColumn($pdo);
    ensureAutoIncrementColumn($pdo, 'maps', 'map_id');
    ensureAutoIncrementColumn($pdo, 'legend_categories', 'category_id');
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
 
function dispatchRequest(PDO $pdo, string $action, string $action2, string $resourceId, string $method, array $requestData)
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
            handleLogout($pdo);
            break;
 
        case 'me':
            handleGetCurrentUser($pdo);
            break;

        case 'verify_otp':
            if ($method !== 'POST') { jsonError(405, 'Method Not Allowed'); }
            handleVerifyOtp($pdo, $requestData);
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

        case 'archive_items':
            if ($method === 'GET')      { requireAdmin(); handleGetArchiveItems($pdo); }
            elseif ($method === 'POST') { requireAdmin(); handleRestoreArchiveItem($pdo, $requestData); }
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
 
function handleLogin(PDO $pdo, array $data)
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

    // ✅ If super_admin, don't set session yet — require OTP first
    if ($user['role'] === 'super_admin') {
        jsonResponse(['success' => false, 'requires_otp' => true]);
    }

 
    // Store session
    $_SESSION['user_id']   = $user['user_id'];
    $_SESSION['user_role'] = $user['role'];
    $_SESSION['user_name'] = $user['name'];

    if (in_array($user['role'], ['admin', 'super_admin'], true)) {
        recordAuditLog($pdo, 'LOGIN', 'Logged in: ' . $user['name'] . ' (' . $user['email'] . ')', (int)$user['user_id']);
    }
 
    jsonSuccess('Login successful', [
        'id'       => $user['user_id'],
        'fullName' => $user['name'],
        'email'    => $user['email'],
        'username' => explode('@', $user['email'])[0],
        'role'     => $user['role'],
    ]);
}

function handleVerifyOtp(PDO $pdo, array $data)
{   date_default_timezone_set('Asia/Manila'); //force timezone

    require_once 'C:\xampp\htdocs\SCHOOL MAPS\REPO\School-Map-Management-System\vendor\autoload.php';

    $identifier = isset($data['identifier']) ? trim($data['identifier']) : '';
    $otp        = isset($data['otp'])        ? trim($data['otp'])        : '';

    if (!$identifier || !$otp) {
        jsonError(400, 'Identifier and OTP code are required.');
    }

    // Fetch the super_admin by email or username
    $stmt = $pdo->prepare("
        SELECT user_id, name, email, role, twofa_secret AS totp_secret
        FROM   admin
        WHERE  (email = :id1 OR email = :id2)
        AND    role = 'super_admin'
        LIMIT  1
    ");
    $stmt->execute([
        ':id1' => $identifier,
        ':id2' => $identifier . '@school.com',
    ]);
    $user = $stmt->fetch();

    if (!$user) {
        jsonError(403, 'Unauthorized.');
    }

    if (empty($user['totp_secret'])) {
        jsonError(500, 'OTP not configured for this account. Please contact support.');
    }

    // Validate TOTP using PragmaRX
    $google2fa   = new \PragmaRX\Google2FA\Google2FA();
    $isValid     = $google2fa->verifyKey($user['totp_secret'], $otp, 8);

    if (!$isValid) {
        jsonError(401, 'Invalid OTP code. Please try again.');
    }

    // OTP passed — now set session
    $_SESSION['user_id']   = $user['user_id'];
    $_SESSION['user_role'] = $user['role'];
    $_SESSION['user_name'] = $user['name'];

    recordAuditLog($pdo, 'LOGIN', 'Logged in: ' . $user['name'] . ' (' . $user['email'] . ')', (int)$user['user_id']);

    jsonSuccess('Login successful', [
        'id'       => $user['user_id'],
        'fullName' => $user['name'],
        'email'    => $user['email'],
        'username' => explode('@', $user['email'])[0],
        'role'     => $user['role'],
    ]);
}    

 
function handleLogout(PDO $pdo)
{
    if (isset($_SESSION['user_id']) && in_array($_SESSION['user_role'] ?? '', ['admin', 'super_admin'], true)) {
        recordAuditLog($pdo, 'LOGOUT', 'Logged out: ' . ($_SESSION['user_name'] ?? 'Admin'), (int)$_SESSION['user_id']);
    }

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
 
function handleCreateFloor(PDO $pdo, array $data)
{
    setAdminSession($pdo);
 
    $name         = sanitizeString($data['name'] ?? '');
    $rawImagePath = trim((string)($data['image_path'] ?? 'maps/default.png'));
    $imagePath    = preg_match('/^data:image\//i', $rawImagePath)
        ? saveBase64FloorImage($rawImagePath)
        : sanitizeString($rawImagePath);
 
    if (!$name) { jsonError(400, 'Floor name is required.'); }
    if (!$imagePath) { jsonError(400, 'Image path is required.'); }
 
    $stmt = $pdo->prepare("CALL sp_add_map(:name, :image_path)");
    $stmt->execute([':name' => $name, ':image_path' => $imagePath]);
    $result = $stmt->fetch();
    $stmt->closeCursor();

    recordAuditLog($pdo, 'MAP_EDIT', 'Created floor: ' . $name);
 
    jsonSuccess('Floor added successfully.', [
        'id'         => (int)($result['new_map_id'] ?? 0),
        'name'       => $name,
        'image_path' => $imagePath,
        'status'     => 'active',
    ]);
}
 
function handleUpdateFloor(PDO $pdo, string $id, array $data)
{
    setAdminSession($pdo);
 
    if (!$id) { jsonError(400, 'Floor ID is required.'); }
    $floorId = (int)$id;
 
    $name         = sanitizeString($data['name'] ?? '');
    $rawImagePath = trim((string)($data['image_path'] ?? ''));
    $imagePath    = '';
    if ($rawImagePath !== '') {
        $imagePath = preg_match('/^data:image\//i', $rawImagePath)
            ? saveBase64FloorImage($rawImagePath)
            : sanitizeString($rawImagePath);
        if (!$imagePath) { jsonError(400, 'Could not save floor image.'); }
    }
 
    $stmt = $pdo->prepare("CALL sp_update_map(:id, :name, :image_path)");
    $stmt->execute([
        ':id'         => $floorId,
        ':name'       => $name ?: null,
        ':image_path' => $imagePath ?: null,
    ]);
    $stmt->closeCursor();

    recordAuditLog($pdo, 'MAP_EDIT', 'Updated floor ID: ' . $floorId . ($name ? ' - ' . $name : ''));
 
    jsonSuccess('Floor updated successfully.', [
        'id'         => $floorId,
        'name'       => $name,
        'image_path' => $imagePath,
    ]);
}
 
function handleToggleFloor(PDO $pdo, string $id)
{
    setAdminSession($pdo);
 
    if (!$id) { jsonError(400, 'Floor ID is required.'); }
    $floorId = (int)$id;
 
    $stmt = $pdo->prepare("CALL sp_toggle_map_status(:id)");
    $stmt->execute([':id' => $floorId]);
    $result = $stmt->fetch();
    $stmt->closeCursor();

    recordAuditLog($pdo, 'MAP_EDIT', 'Changed floor status ID: ' . $floorId . ' to ' . ($result['new_status'] ?? 'unknown'));
 
    jsonSuccess($result['message'] ?? 'Status toggled.', [
        'id'        => $floorId,
        'newStatus' => $result['new_status'] ?? 'unknown',
    ]);
}
 
function handleDeleteFloor(PDO $pdo, string $id)
{
    setAdminSession($pdo);
 
    if (!$id) { jsonError(400, 'Floor ID is required.'); }
    $floorId = (int)$id;
 
    try {
        $floorStmt = $pdo->prepare("
            SELECT map_id AS id, floor_name AS name, image_path, status
            FROM maps
            WHERE map_id = :id
            LIMIT 1
        ");
        $floorStmt->execute([':id' => $floorId]);
        $floor = $floorStmt->fetch();
        if (!$floor) {
            jsonError(404, 'Floor not found or already deleted.');
        }

        $pinStmt = $pdo->prepare("
            SELECT p.pin_id AS id,
                   p.map_id,
                   p.name,
                   p.description,
                   p.category_id,
                   p.image,
                   p.x,
                   p.y,
                   lc.name AS category_name,
                   m.floor_name
            FROM pins p
            LEFT JOIN legend_categories lc ON lc.category_id = p.category_id
            LEFT JOIN maps m ON m.map_id = p.map_id
            WHERE p.map_id = :id
            ORDER BY p.pin_id ASC
        ");
        $pinStmt->execute([':id' => $floorId]);
        $pins = $pinStmt->fetchAll();

        $pinIds = array_map(function($pin) { return (int)$pin['id']; }, $pins);
        $routeArchives = [];
        if (!empty($pinIds)) {
            $placeholders = implode(',', array_fill(0, count($pinIds), '?'));
            $routeStmt = $pdo->prepare("
                SELECT DISTINCT route_id
                FROM routes
                WHERE from_pin_id IN ($placeholders) OR to_pin_id IN ($placeholders)
            ");
            $routeStmt->execute(array_merge($pinIds, $pinIds));
            $routeIds = array_map('intval', $routeStmt->fetchAll(PDO::FETCH_COLUMN));
            foreach ($routeIds as $routeId) {
                $routeData = routeArchiveData($pdo, $routeId);
                if ($routeData) {
                    $routeArchives[] = $routeData;
                }
            }
        }

        $pdo->beginTransaction();

        archiveDeletedItem($pdo, 'floor', $floor['name'] ?: ('Floor #' . $floorId), $floor);
        foreach ($pins as $pin) {
            archiveDeletedItem($pdo, 'pin', $pin['name'] ?: ('Pin #' . $pin['id']), $pin);
        }
        foreach ($routeArchives as $routeData) {
            $routeLabel = $routeData['name'] ?: ($routeData['direction'] ?: ('Route #' . $routeData['id']));
            archiveDeletedItem($pdo, 'route', $routeLabel, $routeData);
            archiveDeletedItem($pdo, 'route_location', 'Route location: ' . ($routeData['from_pin_name'] ?: $routeData['from_pin_id']) . ' to ' . ($routeData['to_pin_name'] ?: $routeData['to_pin_id']), [
                'route_id'      => (int)$routeData['id'],
                'from_pin_id'   => (int)$routeData['from_pin_id'],
                'to_pin_id'     => (int)$routeData['to_pin_id'],
                'from_pin_name' => $routeData['from_pin_name'] ?? '',
                'to_pin_name'   => $routeData['to_pin_name'] ?? '',
                'direction'     => $routeData['direction'] ?? '',
            ]);
            foreach (($routeData['points'] ?? []) as $point) {
                archiveDeletedItem($pdo, 'point', 'Point #' . ($point['point_order'] ?? $point['id']) . ' for ' . $routeLabel, $point);
            }
        }

        if (!empty($routeArchives)) {
            $routeIds = array_map(function($route) { return (int)$route['id']; }, $routeArchives);
            $placeholders = implode(',', array_fill(0, count($routeIds), '?'));
            $deletePoints = $pdo->prepare("DELETE FROM route_points WHERE route_id IN ($placeholders)");
            $deletePoints->execute($routeIds);

            $deleteRoutes = $pdo->prepare("DELETE FROM routes WHERE route_id IN ($placeholders)");
            $deleteRoutes->execute($routeIds);
        }

        if (!empty($pinIds)) {
            $placeholders = implode(',', array_fill(0, count($pinIds), '?'));
            $deletePins = $pdo->prepare("DELETE FROM pins WHERE pin_id IN ($placeholders)");
            $deletePins->execute($pinIds);
        }

        $deleteFloor = $pdo->prepare("DELETE FROM maps WHERE map_id = :id");
        $deleteFloor->execute([':id' => $floorId]);

        $pdo->commit();

        recordAuditLog($pdo, 'MAP_EDIT', 'Deleted floor ID: ' . $floorId . (!empty($pins) ? ' and archived ' . count($pins) . ' pin(s)' : ''));
        jsonSuccess('Floor deleted successfully.', [
            'id' => $floorId,
            'archived_pins' => count($pins),
            'archived_routes' => count($routeArchives),
        ]);
    } catch (PDOException $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
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
 
function handleCreatePin(PDO $pdo, array $data)
{
    setAdminSession($pdo);
    ensurePinCoordinates($pdo);
 
    $mapId      = isset($data['map_id'])      ? (int)$data['map_id']             : 0;
    $name       = sanitizeString($data['name']        ?? '');
    $desc       = sanitizeString($data['description'] ?? '');
    $categoryId = isset($data['category_id']) ? (int)$data['category_id']        : null;
    $image      = !empty($data['image']) ? saveBase64Image(trim((string)$data['image'])) : '';
    $x          = isset($data['x'])               ? (float)$data['x']                 : 50.0;
    $y          = isset($data['y'])               ? (float)$data['y']                 : 50.0;
 
    if (!$mapId) { jsonError(400, 'map_id is required.'); }
    if (!$name)  { jsonError(400, 'Pin name is required.'); }
 
    try {
        $stmt = $pdo->prepare("CALL sp_add_pin(:map_id, :name, :description, :category_id, :image)");
        $stmt->execute([
            ':map_id'      => $mapId,
            ':name'        => $name,
            ':description' => $desc ?: null,
            ':category_id' => $categoryId,
            ':image'       => $image ?: null,
        ]);
        $result = $stmt->fetch();
        $stmt->closeCursor();
 
        $newPinId = (int)($result['new_pin_id'] ?? 0);
        if ($newPinId > 0) {
            $coordStmt = $pdo->prepare("UPDATE pins SET x = :x, y = :y WHERE pin_id = :id");
            $coordStmt->execute([':x' => $x, ':y' => $y, ':id' => $newPinId]);
        }
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

    recordAuditLog($pdo, 'PIN_UPDATE', 'Created pin: ' . $name);
 
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
 
function handleUpdatePin(PDO $pdo, string $id, array $data)
{
    setAdminSession($pdo);
    ensurePinCoordinates($pdo);
 
    if (!$id) { jsonError(400, 'Pin ID is required.'); }
 
    $name       = sanitizeString($data['name']        ?? '');
    $desc       = sanitizeString($data['description'] ?? '');
    $categoryId = isset($data['category_id']) ? (int)$data['category_id'] : null;
    $image      = !empty($data['image']) ? saveBase64Image(trim((string)$data['image'])) : '';
    $x          = isset($data['x'])               ? (float)$data['x']                 : null;
    $y          = isset($data['y'])               ? (float)$data['y']                 : null;
 
    try {
        $stmt = $pdo->prepare("CALL sp_update_pin(:id, :name, :description, :category_id, :image)");
        $stmt->execute([
            ':id'          => (int)$id,
            ':name'        => $name ?: null,
            ':description' => $desc ?: null,
            ':category_id' => $categoryId,
            ':image'       => $image ?: null,
        ]);
        $stmt->closeCursor();

        if ($x !== null || $y !== null) {
            $coordStmt = $pdo->prepare("
                UPDATE pins
                SET x = IFNULL(:x, x),
                    y = IFNULL(:y, y)
                WHERE pin_id = :id
            ");
            $coordStmt->execute([':id' => (int)$id, ':x' => $x, ':y' => $y]);
        }
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

    recordAuditLog($pdo, 'PIN_UPDATE', 'Updated pin ID: ' . (int)$id . ($name ? ' - ' . $name : ''));
 
    jsonSuccess('Pin updated successfully.', [
        'id'          => (int)$id,
        'name'        => $name,
        'description' => $desc,
        'category_id' => $categoryId,
        'image'       => $image,
    ]);
}
 
function handleDeletePin(PDO $pdo, string $id)
{
    setAdminSession($pdo);
 
    if (!$id) { jsonError(400, 'Pin ID is required.'); }
    $pinId = (int)$id;
    if ($pinId <= 0) { jsonError(400, 'Invalid Pin ID.'); }
 
    try {
        $pinStmt = $pdo->prepare("
            SELECT p.pin_id AS id,
                   p.map_id,
                   p.name,
                   p.description,
                   p.category_id,
                   p.image,
                   p.x,
                   p.y,
                   lc.name AS category_name,
                   m.floor_name
            FROM pins p
            LEFT JOIN legend_categories lc ON lc.category_id = p.category_id
            LEFT JOIN maps m ON m.map_id = p.map_id
            WHERE p.pin_id = :id
            LIMIT 1
        ");
        $pinStmt->execute([':id' => $pinId]);
        $pin = $pinStmt->fetch();
        if (!$pin) {
            jsonError(404, 'Pin not found or already deleted.');
        }

        $routeStmt = $pdo->prepare("
            SELECT route_id
            FROM routes
            WHERE from_pin_id = :from_id OR to_pin_id = :to_id
        ");
        $routeStmt->execute([':from_id' => $pinId, ':to_id' => $pinId]);
        $routeIds = array_map('intval', $routeStmt->fetchAll(PDO::FETCH_COLUMN));
        $routeArchives = [];
        foreach ($routeIds as $routeId) {
            $routeData = routeArchiveData($pdo, $routeId);
            if ($routeData) {
                $routeArchives[] = $routeData;
            }
        }
        $routeCount = count($routeArchives);

        $pdo->beginTransaction();

        archiveDeletedItem($pdo, 'pin', $pin['name'] ?: ('Pin #' . $pinId), $pin);
        foreach ($routeArchives as $routeData) {
            $routeLabel = $routeData['name'] ?: ($routeData['direction'] ?: ('Route #' . $routeData['id']));
            archiveDeletedItem($pdo, 'route', $routeLabel, $routeData);
            archiveDeletedItem($pdo, 'route_location', 'Route location: ' . ($routeData['from_pin_name'] ?: $routeData['from_pin_id']) . ' to ' . ($routeData['to_pin_name'] ?: $routeData['to_pin_id']), [
                'route_id'      => (int)$routeData['id'],
                'from_pin_id'   => (int)$routeData['from_pin_id'],
                'to_pin_id'     => (int)$routeData['to_pin_id'],
                'from_pin_name' => $routeData['from_pin_name'] ?? '',
                'to_pin_name'   => $routeData['to_pin_name'] ?? '',
                'direction'     => $routeData['direction'] ?? '',
            ]);
            foreach (($routeData['points'] ?? []) as $point) {
                archiveDeletedItem($pdo, 'point', 'Point #' . ($point['point_order'] ?? $point['id']) . ' for ' . $routeLabel, $point);
            }
        }

        if ($routeCount > 0) {
            $deletePoints = $pdo->prepare("
                DELETE rp
                FROM route_points rp
                INNER JOIN routes r ON r.route_id = rp.route_id
                WHERE r.from_pin_id = :from_id OR r.to_pin_id = :to_id
            ");
            $deletePoints->execute([':from_id' => $pinId, ':to_id' => $pinId]);

            $deleteRoutes = $pdo->prepare("
                DELETE FROM routes
                WHERE from_pin_id = :from_id OR to_pin_id = :to_id
            ");
            $deleteRoutes->execute([':from_id' => $pinId, ':to_id' => $pinId]);
        }

        $deletePin = $pdo->prepare("DELETE FROM pins WHERE pin_id = :id");
        $deletePin->execute([':id' => $pinId]);

        $pdo->commit();

        recordAuditLog($pdo, 'PIN_UPDATE', 'Deleted pin ID: ' . $pinId . ($routeCount > 0 ? ' and removed ' . $routeCount . ' related route(s)' : ''));

        jsonSuccess('Pin deleted successfully.', [
            'id' => $pinId,
            'deleted_routes' => $routeCount,
        ]);
    } catch (PDOException $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        jsonError(400, 'Failed to delete pin: ' . $e->getMessage());
    }
}
 
/* ============================================================
   ROUTES HANDLERS
   ============================================================ */
 
function handleGetRoutes(PDO $pdo)
{
    $stmt = $pdo->query("
        SELECT r.route_id    AS id,
               r.route_name  AS name,
               r.from_pin_id AS from_pin_id,
               r.to_pin_id   AS to_pin_id,
               r.from_pin_id AS originId,
               r.to_pin_id   AS destinationId,
               r.destination AS destination,
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
            SELECT x, y, floor, point_order
            FROM   route_points
            WHERE  route_id = :id
            ORDER  BY point_order ASC
        ");
        $rpStmt->execute([':id' => $route['id']]);
        $route['points'] = $rpStmt->fetchAll();
    }
 
    jsonResponse(['routes' => $routes]);
}
 
function resolvePinId(PDO $pdo, ?string $pinIdRaw)
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
 
function handleCreateRoute(PDO $pdo, array $data)
{
    setAdminSession($pdo);
 
    // Accept both from_pin_id/to_pin_id (API format) and originId/destinationId (JS format)
    $originRaw      = $data['originId']      ?? $data['from_pin_id']  ?? null;
    $destRaw        = $data['destinationId'] ?? $data['to_pin_id']    ?? null;
    $routeName      = sanitizeString($data['name'] ?? $data['route_name'] ?? 'Untitled Route');
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

        if ($routeId) {
            $nameStmt = $pdo->prepare("UPDATE routes SET route_name = :route_name, destination = :destination WHERE route_id = :id");
            $nameStmt->execute([
                ':route_name' => $routeName,
                ':destination' => $destName,
                ':id'         => $routeId,
            ]);
        }
 
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
                $pointResult = $rpStmt->fetch();
                $rpStmt->closeCursor();
                $pointId = (int)($pointResult['new_point_id'] ?? 0);
                if ($pointId > 0) {
                    $floorStmt = $pdo->prepare("UPDATE route_points SET floor = :floor WHERE id = :id");
                    $floorStmt->execute([
                        ':floor' => (int)($point['floor'] ?? $data['floor'] ?? 1),
                        ':id'    => $pointId,
                    ]);
                }
            }
        }
 
        $pdo->commit();

        recordAuditLog($pdo, 'ROUTE_UPDATE', 'Created route: ' . $routeName);
 
        jsonSuccess('Route created successfully.', [
            'route' => [
                'id'            => $routeId,
                'name'          => $routeName,
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
 
function handleUpdateRoute(PDO $pdo, string $id, array $data)
{
    setAdminSession($pdo);
 
    if (!$id) { jsonError(400, 'Route ID is required.'); }
 
    $originRaw  = $data['originId']      ?? $data['from_pin_id']  ?? null;
    $destRaw    = $data['destinationId'] ?? $data['to_pin_id']    ?? null;
    $routeName  = sanitizeString($data['name'] ?? $data['route_name'] ?? 'Untitled Route');
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

        $nameStmt = $pdo->prepare("UPDATE routes SET route_name = :route_name, destination = :destination WHERE route_id = :id");
        $nameStmt->execute([
            ':route_name'  => $routeName,
            ':destination' => $destName,
            ':id'          => (int)$id,
        ]);
 
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
                $pointResult = $rpStmt->fetch();
                $rpStmt->closeCursor();
                $pointId = (int)($pointResult['new_point_id'] ?? 0);
                if ($pointId > 0) {
                    $floorStmt = $pdo->prepare("UPDATE route_points SET floor = :floor WHERE id = :id");
                    $floorStmt->execute([
                        ':floor' => (int)($point['floor'] ?? $data['floor'] ?? 1),
                        ':id'    => $pointId,
                    ]);
                }
            }
        }
 
        $pdo->commit();

        recordAuditLog($pdo, 'ROUTE_UPDATE', 'Updated route ID: ' . (int)$id . ' - ' . $routeName);
 
        jsonSuccess('Route updated successfully.', [
            'route' => [
                'id'            => (int)$id,
                'name'          => $routeName,
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
 
function handleDeleteRoute(PDO $pdo, string $id)
{
    setAdminSession($pdo);
 
    if (!$id) { jsonError(400, 'Route ID is required.'); }
    $routeId = (int)$id;
 
    try {
        $routeData = routeArchiveData($pdo, $routeId);
        if (!$routeData) {
            jsonError(404, 'Route not found or already deleted.');
        }

        $routeLabel = $routeData['name'] ?: ($routeData['direction'] ?: ('Route #' . $routeId));

        $pdo->beginTransaction();
        archiveDeletedItem($pdo, 'route', $routeLabel, $routeData);
        archiveDeletedItem($pdo, 'route_location', 'Route location: ' . ($routeData['from_pin_name'] ?: $routeData['from_pin_id']) . ' to ' . ($routeData['to_pin_name'] ?: $routeData['to_pin_id']), [
            'route_id'      => $routeId,
            'from_pin_id'   => (int)$routeData['from_pin_id'],
            'to_pin_id'     => (int)$routeData['to_pin_id'],
            'from_pin_name' => $routeData['from_pin_name'] ?? '',
            'to_pin_name'   => $routeData['to_pin_name'] ?? '',
            'direction'     => $routeData['direction'] ?? '',
        ]);
        foreach (($routeData['points'] ?? []) as $point) {
            archiveDeletedItem($pdo, 'point', 'Point #' . ($point['point_order'] ?? $point['id']) . ' for ' . $routeLabel, $point);
        }

        $stmt = $pdo->prepare("CALL sp_delete_route(:id)");
        $stmt->execute([':id' => $routeId]);
        $stmt->closeCursor();
        $pdo->commit();

        recordAuditLog($pdo, 'ROUTE_UPDATE', 'Deleted route ID: ' . $routeId);
        jsonSuccess('Route deleted successfully.');
    } catch (PDOException $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        jsonError(400, 'Failed to delete route: ' . $e->getMessage());
    }
}

/* ============================================================
   ARCHIVE ITEM HANDLERS
   ============================================================ */

function handleGetArchiveItems(PDO $pdo)
{
    ensureLegacyDeletedLegendArchives($pdo);

    $stmt = $pdo->query("
        SELECT audit_id, user_id, description, timestamp
        FROM audit_log
        WHERE action = 'ARCHIVE_ITEM'
        ORDER BY timestamp DESC, audit_id DESC
    ");
    $rows = $stmt->fetchAll();
    $items = [];

    foreach ($rows as $row) {
        $payload = json_decode($row['description'] ?? '', true);
        if (!is_array($payload) || empty($payload['archive'])) {
            continue;
        }

        $items[] = [
            'audit_id'    => (int)$row['audit_id'],
            'user_id'     => (int)$row['user_id'],
            'type'        => $payload['type'] ?? 'unknown',
            'label'       => $payload['label'] ?? 'Archived item',
            'data'        => $payload['data'] ?? [],
            'deleted_at'  => $payload['deleted_at'] ?? $row['timestamp'],
            'deleted_by'  => $payload['deleted_by'] ?? 'Admin',
            'restored_at' => $payload['restored_at'] ?? null,
            'restored_by' => $payload['restored_by'] ?? null,
            'timestamp'   => $row['timestamp'],
        ];
    }

    jsonResponse(['archive_items' => $items]);
}

function ensureLegacyDeletedLegendArchives(PDO $pdo)
{
    static $checked = false;
    if ($checked) { return; }
    $checked = true;

    try {
        $stmt = $pdo->query("
            SELECT audit_id, user_id, description, timestamp
            FROM audit_log
            WHERE action = 'PIN_UPDATE'
              AND description LIKE 'Deleted legend category ID:%'
            ORDER BY audit_id ASC
        ");
        $rows = $stmt->fetchAll();

        foreach ($rows as $row) {
            if (!preg_match('/Deleted legend category ID:\s*(\d+)/i', (string)$row['description'], $match)) {
                continue;
            }

            $legendId = (int)$match[1];
            if ($legendId <= 0) { continue; }

            $exists = $pdo->prepare("
                SELECT COUNT(*)
                FROM audit_log
                WHERE action = 'ARCHIVE_ITEM'
                  AND description LIKE '%\"type\":\"legend\"%'
                  AND description LIKE :id_pattern
            ");
            $exists->execute([':id_pattern' => '%"id":' . $legendId . '%']);
            if ((int)$exists->fetchColumn() > 0) {
                continue;
            }

            $payload = [
                'archive'    => true,
                'type'       => 'legend',
                'label'      => 'Legend #' . $legendId,
                'data'       => [
                    'id'    => $legendId,
                    'name'  => 'Recovered Legend #' . $legendId,
                    'color' => '#ff4d4d',
                    'icon'  => 'MapPin',
                ],
                'deleted_at' => $row['timestamp'],
                'deleted_by' => 'Admin',
            ];

            $insert = $pdo->prepare("
                INSERT INTO audit_log (user_id, action, description, timestamp)
                VALUES (:user_id, 'ARCHIVE_ITEM', :description, :timestamp)
            ");
            $insert->execute([
                ':user_id'     => (int)($row['user_id'] ?? 0),
                ':description' => json_encode($payload, JSON_UNESCAPED_UNICODE),
                ':timestamp'   => $row['timestamp'],
            ]);
        }
    } catch (PDOException $e) {
        // Ignore legacy archive backfill failures to keep the archive page available.
    }
}

function markArchiveItemRestored(PDO $pdo, int $auditId)
{
    $stmt = $pdo->prepare("SELECT description FROM audit_log WHERE audit_id = :id AND action = 'ARCHIVE_ITEM' LIMIT 1");
    $stmt->execute([':id' => $auditId]);
    $description = $stmt->fetchColumn();
    $payload = json_decode((string)$description, true);
    if (!is_array($payload)) { return; }

    $payload['restored_at'] = date('Y-m-d H:i:s');
    $payload['restored_by'] = $_SESSION['user_name'] ?? 'Super Admin';

    $update = $pdo->prepare("UPDATE audit_log SET description = :description WHERE audit_id = :id");
    $update->execute([
        ':description' => json_encode($payload, JSON_UNESCAPED_UNICODE),
        ':id'          => $auditId,
    ]);
}

function handleRestoreArchiveItem(PDO $pdo, array $data)
{
    setAdminSession($pdo);

    $auditId = isset($data['audit_id']) ? (int)$data['audit_id'] : 0;
    if ($auditId <= 0) {
        jsonError(400, 'Archive item ID is required.');
    }

    $stmt = $pdo->prepare("SELECT description FROM audit_log WHERE audit_id = :id AND action = 'ARCHIVE_ITEM' LIMIT 1");
    $stmt->execute([':id' => $auditId]);
    $description = $stmt->fetchColumn();
    if (!$description) {
        jsonError(404, 'Archive item not found.');
    }

    $payload = json_decode((string)$description, true);
    if (!is_array($payload) || empty($payload['archive'])) {
        jsonError(400, 'Archive item is invalid.');
    }
    if (!empty($payload['restored_at'])) {
        jsonError(409, 'This archive item was already restored.');
    }

    $type = $payload['type'] ?? '';
    $itemData = is_array($payload['data'] ?? null) ? $payload['data'] : [];

    try {
        $pdo->beginTransaction();

        switch ($type) {
            case 'floor':
                restoreArchivedFloor($pdo, $itemData);
                break;
            case 'pin':
                restoreArchivedPin($pdo, $itemData);
                break;
            case 'legend':
                restoreArchivedLegend($pdo, $itemData);
                break;
            case 'route':
                restoreArchivedRoute($pdo, $itemData);
                break;
            case 'route_location':
                restoreArchivedRouteLocation($pdo, $itemData);
                break;
            case 'point':
                restoreArchivedPoint($pdo, $itemData);
                break;
            default:
                jsonError(400, 'Unsupported archive type: ' . $type);
        }

        markArchiveItemRestored($pdo, $auditId);
        recordAuditLog($pdo, 'ARCHIVE', 'Restored archived ' . str_replace('_', ' ', $type) . ': ' . ($payload['label'] ?? ('Archive #' . $auditId)));

        $pdo->commit();
        jsonSuccess('Archive item restored successfully.');
    } catch (PDOException $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        jsonError(400, 'Failed to restore archive item: ' . $e->getMessage());
    }
}

function restoreArchivedFloor(PDO $pdo, array $data)
{
    $id = (int)($data['id'] ?? $data['map_id'] ?? 0);
    if ($id <= 0) { jsonError(400, 'Archived floor ID is missing.'); }

    $exists = $pdo->prepare("SELECT COUNT(*) FROM maps WHERE map_id = :id");
    $exists->execute([':id' => $id]);
    if ((int)$exists->fetchColumn() > 0) {
        jsonError(409, 'Floor already exists.');
    }

    $stmt = $pdo->prepare("
        INSERT INTO maps (map_id, floor_name, image_path, status)
        VALUES (:id, :name, :image_path, :status)
    ");
    $stmt->execute([
        ':id'         => $id,
        ':name'       => sanitizeString($data['name'] ?? $data['floor_name'] ?? ('Floor #' . $id)),
        ':image_path' => sanitizeString($data['image_path'] ?? 'maps/default.png'),
        ':status'     => sanitizeString($data['status'] ?? 'active'),
    ]);
}

function restoreArchivedPin(PDO $pdo, array $data)
{
    $id = (int)($data['id'] ?? $data['pin_id'] ?? 0);
    $mapId = (int)($data['map_id'] ?? 0);
    if ($id <= 0 || $mapId <= 0) { jsonError(400, 'Archived pin data is incomplete.'); }

    $exists = $pdo->prepare("SELECT COUNT(*) FROM pins WHERE pin_id = :id");
    $exists->execute([':id' => $id]);
    if ((int)$exists->fetchColumn() > 0) {
        jsonError(409, 'Pin already exists.');
    }

    $mapExists = $pdo->prepare("SELECT COUNT(*) FROM maps WHERE map_id = :id");
    $mapExists->execute([':id' => $mapId]);
    if ((int)$mapExists->fetchColumn() === 0) {
        jsonError(409, 'Restore the floor for this pin first.');
    }

    $stmt = $pdo->prepare("
        INSERT INTO pins (pin_id, map_id, name, description, category_id, image, x, y)
        VALUES (:id, :map_id, :name, :description, :category_id, :image, :x, :y)
    ");
    $stmt->execute([
        ':id'          => $id,
        ':map_id'      => $mapId,
        ':name'        => sanitizeString($data['name'] ?? ('Pin #' . $id)),
        ':description' => sanitizeString($data['description'] ?? ''),
        ':category_id' => isset($data['category_id']) ? (int)$data['category_id'] : null,
        ':image'       => $data['image'] ?? null,
        ':x'           => isset($data['x']) ? (float)$data['x'] : 50.0,
        ':y'           => isset($data['y']) ? (float)$data['y'] : 50.0,
    ]);
}

function restoreArchivedLegend(PDO $pdo, array $data)
{
    $id = (int)($data['id'] ?? $data['category_id'] ?? 0);
    if ($id <= 0) { jsonError(400, 'Archived legend ID is missing.'); }

    $exists = $pdo->prepare("SELECT COUNT(*) FROM legend_categories WHERE category_id = :id");
    $exists->execute([':id' => $id]);
    if ((int)$exists->fetchColumn() > 0) {
        jsonError(409, 'Legend category already exists.');
    }

    $stmt = $pdo->prepare("
        INSERT INTO legend_categories (category_id, name, color, icon)
        VALUES (:id, :name, :color, :icon)
    ");
    $stmt->execute([
        ':id'    => $id,
        ':name'  => sanitizeString($data['name'] ?? ('Legend #' . $id)),
        ':color' => sanitizeString($data['color'] ?? '#ff4d4d'),
        ':icon'  => $data['icon'] ?? null,
    ]);
}

function restoreArchivedRoute(PDO $pdo, array $data)
{
    $id = (int)($data['id'] ?? $data['route_id'] ?? 0);
    $fromPinId = (int)($data['from_pin_id'] ?? 0);
    $toPinId = (int)($data['to_pin_id'] ?? 0);
    if ($id <= 0 || $fromPinId <= 0 || $toPinId <= 0) {
        jsonError(400, 'Archived route data is incomplete.');
    }

    $exists = $pdo->prepare("SELECT COUNT(*) FROM routes WHERE route_id = :id");
    $exists->execute([':id' => $id]);
    if ((int)$exists->fetchColumn() > 0) {
        jsonError(409, 'Route already exists.');
    }

    $pinCheck = $pdo->prepare("SELECT COUNT(*) FROM pins WHERE pin_id IN (:from_pin_id, :to_pin_id)");
    $pinCheck->execute([':from_pin_id' => $fromPinId, ':to_pin_id' => $toPinId]);
    if ((int)$pinCheck->fetchColumn() < 2) {
        jsonError(409, 'Restore the route pins first.');
    }

    $stmt = $pdo->prepare("
        INSERT INTO routes (route_id, route_name, from_pin_id, to_pin_id, destination, direction)
        VALUES (:id, :route_name, :from_pin_id, :to_pin_id, :destination, :direction)
    ");
    $stmt->execute([
        ':id'          => $id,
        ':route_name'  => sanitizeString($data['name'] ?? $data['route_name'] ?? ('Route #' . $id)),
        ':from_pin_id' => $fromPinId,
        ':to_pin_id'   => $toPinId,
        ':destination' => sanitizeString($data['destination'] ?? ''),
        ':direction'   => sanitizeString($data['direction'] ?? ''),
    ]);

    if (!empty($data['points']) && is_array($data['points'])) {
        foreach ($data['points'] as $point) {
            restoreArchivedPoint($pdo, $point);
        }
    }
}

function restoreArchivedRouteLocation(PDO $pdo, array $data)
{
    $routeId = (int)($data['route_id'] ?? 0);
    $fromPinId = (int)($data['from_pin_id'] ?? 0);
    $toPinId = (int)($data['to_pin_id'] ?? 0);
    if ($routeId <= 0 || $fromPinId <= 0 || $toPinId <= 0) {
        jsonError(400, 'Archived route location data is incomplete.');
    }

    $exists = $pdo->prepare("SELECT COUNT(*) FROM routes WHERE route_id = :id");
    $exists->execute([':id' => $routeId]);
    if ((int)$exists->fetchColumn() === 0) {
        jsonError(409, 'Restore the route first before restoring its location.');
    }

    $stmt = $pdo->prepare("
        UPDATE routes
        SET from_pin_id = :from_pin_id,
            to_pin_id = :to_pin_id,
            direction = IF(:direction_check = '', direction, :direction)
        WHERE route_id = :route_id
    ");
    $stmt->execute([
        ':route_id'    => $routeId,
        ':from_pin_id' => $fromPinId,
        ':to_pin_id'   => $toPinId,
        ':direction_check' => sanitizeString($data['direction'] ?? ''),
        ':direction'   => sanitizeString($data['direction'] ?? ''),
    ]);
}

function restoreArchivedPoint(PDO $pdo, array $data)
{
    $id = (int)($data['id'] ?? 0);
    $routeId = (int)($data['route_id'] ?? 0);
    if ($routeId <= 0) { jsonError(400, 'Archived point route ID is missing.'); }

    $routeExists = $pdo->prepare("SELECT COUNT(*) FROM routes WHERE route_id = :id");
    $routeExists->execute([':id' => $routeId]);
    if ((int)$routeExists->fetchColumn() === 0) {
        jsonError(409, 'Restore the route for this point first.');
    }

    if ($id > 0) {
        $exists = $pdo->prepare("SELECT COUNT(*) FROM route_points WHERE id = :id");
        $exists->execute([':id' => $id]);
        if ((int)$exists->fetchColumn() > 0) {
            return;
        }
    }

    if ($id > 0) {
        $stmt = $pdo->prepare("
            INSERT INTO route_points (id, route_id, point_order, x, y, floor)
            VALUES (:id, :route_id, :point_order, :x, :y, :floor)
        ");
        $stmt->execute([
            ':id'          => $id,
            ':route_id'    => $routeId,
            ':point_order' => (int)($data['point_order'] ?? 1),
            ':x'           => (float)($data['x'] ?? 0),
            ':y'           => (float)($data['y'] ?? 0),
            ':floor'       => isset($data['floor']) ? (int)$data['floor'] : null,
        ]);
        return;
    }

    $stmt = $pdo->prepare("
        INSERT INTO route_points (route_id, point_order, x, y, floor)
        VALUES (:route_id, :point_order, :x, :y, :floor)
    ");
    $stmt->execute([
        ':route_id'    => $routeId,
        ':point_order' => (int)($data['point_order'] ?? 1),
        ':x'           => (float)($data['x'] ?? 0),
        ':y'           => (float)($data['y'] ?? 0),
        ':floor'       => isset($data['floor']) ? (int)$data['floor'] : null,
    ]);
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
 
function handleCreateLegend(PDO $pdo, array $data)
{
    setAdminSession($pdo);
 
    $name  = sanitizeString($data['name']  ?? '');
    $color = sanitizeString($data['color'] ?? '#000000');
    $icon  = sanitizeString($data['icon']  ?? '');
 
    if (!$name)  { jsonError(400, 'Legend name is required.'); }
    if (!preg_match('/^#[0-9a-fA-F]{3,8}$/', $color)) {
        jsonError(400, 'Invalid color format. Must be a hex color (e.g. #3498DB).');
    }
 
    try {
        if (strlen($icon) > 255) {
            throw new PDOException('Legend icon is longer than procedure parameter.');
        }
        $stmt = $pdo->prepare("CALL sp_add_legend_category(:name, :color, :icon)");
        $stmt->execute([
            ':name'  => $name,
            ':color' => $color,
            ':icon'  => $icon ?: null,
        ]);
        $result = $stmt->fetch();
        $stmt->closeCursor();
        $newCategoryId = (int)($result['new_category_id'] ?? 0);
    } catch (PDOException $e) {
        $stmt = $pdo->prepare("
            INSERT INTO legend_categories (name, color, icon)
            VALUES (:name, :color, :icon)
        ");
        $stmt->execute([
            ':name'  => $name,
            ':color' => $color,
            ':icon'  => $icon ?: null,
        ]);
        $newCategoryId = (int)$pdo->lastInsertId();
    }

    recordAuditLog($pdo, 'PIN_UPDATE', 'Created legend category: ' . $name);
 
    jsonSuccess('Legend category added successfully.', [
        'id'    => $newCategoryId,
        'name'  => $name,
        'color' => $color,
        'icon'  => $icon,
    ]);
}
 
function handleUpdateLegend(PDO $pdo, string $id, array $data)
{
    setAdminSession($pdo);
 
    if (!$id) { jsonError(400, 'Legend ID is required.'); }
    $legendId = (int)$id;
 
    $name  = sanitizeString($data['name']  ?? '');
    $color = sanitizeString($data['color'] ?? '');
    $icon  = sanitizeString($data['icon']  ?? '');
 
    if ($color && !preg_match('/^#[0-9a-fA-F]{3,8}$/', $color)) {
        jsonError(400, 'Invalid color format. Must be a hex color.');
    }
 
    try {
        if (strlen($icon) > 255) {
            throw new PDOException('Legend icon is longer than procedure parameter.');
        }
        $stmt = $pdo->prepare("CALL sp_update_legend_category(:id, :name, :color, :icon)");
        $stmt->execute([
            ':id'    => $legendId,
            ':name'  => $name  ?: null,
            ':color' => $color ?: null,
            ':icon'  => $icon  ?: null,
        ]);
        $stmt->closeCursor();
    } catch (PDOException $e) {
        $stmt = $pdo->prepare("
            UPDATE legend_categories
            SET name = COALESCE(:name, name),
                color = COALESCE(:color, color),
                icon = COALESCE(:icon, icon)
            WHERE category_id = :id
        ");
        $stmt->execute([
            ':id'    => $legendId,
            ':name'  => $name  ?: null,
            ':color' => $color ?: null,
            ':icon'  => $icon  ?: null,
        ]);
    }

    recordAuditLog($pdo, 'PIN_UPDATE', 'Updated legend category ID: ' . $legendId . ($name ? ' - ' . $name : ''));
 
    jsonSuccess('Legend updated successfully.', ['id' => $legendId]);
}
 
function handleDeleteLegend(PDO $pdo, string $id)
{
    setAdminSession($pdo);
 
    if (!$id) { jsonError(400, 'Legend ID is required.'); }
    $legendId = (int)$id;
 
    try {
        $legendStmt = $pdo->prepare("
            SELECT category_id AS id, name, color, icon
            FROM legend_categories
            WHERE category_id = :id
            LIMIT 1
        ");
        $legendStmt->execute([':id' => $legendId]);
        $legend = $legendStmt->fetch();
        if (!$legend) {
            jsonError(404, 'Legend category not found or already deleted.');
        }

        archiveDeletedItem($pdo, 'legend', $legend['name'] ?: ('Legend #' . $legendId), $legend);

        $stmt = $pdo->prepare("CALL sp_delete_legend_category(:id)");
        $stmt->execute([':id' => $legendId]);
        $stmt->closeCursor();
        recordAuditLog($pdo, 'PIN_UPDATE', 'Deleted legend category ID: ' . $legendId);
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

function handleUpdateVisitorLogTimeOut(PDO $pdo, string $logId, array $data)
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
 
function handleCreateVisitorLog(PDO $pdo, array $data)
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
 
        $logId = (int)$pdo->lastInsertId();
        jsonSuccess('Visitor log added successfully.', [
            'log_id' => $logId,
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

function handleCreateAdminAccount(PDO $pdo, array $data)
{
    setAdminSession($pdo);

    $name     = sanitizeString($data['fullName'] ?? $data['name'] ?? '');
    $email    = sanitizeString($data['email']    ?? '');
    $password = $data['password'] ?? '';
    $role     = sanitizeString($data['role']     ?? 'admin');

    if (!$name)     { jsonError(400, 'Name is required.'); }
    if (!$email)    { jsonError(400, 'Email is required.'); }
    if (!$password) { jsonError(400, 'Password is required.'); }
    if (!preg_match('/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*]).{8,}$/', $password)) {
        jsonError(400, 'Password needs 8+ chars with uppercase, lowercase, number, and symbol.');
    }

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

function handleUpdateAdminAccount(PDO $pdo, string $id, array $data)
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
        if (!preg_match('/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*]).{8,}$/', $data['password'])) {
            jsonError(400, 'Password needs 8+ chars with uppercase, lowercase, number, and symbol.');
        }
        $oldPassword = (string)($data['oldPassword'] ?? '');
        if ($oldPassword === '') {
            jsonError(400, 'Old password is required.');
        }

        $stmt = $pdo->prepare("SELECT name, email, password FROM admin WHERE user_id = :id LIMIT 1");
        $stmt->execute([':id' => (int)$id]);
        $targetAdmin = $stmt->fetch();
        if (!$targetAdmin) {
            jsonError(404, 'Admin account not found.');
        }
        $adminPassword = $targetAdmin['password'];

        $oldPasswordValid = false;
        if (substr((string)$adminPassword, 0, 4) === '$2y$') {
            $oldPasswordValid = password_verify($oldPassword, (string)$adminPassword);
        } else {
            $oldPasswordValid = hash_equals((string)$adminPassword, $oldPassword);
        }
        if (!$oldPasswordValid) {
            jsonError(401, 'Old password is incorrect.');
        }

        $hashed = password_hash($data['password'], PASSWORD_BCRYPT);
        $stmt = $pdo->prepare("UPDATE admin SET password = :password WHERE user_id = :id");
        $stmt->execute([':password' => $hashed, ':id' => (int)$id]);
    }

    // Audit log
    $description = 'Updated admin account ID: ' . $id;
    if ($name) $description .= ' - Name: ' . $name;
    if ($role) $description .= ' - Role: ' . $role;
    $auditAction = 'UPDATE';
    if (!empty($data['password'])) {
        $auditAction = 'PASSWORD_RESET';
        $targetName = $targetAdmin['name'] ?? ('ID ' . $id);
        $targetEmail = $targetAdmin['email'] ?? '';
        $description = 'Reset password for admin account: ' . $targetName . ($targetEmail ? ' (' . $targetEmail . ')' : '');
    }

    $stmt = $pdo->prepare("
        INSERT INTO audit_log (user_id, action, description, timestamp)
        VALUES (:user_id, :action, :description, NOW())
    ");
    $stmt->execute([
        ':user_id' => $_SESSION['user_id'] ?? null,
        ':action' => $auditAction,
        ':description' => $description,
    ]);

    jsonSuccess('Admin updated successfully.', ['id' => (int)$id]);
}

function handleDeleteAdminAccount(PDO $pdo, string $id)
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

function handleCreateAuditLog(PDO $pdo, array $data)
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
