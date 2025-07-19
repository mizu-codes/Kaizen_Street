const User = require('../../models/userSchema');
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
    console.error('Error loading edit profile page:', err);
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


module.exports = {
  userProfile,
  updateProfile,
  saveProfile,
  verifyProfileOtp
};
