const User = require('../../models/userSchema');
const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema');
const Cart = require('../../models/cartSchema');
const Address = require('../../models/addressSchema');
const Order = require('../../models/orderSchema');

const loadCheckoutPage = async (req, res) => {
    try {
        const userId = req.session.userId;

        const addresses = await Address.find({ userId })
            .sort({ isDefault: -1 })
            .lean();

        const cartDoc = await Cart.findOne({ userId })
            .populate({
                path: 'items.productId',
                populate: {
                    path: 'category',
                    model: 'Category'
                }
            })
            .lean();

        if (!cartDoc || cartDoc.items.length === 0) {
            return res.render('checkout', {
                addresses,
                cart: { items: [], discount: 0, total: 0 }
            });
        }

        const validItems = cartDoc.items.filter(item => {
            const product = item.productId;
            return product && !product.isBlocked && product.status === 'active';
        });

        validItems.reverse()

        const items = validItems.map(item => {
            const product = item.productId;
            return {
                id: product._id,
                name: product.productName,
                image: product.productImage[0] || 'placeholder.jpg',
                price: item.price,
                originalPrice: product.regularPrice,
                quantity: item.quantity,
                subtotal: item.price * item.quantity
            };
        });

        const rawTotal = items.reduce((sum, i) => sum + i.subtotal, 0);
        const discount = cartDoc.discount || 0;

        const total = rawTotal - discount;

        return res.render('checkout', {
            addresses,
            cart: { items, discount, total }
        });

    } catch (error) {
        console.error('Error loading checkout page:', error);
        return res.status(500).render('error', {
            message: 'Failed to load checkout page',
            error
        });
    }
};

const placeOrder = async (req, res) => {
    try {
        const userId = req.session.userId;
        const { addressId, paymentMethod } = req.body;

        const validMethods = ['cod', 'razorpay', 'wallet'];
        if (!validMethods.includes(paymentMethod)) {
            return res.status(400).json({ success: false, message: 'Invalid payment method.' });
        }

        const address = await Address.findOne({ _id: addressId, userId });
        if (!address) {
            return res.status(400).json({ success: false, message: 'Invalid address selected.' });
        }

        const cart = await Cart.findOne({ userId }).populate('items.productId');
        if (!cart || cart.items.length === 0) {
            return res.status(400).json({ success: false, message: 'Your cart is empty.' });
        }

        const orderItems = cart.items.map(item => {
            const product = item.productId;

            if (!product || typeof product !== 'object') return null;

            return {
                product: product._id,
                name: product.productName || 'Unknown',
                price: item.price,
                quantity: item.quantity,
                size: item.size,
                image: product.productImage?.[0] || '',
                subtotal: item.price * item.quantity
            };
        }).filter(Boolean);

        if (orderItems.length === 0) {
            return res.status(400).json({ success: false, message: 'No valid items to place order.' });
        }

        const totalAmount = orderItems.reduce((sum, i) => sum + i.subtotal, 0);
        const discount = cart.discount || 0;
        const finalAmount = totalAmount - discount;

        for (let item of cart.items) {
            const product = item.productId;
            const size = item.size;
            const currentStock = product.stock[size] || 0;

            if (currentStock < item.quantity) {
                return res.status(400).json({
                    success: false,
                    message: `Not enough stock for ${product.productName} - Size ${size}`
                });
            }
        }

        if (paymentMethod !== 'cod') {
            return res.json({
                success: true,
                paymentMethod,
                orderDetails: {
                    amount: finalAmount,
                    currency: 'INR',
                    items: orderItems,
                    addressId
                }
            });
        }

        const order = new Order({
            user: userId,
            address: address._id,
            items: orderItems,
            totalAmount: finalAmount,
            discount,
            paymentMethod,
            status: 'Placed'
        });
        await order.save();

        for (let item of cart.items) {
            const product = item.productId;
            const size = item.size;
            product.stock[size] -= item.quantity;
            await product.save();
        }

        await Cart.deleteOne({ userId });
       
        return res.json({ success: true, orderId: order._id });

    } catch (error) {
        console.error('Place order error:', error);
        return res.status(500).json({ success: false, message: 'Server error. Try again.' });
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

const orderSuccessPage = async (req, res) => {
    try {
        const orderId = req.params.orderId;
        const userId = req.session.userId;

        const order = await Order.findOne({ _id: orderId, user: userId }); 

        if (!order) {
            return res.status(404).render('page-404', { message: 'Order not found' });
        }

        res.render('order-success', { order });
    } catch (error) {
        console.error('Error loading order success page:', error);
        res.status(500).render('user/500', { message: 'Something went wrong' });
    }
};



module.exports = {
    loadCheckoutPage,
    placeOrder,
    setDefaultAddress,
    deleteAddress,
    editAddressPage,
    updateAddress,
    orderSuccessPage
};
