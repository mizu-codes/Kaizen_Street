const mongoose = require('mongoose');
const User = require('../../models/userSchema');
const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema');
const Cart = require('../../models/cartSchema');
const Address = require('../../models/addressSchema');
const Order = require('../../models/orderSchema');
const Wallet = require('../../models/walletSchema');
const WalletTransaction = require('../../models/walletTransactionSchema');
const Transaction = require('../../models/transactionSchema');
const crypto = require("crypto");
const env = require('dotenv').config();
const Razorpay = require("razorpay");

const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
});


const createOrderTransaction = async (orderData, session = null) => {
    try {
        const transactionData = {
            customerId: orderData.userId,
            orderId: orderData.orderId,
            amount: orderData.totalAmount,
            paymentMethod: orderData.paymentMethod,
            transactionStatus: orderData.paymentMethod === 'cod' ? 'pending' : 'success',
            type: 'order_payment',
            description: `Order payment for ${orderData.itemCount || 0} items`,
            gatewayTransactionId: orderData.razorpay_payment_id || null,
            gatewayOrderId: orderData.razorpay_order_id || null
        };

        if (session) {
            await Transaction.create([transactionData], { session });
        } else {
            await Transaction.create(transactionData);
        }
    } catch (error) {
        console.error('Error creating order transaction:', error);
        throw error;
    }
};

