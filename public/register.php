<?php
if ($_SERVER["REQUEST_METHOD"] == "POST") {
    $name = $_POST['name'];
    $email = $_POST['email'];
    $phone = $_POST['phone'];
    $membership = $_POST['membership'];
    $signature = $_POST['signature'];

    // Verify contract agreement
    if (!isset($_POST['contract'])) {
        echo json_encode(["status" => "error", "message" => "You must agree to the contract."]);
        exit;
    }

    // Email settings
    $admin_email = "tssvspartacus@gmail.com"; // Your email
    $subject = "New Member Registration - $name";
    $headers = "From: no-reply@tskvspartacus.nl\r\n";
    $headers .= "Reply-To: no-reply@tskvspartacus.nl\r\n";
    $headers .= "Content-Type: text/html; charset=UTF-8\r\n";

    // Email content for admin
    $admin_message = "
    <html>
    <body>
        <h2>New Member Registration</h2>
        <p><strong>Name:</strong> $name</p>
        <p><strong>Email:</strong> $email</p>
        <p><strong>Phone:</strong> $phone</p>
        <p><strong>Membership Type:</strong> $membership</p>
        <p><strong>Signature:</strong> $signature</p>
        <p><strong>Status:</strong> Membership Confirmed (No verification needed)</p>
    </body>
    </html>";

    // Send email to admin
    if (mail($admin_email, $subject, $admin_message, $headers)) {
        echo json_encode(["status" => "success"]);
    } else {
        echo json_encode(["status" => "error", "message" => "Failed to send email."]);
    }
} else {
    echo json_encode(["status" => "error", "message" => "Invalid request."]);
}
?>
