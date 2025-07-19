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
            from: process.env.NODEMAILER_EMAIL,
            to: email,
            subject: 'Reset your password',
            html: `<p>Your OTP is <b>${otp}</b></p>`
        });

        return info.accepted.length > 0;
    } catch (error) {
        console.error('Error sending email:', error);
        return false;
    }
};

module.exports = { sendVerificationEmail };
