<?php
/**
 * Senior PHP Developer - Employee Management System (EMS)
 * Login Module: Cyber Level 2 Security Implementation
 */

// Start session with secure settings
session_start([
    'cookie_httponly' => true,
    'cookie_secure' => false, // Gawing true kung gumagamit ka ng HTTPS
    'use_only_cookies' => true,
]);

// Database Configuration
$db_host = 'localhost';
$db_user = 'root';
$db_pass = '';
$db_name = 'ems_database';

$conn = new mysqli($db_host, $db_user, $db_pass, $db_name);

if ($conn->connect_error) {
    die("Connection failed: " . $conn->connect_error);
}

$error_msg = "";
$account_locked = false;

if ($_SERVER["REQUEST_METHOD"] == "POST") {
    // Input Sanitization
    $username = htmlspecialchars(trim($_POST['username'] ?? ''));
    $password = $_POST['password'] ?? '';

    if (!empty($username) && !empty($password)) {
        // SQL Injection Prevention gamit ang Prepared Statements
        $stmt = $conn->prepare("SELECT id, password_hash, failed_attempts, lockout_until FROM admin_users WHERE username = ? LIMIT 1");
        $stmt->bind_param("s", $username);
        $stmt->execute();
        $result = $stmt->get_result();

        if ($user = $result->fetch_assoc()) {
            $now = new DateTime();
            
            // Check kung ang account ay kasalukuyang naka-lock
            if ($user['lockout_until'] && new DateTime($user['lockout_until']) > $now) {
                $error_msg = "Masyadong maraming maling login. Subukan muli pagkalipas ng ilang minuto.";
                $account_locked = true;
            } else {
                // I-verify ang password
                if (password_verify($password, $user['password_hash'])) {
                    // SUCCESS: I-reset ang failed attempts
                    $update_stmt = $conn->prepare("UPDATE admin_users SET failed_attempts = 0, lockout_until = NULL, last_login = NOW() WHERE id = ?");
                    $update_stmt->bind_param("i", $user['id']);
                    $update_stmt->execute();

                    // Session Fixation Protection
                    $_SESSION['user_id'] = $user['id'];
                    $_SESSION['username'] = $username;
                    $_SESSION['logged_in'] = true;
                    session_regenerate_id(true); 

                    header("Location: dashboard.php");
                    exit();
                } else {
                    // FAILURE: Dagdagan ang failed_attempts count
                    $new_attempts = $user['failed_attempts'] + 1;
                    
                    if ($new_attempts >= 3) {
                        // Brute Force Protection: Lockout for 15 minutes
                        $lockout_time = date('Y-m-d H:i:s', strtotime('+15 minutes'));
                        $update_stmt = $conn->prepare("UPDATE admin_users SET failed_attempts = ?, lockout_until = ? WHERE id = ?");
                        $update_stmt->bind_param("isi", $new_attempts, $lockout_time, $user['id']);
                        $error_msg = "Account locked for 15 minutes dahil sa 3 failed attempts.";
                        $account_locked = true;
                    } else {
                        $update_stmt = $conn->prepare("UPDATE admin_users SET failed_attempts = ? WHERE id = ?");
                        $update_stmt->bind_param("ii", $new_attempts, $user['id']);
                        $error_msg = "Maling username o password. Subok na natira: " . (3 - $new_attempts);
                    }
                    $update_stmt->execute();
                }
            }
        } else {
            // Generic error para iwasan ang User Enumeration
            $error_msg = "Maling username o password.";
        }
        $stmt->close();
    }
}
?>
<!DOCTYPE html>
<html lang="tl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>EMS Login | Secure Portal</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    <style>
        body { background-color: #f4f7f6; }
        .login-card { width: 400px; border-radius: 15px; box-shadow: 0 10px 25px rgba(0,0,0,0.1); }
    </style>
</head>
<body class="d-flex align-items-center justify-content-center vh-100">
    <div class="card login-card">
        <div class="card-body p-5">
            <h3 class="text-center mb-4">EMS Admin Login</h3>

            <?php if ($error_msg): ?>
                <div class="alert alert-danger alert-dismissible fade show">
                    <?php echo $error_msg; ?>
                    <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
                </div>
            <?php endif; ?>

            <form method="POST">
                <div class="mb-3">
                    <label class="form-label">Username</label>
                    <input type="text" name="username" class="form-control" required 
                           <?php echo $account_locked ? 'disabled' : ''; ?>>
                </div>
                <div class="mb-4">
                    <label class="form-label">Password</label>
                    <input type="password" name="password" class="form-control" required
                           <?php echo $account_locked ? 'disabled' : ''; ?>>
                </div>
                <div class="d-grid">
                    <button type="submit" class="btn btn-primary btn-lg" 
                            <?php echo $account_locked ? 'disabled' : ''; ?>>
                        Login
                    </button>
                </div>
            </form>
        </div>
        <div class="card-footer text-center py-3 bg-white border-0">
            <small class="text-muted">EMS Cyber-Secured Infrastructure</small>
        </div>
    </div>
    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
</body>
</html>