const User = require('../../models/userSchema');
const bcrypt = require('bcrypt');
const cloudinary = require('../../middlewares/cloudinary');
const { sendVerificationEmail } = require('../../utils/emailUtils');
const otpGenerator = require('../../utils/otpGenerator');

const userProfile = async (req, res) => {
  try {
    const userId = req.session.userId;
    if (!userId) {
      return res.redirect('/login');
    }

    const userData = await User.findById(userId);
    if (!userData) {
      req.session.destroy();
      return res.redirect('/login');
    }

    res.render('profile', {
      user: userData,
    });
  } catch (error) {
    console.error('Error retrieving profile data:', error);
    return res.redirect('/pageNotFound');
  }
};

const updateProfile = async (req, res) => {
  try {
    const userId = req.session.userId;
    if (!userId) return res.redirect('/login');

    const user = await User.findById(userId).lean();
    if (!user) {
      req.session.destroy();
      return res.redirect('/login')
    }

    res.render('profile-edit', { user });
  } catch (error) {
    console.error('Error loading edit profile page:', error);
    res.redirect('/userProfile');
  }
}

const saveProfile = async (req, res) => {
  try {
    console.log('Incoming email:', req.body.email);
    const userId = req.session.userId;
    const { name, email, phone } = req.body;

    const user = await User.findById(userId);
    if (!user) return res.redirect('/login');

    let avatarUrl = user.avatarUrl;
    let avatarPublicId = user.avatarPublicId;

    if (req.file) {
      if (avatarPublicId) {
        await cloudinary.uploader.destroy(avatarPublicId);
      }

      const uploadStream = () =>
        new Promise((resolve, reject) => {
          const stream = cloudinary.uploader.upload_stream(
            { folder: 'kaizen/profile-photos' },
            (error, result) => {
              if (result) resolve(result);
              else reject(error);
            }
          );
          stream.end(req.file.buffer);
        });

      const result = await uploadStream();
      avatarUrl = result.secure_url;
      avatarPublicId = result.public_id;
    }

    if (email !== user.email) {
      const otp = otpGenerator();
      console.log('Generated OTP for profile update:', otp);

      const emailSent = await sendVerificationEmail(email, otp);
      console.log('Email sent status:', emailSent);
      if (!emailSent) {
        return res.status(500).json({ success: false, message: 'Failed to send verification email' });
      }

      req.session.otpExpires = Date.now() + 5 * 60 * 1000;

      req.session.profileOtp = otp;
      req.session.pendingProfileData = {
        userId,
        name,
        email,
        phone,
        avatarUrl,
        avatarPublicId
      };

      return res.json({ emailChanged: true, message: 'OTP sent to new email' });
    }

    await User.findByIdAndUpdate(userId, {
      name,
      email,
      phone,
      avatarUrl,
      avatarPublicId
    });

    res.json({ success: true, redirectUrl: '/userProfile' });
  } catch (error) {
    console.error('Error saving profile:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

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
      user: userdata
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

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();

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
  userProfile,
  updateProfile,
  saveProfile,
  verifyProfileOtp,
  securityProfile,
  updatePassword
};