const loadCheckoutPage = async (req, res) => {
    try {
        const userId = req.session.userId;

        const addresses = await Address.find({ userId })
            .sort({ isDefault: -1 })
            .lean();

        let walletBalance = 0;
        const wallet = await Wallet.findOne({ userId, isActive: true, isBlocked: false });
        if (wallet) {
            walletBalance = wallet.balance;
        }

        const cartDoc = await Cart.findOne({ userId })
            .populate({
                path: 'items.productId',
                populate: {
                    path: 'category',
                    model: 'Category',
                    match: { status: 'active' }
                }
            })
            .lean();

        if (!cartDoc || cartDoc.items.length === 0) {
            return res.render('checkout', {
                addresses,
                cart: { items: [], discount: 0, total: 0 },
                walletBalance
            });
        }

        const validItems = cartDoc.items.filter(item => {
            const product = item.productId;
            return product && !product.isBlocked && product.status === 'active' && product.category;
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
            cart: { items, discount, total },
            walletBalance
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
     
        if (paymentMethod === 'wallet') {
            const wallet = await Wallet.findOne({ userId, isActive: true, isBlocked: false });

            if (!wallet) {
                return res.status(400).json({
                    success: false,
                    message: 'Wallet not found or inactive'
                });
            }

            if (wallet.balance < finalAmount) {
                return res.status(400).json({
                    success: false,
                    message: `Insufficient wallet balance. Available: ₹${wallet.balance.toFixed(2)}, Required: ₹${finalAmount.toFixed(2)}`
                });
            }

            const session = await mongoose.startSession();
            session.startTransaction();

            try {
                const order = new Order({
                    user: userId,
                    address: address._id,
                    items: orderItems,
                    totalAmount: finalAmount,
                    discount,
                    paymentMethod: 'wallet',
                    paymentStatus: 'paid',
                    status: 'Placed'
                });
                await order.save({ session });
            
                await createOrderTransaction({
                    userId: userId,
                    orderId: order._id,
                    totalAmount: finalAmount,
                    paymentMethod: 'wallet',
                    itemCount: orderItems.length
                }, session);

                const balanceBefore = wallet.balance;
                wallet.balance -= finalAmount;
                wallet.totalDebits += finalAmount;
                wallet.transactionCount += 1;
                wallet.lastTransactionAt = new Date();
                wallet.lastDebitAt = new Date();
                await wallet.save({ session });

                const walletTransaction = new WalletTransaction({
                    wallet: wallet._id,
                    user: userId,
                    type: 'debit',
                    amount: finalAmount,
                    description: `Payment for Order #${order._id.toString().slice(-8).toUpperCase()}`,
                    balanceBefore: balanceBefore,
                    balanceAfter: wallet.balance,
                    orderId: order._id,
                    paymentDetails: {
                        method: 'wallet'
                    },
                    status: 'completed',
                    processedAt: new Date(),
                    completedAt: new Date()
                });

                await walletTransaction.save({ session });

                for (let item of cart.items) {
                    const product = item.productId;
                    const size = item.size;
                    product.stock[size] -= item.quantity;
                    await product.save({ session });
                }

                await Cart.deleteOne({ userId }, { session });

                await session.commitTransaction();
                session.endSession();

                return res.json({ success: true, orderId: order._id });

            } catch (error) {
                await session.abortTransaction();
                session.endSession();
                console.error('Wallet payment transaction failed:', error);
                return res.status(500).json({
                    success: false,
                    message: 'Payment processing failed. Please try again.'
                });
            }
        }
        
        if (paymentMethod === 'cod') {
            const session = await mongoose.startSession();
            session.startTransaction();

            try {
                const order = new Order({
                    user: userId,
                    address: address._id,
                    items: orderItems,
                    totalAmount: finalAmount,
                    discount,
                    paymentMethod,
                    paymentStatus: 'unpaid',
                    status: 'Placed'
                });
                await order.save({ session });

                // 🔥 Create order transaction record
                await createOrderTransaction({
                    userId: userId,
                    orderId: order._id,
                    totalAmount: finalAmount,
                    paymentMethod: 'cod',
                    itemCount: orderItems.length
                }, session);

                for (let item of cart.items) {
                    const product = item.productId;
                    const size = item.size;
                    product.stock[size] -= item.quantity;
                    await product.save({ session });
                }

                await Cart.deleteOne({ userId }, { session });

                await session.commitTransaction();
                session.endSession();

                return res.json({ success: true, orderId: order._id });

            } catch (error) {
                await session.abortTransaction();
                session.endSession();
                console.error('COD order creation failed:', error);
                return res.status(500).json({
                    success: false,
                    message: 'Order creation failed. Please try again.'
                });
            }
        }

        return res.json({
            success: false,
            message: 'Please use appropriate payment endpoint for this method'
        });

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

const createRazorpayOrder = async (req, res) => {
    try {
        const userId = req.session.userId;
        const { addressId } = req.body;

        const address = await Address.findOne({ _id: addressId, userId });
        if (!address) {
            return res.status(400).json({ success: false, message: "Invalid address" });
        }

        const cart = await Cart.findOne({ userId }).populate("items.productId");
        if (!cart || cart.items.length === 0) {
            return res.status(400).json({ success: false, message: "Cart is empty" });
        }

        for (let item of cart.items) {
            const product = item.productId;
            const size = item.size;
            if ((product.stock[size] || 0) < item.quantity) {
                return res.status(400).json({
                    success: false,
                    message: `Not enough stock for ${product.productName} - Size ${size}`,
                });
            }
        }

        const orderItems = cart.items.map((item) => ({
            product: item.productId._id,
            name: item.productId.productName,
            price: item.price,
            quantity: item.quantity,
            size: item.size,
            image: item.productId.productImage?.[0] || "",
            subtotal: item.price * item.quantity,
        }));

        const totalAmount = orderItems.reduce((sum, i) => sum + i.subtotal, 0);
        const discount = cart.discount || 0;
        const finalAmount = totalAmount - discount;

        const options = {
            amount: finalAmount * 100,
            currency: "INR",
            receipt: "order_" + Date.now(),
        };

        const razorpayOrder = await razorpay.orders.create(options);

        return res.json({
            success: true,
            key: process.env.RAZORPAY_KEY_ID,
            orderId: razorpayOrder.id,
            amount: razorpayOrder.amount,
            addressId,
        });
    } catch (err) {
        console.error("Razorpay Order Error:", err);
        res.status(500).json({ success: false, message: "Payment order failed" });
    }
};

const verifyRazorpayPayment = async (req, res) => {
    try {
        const userId = req.session.userId;
        const { razorpay_payment_id, razorpay_order_id, razorpay_signature, addressId } = req.body;

        const hmac = crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET);
        hmac.update(razorpay_order_id + "|" + razorpay_payment_id);
        const generatedSignature = hmac.digest("hex");

        if (generatedSignature !== razorpay_signature) {
            return res.status(400).json({ success: false, message: "Payment verification failed" });
        }

        const address = await Address.findOne({ _id: addressId, userId });
        if (!address) {
            return res.status(400).json({ success: false, message: "Invalid address" });
        }

        const cart = await Cart.findOne({ userId }).populate("items.productId");
        if (!cart || cart.items.length === 0) {
            return res.status(400).json({ success: false, message: "Cart not found" });
        }

        for (let item of cart.items) {
            const product = item.productId;
            const size = item.size;
            if ((product.stock[size] || 0) < item.quantity) {
                return res.status(400).json({
                    success: false,
                    message: `Not enough stock for ${product.productName} - Size ${size}`,
                });
            }
        }

        const orderItems = cart.items.map((item) => ({
            product: item.productId._id,
            name: item.productId.productName,
            price: item.price,
            quantity: item.quantity,
            size: item.size,
            image: item.productId.productImage?.[0] || "",
            subtotal: item.price * item.quantity,
        }));

        const totalAmount = orderItems.reduce((sum, i) => sum + i.subtotal, 0);
        const discount = cart.discount || 0;
        const finalAmount = totalAmount - discount;

        const session = await mongoose.startSession();
        session.startTransaction();

        try {
            const order = new Order({
                user: userId,
                address: addressId,
                items: orderItems,
                totalAmount: finalAmount,
                discount,
                paymentMethod: "razorpay",
                paymentStatus: "paid",
                status: "Placed",
                paymentDetails: {
                    razorpay_order_id,
                    razorpay_payment_id,
                    razorpay_signature,
                    raw: req.body
                }
            });

            await order.save({ session });
          
            await createOrderTransaction({
                userId: userId,
                orderId: order._id,
                totalAmount: finalAmount,
                paymentMethod: 'razorpay',
                itemCount: orderItems.length,
                razorpay_payment_id: razorpay_payment_id,
                razorpay_order_id: razorpay_order_id
            }, session);

            for (let item of cart.items) {
                const product = item.productId;
                const size = item.size;
                product.stock[size] -= item.quantity;
                await product.save({ session });
            }

            await Cart.deleteOne({ userId }, { session });

            await session.commitTransaction();
            session.endSession();

            return res.json({ success: true, orderId: order._id });

        } catch (error) {
            await session.abortTransaction();
            session.endSession();
            console.error('Razorpay order creation failed:', error);
            return res.status(500).json({
                success: false,
                message: 'Payment processing failed. Please try again.'
            });
        }

    } catch (err) {
        console.error("Verify Payment Error:", err);
        res.status(500).json({ success: false, message: "Verification error" });
    }
};

module.exports = {
    loadCheckoutPage,
    placeOrder,
    setDefaultAddress,
    deleteAddress,
    editAddressPage,
    updateAddress,
    orderSuccessPage,
    createRazorpayOrder,
    verifyRazorpayPayment
};