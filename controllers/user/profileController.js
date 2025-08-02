const User = require('../../models/userSchema');
const Address = require('../../models/addressSchema');
const Order = require('../../models/orderSchema');
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

    const orderCount   = await Order.countDocuments({ user: userId });
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

const addressPage = async (req, res) => {

  try {
    const userId = req.session.userId;
    const addresses = await Address.find({ userId });

    res.render('profile-address', {
      addresses
    });

  } catch (error) {
    console.error('Error loading address page:', error);
    res.redirect('/pageNotFound');
  }
}

const addAddress = async (req, res) => {
  try {

    const userId = req.session.userId;

    const user = await User.findById(userId);

    res.render('add-address', {
      user,
      errors: {},
      old: {}
    });

  } catch (error) {
    console.error('Error adding address', error);
    res.redirect('/pageNotFound')
  }
}

const createAddress = async (req, res) => {
  try {
    const userId = req.session.userId;
    const {
      userName,
      phoneNumber,
      altPhoneNumber,
      houseNo,
      locality,
      landmark,
      city,
      state,
      pincode,
      addressType
    } = req.body;

    const errors = {};
    if (!userName?.trim()) errors.userName = 'Name is required';
    if (!/^\d{10}$/.test(phoneNumber)) errors.phoneNumber = '10 digits required';
    if (!/^\d{6}$/.test(pincode)) errors.pincode = '6 digits required';
    if (!houseNo?.trim()) errors.houseNo = 'House/flat info is required';
    if (!locality?.trim()) errors.locality = 'Locality is required';
    if (!city?.trim()) errors.city = 'City is required';
    if (!state?.trim()) errors.state = 'State is required';
    if (!['home', 'work', 'other'].includes(addressType))
      errors.addressType = 'Select home, work, or other';

    if (Object.keys(errors).length) {
      if (req.xhr || req.headers.accept.includes('json')) {
        return res.status(400).json({ success: false, errors });
      } else {
        const user = await User.findById(userId);
        return res.status(400).render('add-address', {
          user,
          errors,
          old: req.body
        });
      }
    }

    if (!landmark?.trim()) req.body.landmark = undefined;
    if (!altPhoneNumber?.trim()) req.body.altPhoneNumber = undefined;

    await Address.create({ userId, ...req.body });

    if (req.xhr || req.headers.accept.includes('json')) {
      return res.json({ success: true });
    } else {
      res.redirect('/profile/addresses');
    }

  } catch (err) {
    console.error(err);
    if (req.xhr || req.headers.accept.includes('json')) {
      return res.status(500).json({ success: false, message: 'Server error' });
    }
    res.status(500).render('/pageNotFound');
  }
};

const setDefaultAddress = async (req, res) => {
  try {

    const userId = req.session.userId;
    const { id } = req.params;

    await Address.updateMany({ userId }, { isDefault: false });
    await Address.findByIdAndUpdate(id, { isDefault: true });

    return res.json({ success: true });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false });
  }
}

const deleteAddress = async (req, res) => {
  try {
    const userId = req.session.userId;
    const { id } = req.params;

    const deleted = await Address.findOneAndDelete({ _id: id, userId });
    if (!deleted) {
      return res.status(404).json({ success: false, message: 'Address not found' });
    }
    return res.json({ success: true });

  } catch (error) {
    console.error('Delete address error:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
}

const editAddressPage = async (req, res) => {
    try {

        const userId = req.session.userId;
        const addr = await Address.findOne({ _id: req.params.id, userId });
        if (!addr) return res.redirect('/profile/addresses');

        const from = req.query.from || 'profile';

        res.render('edit-address', {
            address: addr,
            errors: {},
            old: addr.toObject(),
            from
        });

    } catch (error) {
        console.error('Edit page error', err);
        res.redirect('/pageNotFound');
    }
} 

const updateAddress = async (req, res) => {
  try {
    const userId = req.session.userId;
    const { id } = req.params;
    const from = req.query.from;

    const errors = {};
    if (!req.body.userName?.trim()) errors.userName = 'Name is required';

    if (Object.keys(errors).length) {
      return res.status(400).render('edit-address', {
        address: await Address.findById(id),
        errors,
        old: req.body,
        from
      });
    }

    const addr = await Address.findOne({ _id: id, userId });
    if (!addr) return res.status(404).send('Not found');

    Object.assign(addr, req.body);
    await addr.save();

    if (req.xhr || req.headers.accept.includes('json')) {
      return res.json({ success: true });
    }

    if (from === 'checkout') {
      return res.redirect('/checkout/place-order');
    }

    res.redirect('/profile/addresses');

  } catch (error) {
    console.error('Update error:', error);
    if (req.xhr || req.headers.accept.includes('json')) {
      return res.status(500).json({ success: false });
    }
    res.redirect('/pageNotFound');
  }
};



module.exports = {
  userProfile,
  updateProfile,
  saveProfile,
  verifyProfileOtp,
  securityProfile,
  updatePassword,
  addressPage,
  addAddress,
  createAddress,
  setDefaultAddress,
  deleteAddress,
  editAddressPage,
  updateAddress
};
