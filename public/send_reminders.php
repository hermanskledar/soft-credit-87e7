<?php
$file = 'pending_registrations.txt';
if (!file_exists($file)) {
    exit("No pending registrations.");
}

$lines = file($file, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
$new_lines = [];

foreach ($lines as $line) {
    list($email, $token) = explode(",", $line);
    
    // Resend verification email
    $verify_link = "https://test.tskvspartacus.nl/verify.php?token=$token&email=$email";
    $subject = "Reminder: Verify Your Spartacus Membership";
    $headers = "From: no-reply@tskvspartacus.nl\r\nContent-Type: text/html; charset=UTF-8\r\n";
    $message = "<h2>Reminder: Verify Your Membership</h2>
                <p>Please verify your email by clicking below:</p>
                <p><a href='$verify_link'>Verify Now</a></p>";

    mail($email, $subject, $message, $headers);
    
    // Keep them in the list if we want to send another reminder later
    $new_lines[] = $line;
}

// Optionally, clear the file if you only want one reminder
file_put_contents($file, implode("\n", $new_lines));
?>
