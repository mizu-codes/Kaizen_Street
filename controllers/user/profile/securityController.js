const User = require('../../../models/userSchema');
const bcrypt = require('bcrypt');
const otpGenerator = require('../../../utils/otpGenerator');
const { sendVerificationEmail } = require('../../../utils/emailUtils');


const verifyProfileOtp = async (req, res) => {
  try {
    const { otp } = req.body;
    const sessionOtp = req.session.profileOtp;
    const updateData = req.session.pendingProfileData;

    if (!sessionOtp || !updateData) {
      return res.status(400).json({ success: false, message: 'Session expired or invalid' });
    }

    if (Date.now() > req.session.otpExpires) {
      return res.status(400).json({ success: false, message: 'OTP expired' });
    }

    if (otp !== sessionOtp) {
      return res.status(400).json({ success: false, message: 'Invalid OTP' });
    }

    const existingUser = await User.findOne({ email: updateData.email });
    if (existingUser && existingUser._id.toString() !== updateData.userId) {
      return res.status(400).json({
        success: false,
        message: 'This email is already in use by another account',
      });
    }

    await User.findByIdAndUpdate(updateData.userId, {
      name: updateData.name,
      email: updateData.email,
      phone: updateData.phone,
      avatarUrl: updateData.avatarUrl,
      avatarPublicId: updateData.avatarPublicId
    });

    req.session.profileOtp = null;
    req.session.pendingProfileData = null;

    res.json({ success: true, redirectUrl: '/userProfile' });
  } catch (error) {
    console.error('OTP verification error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

const securityProfile = async (req, res) => {
  try {
    const userId = req.session.userId;
    if (!userId) {
      return res.redirect('/login')
    }
    const userdata = await User.findById(userId);
    if (!userdata) {
      req.session.destroy()
      return res.redirect('/login')
    }

    res.render('profile-password', {
      user: userdata,
      isGoogleUser: !!userdata.googleId
    })
  }
  catch (error) {
    console.log('error loading profile security page', error);
    return res.redirect('/pageNotFound')
  }
}

const updatePassword = async (req, res) => {
  try {
    const userId = req.session.userId;
    let currentPassword, newPassword, confirmPassword;

    if (req.body && typeof req.body === 'object') {
      ({ currentPassword, newPassword, confirmPassword } = req.body);
    } else {
      return res.status(400).json({
        success: false,
        errors: { general: 'Request data not received properly. Please try again.' }
      });
    }

    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({
        success: false,
        errors: { general: 'All fields are required.' }
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      req.session.destroy();
      return res.status(401).json({
        success: false,
        errors: { general: 'Session expired. Please login again.' }
      });
    }

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({
        success: false,
        errors: { currentPassword: 'Current password is incorrect.' }
      });
    }

    if (newPassword === currentPassword) {
      return res.status(400).json({
        success: false,
        errors: { newPassword: 'New password must differ from current.' }
      });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({
        success: false,
        errors: { confirmPassword: 'Passwords do not match.' }
      });
    }

    const strongRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/;
    if (!strongRegex.test(newPassword)) {
      return res.status(400).json({
        success: false,
        errors: { newPassword: 'Must be 8+ chars, with upper, lower, number & symbol.' }
      });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await User.updateOne({ _id: userId }, { $set: { password: hashedPassword } });

    return res.status(200).json({
      success: true,
      message: 'Password updated successfully!'
    });
  } catch (error) {
    console.error('Password update error:', error);
    return res.status(500).json({
      success: false,
      errors: { general: 'Internal server error. Please try again later.' }
    });
  }
};


module.exports = {
  verifyProfileOtp,
  securityProfile,
  updatePassword
};
