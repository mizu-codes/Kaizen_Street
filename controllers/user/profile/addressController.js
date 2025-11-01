const User = require('../../../models/userSchema');
const Address = require('../../../models/addressSchema');

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
    const from = req.query.from || 'profile';

    const user = await User.findById(userId);

    res.render('add-address', {
      user,
      errors: {},
      old: {},
      from
    });

  } catch (error) {
    console.error('Error adding address', error);
    res.redirect('/pageNotFound')
  }
}

const createAddress = async (req, res) => {
  try {
    const userId = req.session.userId;
    const from = req.query.from;

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
    if (!userName?.trim()) {
      errors.userName = 'Name is required';
    } else if (!/^[A-Za-z\s]{1,20}$/.test(userName.trim())) {
      errors.userName = 'Name must be only letters and spaces, max 20 characters';
    }
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
          old: req.body,
          from
        });
      }
    }

    if (!landmark?.trim()) req.body.landmark = undefined;
    if (!altPhoneNumber?.trim()) req.body.altPhoneNumber = undefined;

    await Address.create({ userId, ...req.body });

    if (req.xhr || req.headers.accept.includes('json')) {
      return res.json({ success: true });
    } else {
      if (from === 'checkout') {
        return res.redirect('/checkout/place-order');
      }
      return res.redirect('/profile/addresses');
    }
  } catch (error) {
    console.error(error);
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
    if (!req.body.userName?.trim()) {
      errors.userName = 'Name is required';
    } else if (!/^[A-Za-z\s]{1,20}$/.test(req.body.userName.trim())) {
      errors.userName = 'Name must be only letters and spaces, max 20 characters';
    }
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
  addressPage,
  addAddress,
  createAddress,
  setDefaultAddress,
  deleteAddress,
  editAddressPage,
  updateAddress
}