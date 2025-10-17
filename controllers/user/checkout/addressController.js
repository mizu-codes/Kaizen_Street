const Address = require('../../../models/addressSchema');

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
        console.error('Edit page error', error);
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
    setDefaultAddress,
    deleteAddress,
    editAddressPage,
    updateAddress,
}