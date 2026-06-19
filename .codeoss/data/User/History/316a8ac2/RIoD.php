<?php
/**
 * Senior PHP Developer - Employee Management System (EMS)
 * Login Module: Cyber Level 2 Security Implementation
 */

// Start session with secure settings
session_start();

// Database Configuration (Standard MySQLi)
$db_host = 'localhost';
 = 'root';
 = '';
 = 'ems_database';

 = new mysqli(, , , );

// Check connection
if (->connect_error) {
    die("Connection failed: " . ->connect_error);
}

 = "";
 = false;

if (["REQUEST_METHOD"] == "POST") {
    // Cyber Level 2: Input Sanitization (XSS Prevention)
     = htmlspecialchars(trim(['username'] ?? ''));
     = ['password'] ?? '';

    if (!empty() && !empty()) {
        // Cyber Level 2: Prepared Statements (SQL Injection Prevention)
         = ->prepare("SELECT id, password_hash, failed_attempts, lockout_until, must_change_password FROM admin_users WHERE username = ? LIMIT 1");
        ->bind_param("s", );
        ->execute();
         = ->get_result();

        if ( = ->fetch_assoc()) {
             = new DateTime();
            
            // Step 1: Check if account is locked (Lockout Logic)
            if (['lockout_until'] && new DateTime(['lockout_until']) > ) {
                 = new DateTime(['lockout_until']);
                 = ->diff();
                 = (->h * 60) + ->i + 1;
                
                 = "Account locked. Try again after  minutes.";
                 = true;
            } else {
                // Step 2: Validate username + password using password_verify
                if (password_verify(, ['password_hash'])) {
                    
                    // CORRECT LOGIN: Success Logic
                    // Reset security counters
                     = ->prepare("UPDATE admin_users SET failed_attempts = 0, lockout_until = NULL, last_login = NOW() WHERE id = ?");
                    ->bind_param("i", ['id']);
                    ->execute();

                    // Cyber Level 2: Session Fixation Protection
                    ['user_id'] = ['id'];
                    ['username'] = ;
                    ['logged_in'] = true;
                    session_regenerate_id(true); 

                    header("Location: dashboard.php");
                    exit();
                } else {
                    // INCORRECT LOGIN: Increment failed_attempts
                     = ['failed_attempts'] + 1;
                    
                    if ( >= 3) {
                        // Cyber Level 2: Brute Force Protection (Lockout)
                         = date('Y-m-d H:i:s', strtotime('+15 minutes'));
                         = ->prepare("UPDATE admin_users SET failed_attempts = ?, lockout_until = ? WHERE id = ?");
                        ->bind_param("isi", , , ['id']);
                        ->execute();
                        
                         = "Account locked for 15 minutes due to 3 failed attempts.";
                         = true;
                    } else {
                         = ->prepare("UPDATE admin_users SET failed_attempts = ? WHERE id = ?");
                        ->bind_param("ii", , ['id']);
                        ->execute();
                        
                        // Cyber Level 2: Informative Feedback (Attempts remaining)
                         = 3 - ;
                         = "Invalid username or password. Attempts left: /3";
                    }
                }
            }
        } else {
            // Cyber Level 2: Generic error to prevent User Enumeration
             = "Invalid username or password.";
        }
        ->close();
    }
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>EMS Login | Secure Portal</title>
    <!-- Tech: Bootstrap 5 for UI -->
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    <style>
        body { background-color: #f8f9fa; }
        .login-card { width: 400px; border: none; border-radius: 15px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
    </style>
</head>
<body class="d-flex align-items-center justify-content-center vh-100">

    <div class="card login-card">
        <div class="card-body p-5">
            <h3 class="text-center mb-4">EMS Admin Login</h3>

            <?php if (): ?>
                <div class="alert alert-danger alert-dismissible fade show" role="alert">
                    <?php echo ; ?>
                    <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
                </div>
            <?php endif; ?>

            <form action="login.php" method="POST">
                <div class="mb-3">
                    <label for="username" class="form-label">Username</label>
                    <input type="text" name="username" id="username" class="form-control" required 
                           <?php echo  ? 'disabled' : ''; ?>>
                </div>
                <div class="mb-4">
                    <label for="password" class="form-label">Password</label>
                    <input type="password" name="password" id="password" class="form-control" required
                           <?php echo  ? 'disabled' : ''; ?>>
                </div>
                <div class="d-grid">
                    <button type="submit" class="btn btn-primary btn-lg" 
                            <?php echo  ? 'disabled' : 'enabled'; ?>>
                        Login
                    </button>
                </div>
            </form>
        </div>
        <div class="card-footer text-center py-3 bg-white border-0">
            <small class="text-muted">Cyber Level 2 Secured Infrastructure</small>
        </div>
    </div>

    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
</body>
</html>
