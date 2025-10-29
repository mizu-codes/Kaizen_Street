const nodemailer = require('nodemailer');

const sendVerificationEmail = async (email, otp) => {
    try {
        if (!email || email.trim() === '') {
            console.error('Cannot send email: recipient email is missing or invalid.');
            return false;
        }

        const transporter = nodemailer.createTransport({
            service: 'gmail',
            port: 587,
            secure: false,
            requireTLS: true,
            auth: {
                user: process.env.NODEMAILER_EMAIL,
                pass: process.env.NODEMAILER_PASSWORD
            }
        });

        const info = await transporter.sendMail({
            from: `"Kaizen Street" <${process.env.NODEMAILER_EMAIL}>`,
            to: email,
            subject: 'Reset your password',
            html: `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap" rel="stylesheet">
</head>
<body style="margin: 0; padding: 0; font-family: 'Poppins', Arial, sans-serif;">
    <!-- Preheader - hidden from view -->
    <span style="color:#ffffff;display:none;height:0;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;visibility:hidden;width:0;">Verify your email with OTP &#847; &zwnj; &nbsp; &zwnj; &nbsp; &zwnj; &nbsp; &zwnj; &nbsp; &zwnj; &nbsp; &zwnj; &nbsp; &zwnj; &nbsp; &zwnj; &nbsp; &zwnj; &nbsp; &zwnj; &nbsp; &zwnj; &nbsp; &zwnj; &nbsp; &zwnj; &nbsp; &zwnj; &nbsp; &zwnj; &nbsp; &zwnj; &nbsp; &zwnj; &nbsp; &zwnj; &nbsp; &zwnj; &nbsp; &zwnj; &nbsp;</span>

    <table width="100%" cellpadding="0" cellspacing="0" style="padding: 40px 20px;">
        <tr>
            <td align="center">
                <table width="600" cellpadding="0" cellspacing="0" style="background: #ffffff; border-radius: 20px; overflow: hidden; box-shadow: 0 20px 60px rgba(0, 0, 0, 1).3);">
                    
                    <!-- Header with anime-inspired design -->
                    <tr>
                        <td style="background: linear-gradient(135deg, #007b5e 0%, #005a47 50%, #003d31 100%); padding: 0; position: relative; border-radius: 20px 20px 0 0;">
                            <div style="padding: 40px 30px; text-align: center; position: relative;">
                                <!-- Logo Container with your brand design -->
                                <div style="background: rgba(0, 0, 0, 1); width: 115px; height: 115px; border-radius: 50%; margin: 0 auto 20px; display: inline-flex; align-items: center; justify-content: center; backdrop-filter: blur(10px); border: 3px solid rgba(255,255,255,0.3); position: relative; overflow: hidden; font-size: 0; mso-hide: all;">
                                    <!-- Red banner with Japanese characters -->
                                    <div style="position: absolute; left: 0; top: 0; bottom: 0; width: 35%; background: #ca1616ff; display: flex; align-items: center; justify-content: center; font-size: 0; mso-hide: all;">
                                        <div style="color: white; font-size: 28px; font-weight: 700; writing-mode: vertical-rl; letter-spacing: 2px;">改善</div>
                                    </div>
                                    <!-- Text part -->
                                    <div style="margin-left: 10px; margin-top: 29px; color: white; font-weight: 700; font-size: 25px; line-height: 1.2;">
                                        Kai<br>Zen
                                    </div>
                                </div>
                                <h1 style="margin: 0; font-size: 32px; color: #ffffff; font-weight: 700; letter-spacing: 2px; text-shadow: 2px 2px 4px rgba(0,0,0,0.2);">
                                    KAIZEN STREET
                                </h1>
                                <p style="margin: 8px 0 0; font-size: 14px; color: rgba(255,255,255,0.9); font-weight: 500; letter-spacing: 3px; text-transform: uppercase;">
                                    Anime Clothing
                                </p>
                            </div>
                            <!-- Decorative wave -->
                            <svg style="display: block; width: 100%; height: 30px;" viewBox="0 0 1200 120" preserveAspectRatio="none">
                                <path d="M0,0 C200,60 400,60 600,30 C800,0 1000,0 1200,30 L1200,120 L0,120 Z" fill="#ffffff"></path>
                            </svg>
                        </td>
                    </tr>

                    <!-- Main Content -->
                    <tr>
                        <td style="padding: 40px 50px; background: #000000;">
                            <h2 style="margin: 0 0 20px; font-size: 26px; color: #2d3748; font-weight: 600;">
                                Email Verification 
                            </h2>
                            
                            <p style="margin: 0 0 25px; line-height: 1.8; color: #4a5568; font-size: 16px;">
                                Hey there! 👋<br><br>
                                We received a request to reset your password. To continue, please verify your email using the one-time password below.
                            </p>

                            <!-- OTP Box with enhanced styling -->
                            <table width="100%" cellpadding="0" cellspacing="0" style="margin: 30px 0;">
                                <tr>
                                    <td align="center">
                                        <div style="background: linear-gradient(135deg, #f7fafc 0%, #edf2f7 100%); border: 3px dashed #ffff; border-radius: 16px; padding: 30px; display: inline-block; box-shadow: 0 8px 25px rgba(255,77,77,0.15);">
                                            <p style="margin: 0 0 12px; font-size: 14px; color: #718096; font-weight: 500; letter-spacing: 1px; text-transform: uppercase;">
                                                Your OTP Code
                                            </p>
                                            <div style="font-size: 42px; font-weight: 700; letter-spacing: 12px; color: #ff4d4d; text-shadow: 2px 2px 4px rgba(255,77,77,0.1); font-family: 'Courier New', monospace;">
                                                ${otp}
                                            </div>
                                        </div>
                                    </td>
                                </tr>
                            </table>

                            <!-- Warning box -->
                            <div style="background: linear-gradient(135deg, #fff5f5 0%, #fed7d7 100%); border-left: 4px solid #ff4d4d; padding: 20px; border-radius: 8px; margin: 25px 0;">
                                <p style="margin: 0; color: #c53030; font-size: 14px; line-height: 1.6;">
                                    ⚠️ <strong>Important:</strong> This OTP will expire in <strong>5 minutes</strong>. Never share this code with anyone, including Kaizen Street.
                                </p>
                            </div>

                            <!-- CTA Button -->
                            <table width="100%" cellpadding="0" cellspacing="0" style="margin: 35px 0 20px;">
                                <tr>
                                    <td align="center">
                                        <a href="https://kaizenstreet.store" style="display: inline-block; background: #007b5e; color: #ffffff; text-decoration: none; padding: 16px 40px; border-radius: 50px; font-weight: 600; font-size: 16px; box-shadow: 0 8px 20px rgba(255,77,77,0.3); transition: all 0.3s ease;">
                                            Visit Kaizen Street →
                                        </a>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>

                    <!-- Footer -->
                    <tr>
                        <td style="background: linear-gradient(135deg, #007b5e 0%, #005a47 50%, #003d31 100%); padding: 30px; text-align: center; border-radius: 0 0 20px 20px;">
                            <p style="margin: 0 0 15px; color: #e2e8f0; font-size: 13px; line-height: 1.6;">
                                If you didn't request this password reset, you can safely ignore this email.<br>
                                Your password will remain unchanged.
                            </p>
                            <div style="border-top: 1px solid rgba(255,255,255,0.1); margin: 20px 0; padding-top: 20px;">
                                <p style="margin: 0 0 8px; color: #ffffffff; font-size: 12px; font-weight: 500;">
                                    © ${new Date().getFullYear()} Kaizen Street. All rights reserved.
                                </p>
                                <p style="margin: 0; color: #e2e8f0; font-size: 11px;">
                                    Anime clothing for the culture
                                </p>
                            </div>
                        </td>
                    </tr>

                </table>
            </td>
        </tr>
    </table>
</body>
</html>
`
        });

        return info.accepted.length > 0;
    } catch (error) {
        console.error('Error sending email:', error);
        return false;
    }
};

module.exports = { sendVerificationEmail };