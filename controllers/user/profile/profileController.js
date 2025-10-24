const User = require('../../../models/userSchema');
const Address = require('../../../models/addressSchema');
const Order = require('../../../models/orderSchema');
const cloudinary = require('../../../middlewares/cloudinary');
const otpGenerator = require('../../../utils/otpGenerator');
const { sendVerificationEmail } = require('../../../utils/emailUtils');

const userProfile = async (req, res) => {
  try {
    const userId = req.session.userId;
    if (!userId) {
      return res.redirect('/login');
    }

    const orderCount = await Order.countDocuments({ user: userId });
    const addressCount = await Address.countDocuments({ userId: userId });
    const userData = await User.findById(userId);

    if (!userData) {
      req.session.destroy();
      return res.redirect('/login');
    }

    res.render('profile', {
      user: userData,
      orderCount,
      addressCount
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
    const userId = req.session.userId;
    const { name, email, phone } = req.body;

    const user = await User.findById(userId);

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized. Please log in again.'
      });
    }

    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Name is required and cannot be empty.'
      });
    }

    if (!email || !email.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Email is required and cannot be empty.'
      });
    }

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

      const emailSent = await sendVerificationEmail(email, otp);
      
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

module.exports = {
  userProfile,
  updateProfile,
  saveProfile
}
