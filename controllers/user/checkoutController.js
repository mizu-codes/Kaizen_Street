const mongoose = require('mongoose');
const Razorpay = require("razorpay");
const User = require('../../models/userSchema');
const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema');
const Cart = require('../../models/cartSchema');
const Coupon = require('../../models/couponSchema');
const Address = require('../../models/addressSchema');
const Order = require('../../models/orderSchema');
const Wallet = require('../../models/walletSchema');
const WalletTransaction = require('../../models/walletTransactionSchema');
const Transaction = require('../../models/transactionSchema');
const crypto = require("crypto");
require('dotenv').config();

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

function getBestOfferForProduct(product) {
    try {
        const productOffer = product.productOffer || 0;
        const categoryOffer = product.category?.categoryOffer || 0;

        const maxOffer = Math.max(productOffer, categoryOffer);

        if (maxOffer === 0) {
            return {
                hasOffer: false,
                discountPercentage: 0,
                offerType: null,
                originalPrice: product.regularPrice,
                finalPrice: product.regularPrice,
                discountAmount: 0
            };
        }

        let offerType;
        if (categoryOffer > productOffer) {
            offerType = 'category';
        } else if (productOffer > categoryOffer) {
            offerType = 'product';
        } else {
            offerType = 'category';
        }

        const discountAmount = (product.regularPrice * maxOffer) / 100;
        const finalPrice = product.regularPrice - discountAmount;

        return {
            hasOffer: true,
            discountPercentage: maxOffer,
            offerType: offerType,
            originalPrice: product.regularPrice,
            finalPrice: Math.round(finalPrice * 100) / 100,
            discountAmount: Math.round(discountAmount * 100) / 100
        };

    } catch (error) {
        console.error('Error calculating best offer for product:', error);
        return {
            hasOffer: false,
            discountPercentage: 0,
            offerType: null,
            originalPrice: product.regularPrice,
            finalPrice: product.regularPrice,
            discountAmount: 0
        };
    }
}

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
                    select: 'categoryName categoryOffer status',
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

        validItems.reverse();

        const items = validItems.map(item => {
            const product = item.productId;

            const offerInfo = getBestOfferForProduct(product);
            const currentBestPrice = offerInfo.hasOffer ? offerInfo.finalPrice : product.regularPrice;

            const finalPrice = Math.min(item.price, currentBestPrice);

            return {
                id: product._id,
                name: product.productName,
                image: product.productImage[0] || 'placeholder.jpg',
                price: finalPrice,
                originalPrice: product.regularPrice,
                quantity: item.quantity,
                size: item.size || 'M',
                subtotal: finalPrice * item.quantity,
                hasOffer: offerInfo.hasOffer,
                discountPercentage: offerInfo.discountPercentage,
                offerType: offerInfo.offerType
            };
        });

        const rawTotal = items.reduce((sum, i) => sum + i.subtotal, 0);
        const discount = cartDoc.discount || 0;
        const total = rawTotal - discount;

        return res.render('checkout', {
            addresses,
            cart: { items, discount, total, rawTotal },
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
        const { addressId, paymentMethod, couponData } = req.body;

        const validMethods = ['cod', 'razorpay', 'wallet'];
        if (!validMethods.includes(paymentMethod)) {
            return res.status(400).json({ success: false, message: 'Invalid payment method.' });
        }

        const address = await Address.findOne({ _id: addressId, userId });
        if (!address) {
            return res.status(400).json({ success: false, message: 'Invalid address selected.' });
        }

        const cart = await Cart.findOne({ userId }).populate({
            path: 'items.productId',
            populate: {
                path: 'category',
                model: 'Category',
                select: 'categoryName categoryOffer status',
                match: { status: 'active' }
            }
        });

        if (!cart || cart.items.length === 0) {
            return res.status(400).json({ success: false, message: 'Your cart is empty.' });
        }

        const validCartItems = cart.items.filter(item => {
            const product = item.productId;
            return product && typeof product === 'object' && !product.isBlocked &&
                product.status === 'active' && product.category;
        });

        if (validCartItems.length === 0) {
            return res.status(400).json({ success: false, message: 'No valid items to place order.' });
        }

        const orderItems = validCartItems.map(item => {
            const product = item.productId;

            const offerInfo = getBestOfferForProduct(product);
            const currentBestPrice = offerInfo.hasOffer ? offerInfo.finalPrice : product.regularPrice;

            const finalPrice = Math.min(item.price, currentBestPrice);

            return {
                product: product._id,
                name: product.productName || 'Unknown',
                price: finalPrice,
                quantity: item.quantity,
                size: item.size,
                image: product.productImage?.[0] || '',
                subtotal: finalPrice * item.quantity
            };
        });

        const totalAmount = orderItems.reduce((sum, i) => sum + i.subtotal, 0);
        let discount = cart.discount || 0;
        let couponId = null;

        if (couponData && couponData.couponCode) {
            const coupon = await Coupon.findOne({
                couponCode: couponData.couponCode,
                status: 'active'
            });

            if (!coupon) {
                return res.status(400).json({
                    success: false,
                    message: 'Coupon is no longer valid'
                });
            }

            const now = new Date();
            if (now < new Date(coupon.activeDate) || now > new Date(coupon.expireDate)) {
                return res.status(400).json({
                    success: false,
                    message: 'Coupon has expired'
                });
            }

            if (coupon.appliedUsers.length >= coupon.limit) {
                return res.status(400).json({
                    success: false,
                    message: 'Coupon usage limit reached'
                });
            }

            const hasUsed = coupon.appliedUsers.some(user =>
                user.userId && user.userId.toString() === userId.toString()
            );

            if (hasUsed && coupon.usageType === 'once') {
                return res.status(400).json({
                    success: false,
                    message: 'You have already used this coupon'
                });
            }

            if (totalAmount < coupon.minimumPrice) {
                return res.status(400).json({
                    success: false,
                    message: `Minimum order amount of ₹${coupon.minimumPrice} required`
                });
            }

            discount = Math.min(coupon.discountPrice, totalAmount);
            couponId = coupon._id;
        }

        const finalAmount = totalAmount - discount;

        for (let item of validCartItems) {
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
                    totalAmount: totalAmount,
                    discount,
                    paymentMethod: 'wallet',
                    paymentStatus: 'paid',
                    status: 'Placed',
                    coupon: couponId ? {
                        couponId: couponId,
                        couponCode: couponData.couponCode,
                        discountAmount: discount
                    } : null
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

                if (couponId) {
                    await Coupon.findByIdAndUpdate(couponId, {
                        $push: {
                            appliedUsers: {
                                userId: userId,
                                orderId: order._id,
                                appliedDate: new Date()
                            }
                        }
                    }, { session });
                }

                for (let item of validCartItems) {
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
                    totalAmount: totalAmount,
                    discount,
                    paymentMethod,
                    paymentStatus: 'unpaid',
                    status: 'Placed',
                    coupon: couponId ? {
                        couponId: couponId,
                        couponCode: couponData.couponCode,
                        discountAmount: discount
                    } : null
                });
                await order.save({ session });

                await createOrderTransaction({
                    userId: userId,
                    orderId: order._id,
                    totalAmount: finalAmount,
                    paymentMethod: 'cod',
                    itemCount: orderItems.length
                }, session);

                if (couponId) {
                    await Coupon.findByIdAndUpdate(couponId, {
                        $push: {
                            appliedUsers: {
                                userId: userId,
                                orderId: order._id,
                                appliedDate: new Date()
                            }
                        }
                    }, { session });
                }

                for (let item of validCartItems) {
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
        const { addressId, couponData } = req.body;

        const address = await Address.findOne({ _id: addressId, userId });
        if (!address) {
            return res.status(400).json({ success: false, message: "Invalid address" });
        }

        const cart = await Cart.findOne({ userId }).populate({
            path: "items.productId",
            populate: {
                path: 'category',
                model: 'Category',
                select: 'categoryName categoryOffer status',
                match: { status: 'active' }
            }
        });

        if (!cart || cart.items.length === 0) {
            return res.status(400).json({ success: false, message: "Cart is empty" });
        }

        const validItems = cart.items.filter(item => {
            const product = item.productId;
            return product && !product.isBlocked && product.status === 'active' && product.category;
        });

        for (let item of validItems) {
            const product = item.productId;
            const size = item.size;
            if ((product.stock[size] || 0) < item.quantity) {
                return res.status(400).json({
                    success: false,
                    message: `Not enough stock for ${product.productName} - Size ${size}`,
                });
            }
        }

        const itemsWithOffers = validItems.map(item => {
            const product = item.productId;
            const offerInfo = getBestOfferForProduct(product);
            const currentBestPrice = offerInfo.hasOffer ? offerInfo.finalPrice : product.regularPrice;
            const finalPrice = Math.min(item.price, currentBestPrice);

            return {
                ...item,
                calculatedPrice: finalPrice,
                subtotal: finalPrice * item.quantity
            };
        });

        const rawTotal = itemsWithOffers.reduce((sum, item) => sum + item.subtotal, 0);

        let discount = 0;
        let couponId = null;

        if (couponData && couponData.couponCode) {
            const coupon = await Coupon.findOne({
                couponCode: couponData.couponCode,
                status: 'active'
            });

            if (!coupon) {
                return res.status(400).json({
                    success: false,
                    message: 'Coupon is no longer valid'
                });
            }

            const now = new Date();
            if (now < new Date(coupon.activeDate) || now > new Date(coupon.expireDate)) {
                return res.status(400).json({
                    success: false,
                    message: 'Coupon has expired'
                });
            }

            if (coupon.appliedUsers.length >= coupon.limit) {
                return res.status(400).json({
                    success: false,
                    message: 'Coupon usage limit reached'
                });
            }

            const hasUsed = coupon.appliedUsers.some(user =>
                user.userId && user.userId.toString() === userId.toString()
            );

            if (hasUsed && coupon.usageType === 'once') {
                return res.status(400).json({
                    success: false,
                    message: 'You have already used this coupon'
                });
            }

            if (rawTotal < coupon.minimumPrice) {
                return res.status(400).json({
                    success: false,
                    message: `Minimum order amount of ₹${coupon.minimumPrice} required`
                });
            }

            discount = Math.min(coupon.discountPrice, rawTotal);
            couponId = coupon._id;

            cart.discount = discount;
            await cart.save();
        } else {
            discount = cart.discount || 0;
        }

        const finalAmount = rawTotal - discount;

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
            finalAmount: finalAmount,
            discount: discount,
            rawTotal: rawTotal
        });
    } catch (err) {
        console.error("Razorpay Order Error:", err);
        res.status(500).json({ success: false, message: "Payment order failed" });
    }
};

const verifyRazorpayPayment = async (req, res) => {
    try {
        const userId = req.session.userId;
        const { razorpay_payment_id, razorpay_order_id, razorpay_signature, addressId, couponData } = req.body;

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

        const cart = await Cart.findOne({ userId }).populate({
            path: "items.productId",
            populate: {
                path: 'category',
                model: 'Category',
                select: 'categoryName categoryOffer status',
                match: { status: 'active' }
            }
        });

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

        const orderItems = cart.items.map((item) => {
            const product = item.productId;
            const offerInfo = getBestOfferForProduct(product);
            const currentBestPrice = offerInfo.hasOffer ? offerInfo.finalPrice : product.regularPrice;
            const finalPrice = Math.min(item.price, currentBestPrice);

            return {
                product: product._id,
                name: product.productName,
                price: finalPrice,
                quantity: item.quantity,
                size: item.size,
                image: product.productImage?.[0] || "",
                subtotal: finalPrice * item.quantity,
            };
        });

        const totalAmount = orderItems.reduce((sum, i) => sum + i.subtotal, 0);

        let discount = cart.discount || 0;
        let couponId = null;

        if (couponData && couponData.couponCode) {
            const coupon = await Coupon.findOne({
                couponCode: couponData.couponCode,
                status: 'active'
            });

            if (coupon) {
                discount = Math.min(coupon.discountPrice, totalAmount);
                couponId = coupon._id;
            }
        }

        const finalAmount = totalAmount - discount;

        const session = await mongoose.startSession();
        session.startTransaction();

        try {
            const order = new Order({
                user: userId,
                address: addressId,
                items: orderItems,
                totalAmount: totalAmount,
                discount: discount,
                paymentMethod: "razorpay",
                paymentStatus: "paid",
                status: "Placed",
                coupon: couponId ? {
                    couponId: couponId,
                    couponCode: couponData.couponCode,
                    discountAmount: discount
                } : null,
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

            if (couponId) {
                await Coupon.findByIdAndUpdate(couponId, {
                    $push: {
                        appliedUsers: {
                            userId: userId,
                            orderId: order._id,
                            appliedDate: new Date()
                        }
                    }
                }, { session });
            }

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

const applyCoupon = async (req, res) => {
    try {
        const { couponCode } = req.body;
        const userId = req.session.userId;

        if (!couponCode || !userId) {
            return res.status(400).json({
                success: false,
                message: 'Coupon code and user required'
            });
        }

        const code = String(couponCode).trim().toUpperCase();

        const coupon = await Coupon.findOne({
            couponCode: code,
            status: 'active'
        });

        if (!coupon) {
            return res.status(400).json({
                success: false,
                message: 'Invalid coupon code'
            });
        }

        const now = new Date();
        if (now < new Date(coupon.activeDate) || now > new Date(coupon.expireDate)) {
            return res.status(400).json({
                success: false,
                message: 'Coupon is not valid at this time'
            });
        }

        const hasUsed = coupon.appliedUsers.some(user =>
            user.userId && user.userId.toString() === userId.toString()
        );

        if (hasUsed && coupon.usageType === 'once') {
            return res.status(400).json({
                success: false,
                message: 'You have already used this coupon'
            });
        }

        const appliedCount = coupon.appliedUsers.length;
        if (appliedCount >= coupon.limit) {
            return res.status(400).json({
                success: false,
                message: 'Coupon usage limit exceeded'
            });
        }

        const cartDoc = await Cart.findOne({ userId }).populate({
            path: 'items.productId',
            populate: {
                path: 'category',
                model: 'Category',
                select: 'categoryName categoryOffer status',
                match: { status: 'active' }
            }
        });

        if (!cartDoc || cartDoc.items.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Cart is empty'
            });
        }

        const validItems = cartDoc.items.filter(item => {
            const product = item.productId;
            return product && !product.isBlocked && product.status === 'active' && product.category;
        });

        if (validItems.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No valid items in cart'
            });
        }

        const itemsWithOffers = validItems.map(item => {
            const product = item.productId;
            const offerInfo = getBestOfferForProduct(product);
            const currentBestPrice = offerInfo.hasOffer ? offerInfo.finalPrice : product.regularPrice;
            const finalPrice = Math.min(item.price, currentBestPrice);

            return {
                ...item,
                calculatedPrice: finalPrice,
                subtotal: finalPrice * item.quantity
            };
        });

        const rawTotal = itemsWithOffers.reduce((sum, item) => sum + item.subtotal, 0);
        const existingDiscount = cartDoc.discount || 0;

        if (rawTotal < coupon.minimumPrice) {
            return res.status(400).json({
                success: false,
                message: `Minimum order amount of ₹${coupon.minimumPrice} required`
            });
        }

        const discount = Math.min(coupon.discountPrice, rawTotal);
        const finalTotal = rawTotal - discount;

        cartDoc.discount = discount;
        await cartDoc.save();

        return res.json({
            success: true,
            message: 'Coupon applied successfully',
            data: {
                couponCode: coupon.couponCode,
                couponName: coupon.couponName,
                discount: discount,
                originalTotal: rawTotal,
                finalTotal: finalTotal
            }
        });

    } catch (error) {
        console.error('Error applying coupon:', error);
        return res.status(500).json({
            success: false,
            message: 'Server error while applying coupon'
        });
    }
};

const removeCoupon = async (req, res) => {
    try {
        const userId = req.session.userId;

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: 'User not authenticated'
            });
        }

        const cart = await Cart.findOne({ userId }).populate({
            path: 'items.productId',
            populate: {
                path: 'category',
                model: 'Category',
                select: 'categoryName categoryOffer status',
                match: { status: 'active' }
            }
        });

        if (cart) {
            const validItems = cart.items.filter(item => {
                const product = item.productId;
                return product && !product.isBlocked && product.status === 'active' && product.category;
            });

            const itemsWithOffers = validItems.map(item => {
                const product = item.productId;
                const offerInfo = getBestOfferForProduct(product);
                const currentBestPrice = offerInfo.hasOffer ? offerInfo.finalPrice : product.regularPrice;
                const finalPrice = Math.min(item.price, currentBestPrice);

                return {
                    ...item,
                    calculatedPrice: finalPrice,
                    subtotal: finalPrice * item.quantity
                };
            });

            const rawTotal = itemsWithOffers.reduce((sum, item) => sum + item.subtotal, 0);

            cart.discount = 0;
            await cart.save();

            return res.json({
                success: true,
                message: 'Coupon removed successfully',
                data: {
                    originalTotal: rawTotal,
                    finalTotal: rawTotal,
                    discount: 0
                }
            });
        }

        return res.json({
            success: false,
            message: 'Cart not found'
        });

    } catch (error) {
        console.error('Error removing coupon:', error);
        return res.status(500).json({
            success: false,
            message: 'Server error while removing coupon'
        });
    }
};

const validateCoupon = async (req, res) => {
    try {
        const { couponCode } = req.query;

        if (!couponCode) {
            return res.status(400).json({
                success: false,
                message: 'Coupon code required'
            });
        }

        const code = String(couponCode).trim().toUpperCase();

        const coupon = await Coupon.findOne({
            couponCode: code,
            status: 'active'
        });

        if (!coupon) {
            return res.status(400).json({
                success: false,
                message: 'Invalid coupon code'
            });
        }

        const now = new Date();
        const isActive = now >= new Date(coupon.activeDate) && now <= new Date(coupon.expireDate);
        const remainingUses = coupon.limit - coupon.appliedUsers.length;

        return res.json({
            success: true,
            data: {
                couponName: coupon.couponName,
                couponCode: coupon.couponCode,
                description: coupon.description,
                discountPrice: coupon.discountPrice,
                minimumPrice: coupon.minimumPrice,
                isActive: isActive,
                remainingUses: remainingUses,
                expireDate: coupon.expireDate
            }
        });

    } catch (error) {
        console.error('Error validating coupon:', error);
        return res.status(500).json({
            success: false,
            message: 'Server error while validating coupon'
        });
    }
};


const orderFailedPage = async (req, res) => {
    try {
        const userId = req.session.userId;
        const { reason, orderId, code, couponCode } = req.query;

        let failedOrder = null;

        if (orderId && mongoose.Types.ObjectId.isValid(orderId)) {
            failedOrder = await Order.findById(orderId).populate('address').lean();
        }

        if (!failedOrder) {
            const cart = await Cart.findOne({ userId }).populate({
                path: 'items.productId',
                populate: {
                    path: 'category',
                    model: 'Category',
                    select: 'categoryName categoryOffer status',
                    match: { status: 'active' }
                }
            });

            const addresses = await Address.find({ userId });
            const selectedAddress = addresses.find(addr => addr.isDefault) || addresses[0];

            if (cart && cart.items.length > 0) {
                const validItems = cart.items.filter(item =>
                    item.productId && !item.productId.isBlocked &&
                    item.productId.status === 'active'
                );

                if (validItems.length > 0) {
                    const itemsWithOffers = validItems.map(item => {
                        const product = item.productId;
                        const offerInfo = getBestOfferForProduct(product);
                        const currentBestPrice = offerInfo.hasOffer ? offerInfo.finalPrice : product.regularPrice;
                        const finalPrice = Math.min(item.price, currentBestPrice);

                        return {
                            product: product._id,
                            name: product.productName,
                            image: product.productImage?.[0] || '',
                            price: finalPrice,
                            quantity: item.quantity,
                            subtotal: finalPrice * item.quantity,
                            size: item.size,
                            status: 'Payment Failed'
                        };
                    });

                    const cartTotal = itemsWithOffers.reduce((sum, item) => sum + item.subtotal, 0);

                    let discount = 0;
                    let appliedCoupon = null;

                    if (couponCode) {
                        const coupon = await Coupon.findOne({
                            couponCode: couponCode,
                            status: 'active'
                        });

                        if (coupon) {
                            const now = new Date();
                            const isValid = now >= new Date(coupon.activeDate) &&
                                now <= new Date(coupon.expireDate) &&
                                cartTotal >= coupon.minimumPrice;

                            if (isValid) {
                                discount = Math.min(coupon.discountPrice, cartTotal);
                                appliedCoupon = coupon.couponCode;
                            }
                        }
                    } else {
                        discount = cart.discount || 0;
                    }

                    const newOrder = new Order({
                        user: userId,
                        items: itemsWithOffers,
                        address: selectedAddress ? selectedAddress._id : null,
                        totalAmount: cartTotal,
                        discount: discount,
                        couponApplied: appliedCoupon,
                        paymentMethod: 'razorpay',
                        paymentStatus: 'unpaid',
                        status: 'Payment Failed',
                    });

                    failedOrder = await newOrder.save();
                }
            }
        }

        const failureReasons = {
            'cancelled': 'Payment was cancelled',
            'verification_failed': 'Payment verification failed',
            'payment_failed': 'Payment could not be processed',
        };

        const errorMessage = failureReasons[reason] || 'Payment failed';
        const hasItems = failedOrder && failedOrder.items && failedOrder.items.length > 0;

        return res.render('order-failed', {
            errorMessage,
            orderId: failedOrder ? failedOrder._id : null,
            order: failedOrder,
            errorCode: code || null,
            hasItems
        });

    } catch (error) {
        console.error('Load payment failed page error:', error);
        return res.status(500).send('Internal server error');
    }
};

const retryPayment = async (req, res) => {
    try {
        const userId = req.session.userId;
        const { addressId, couponData } = req.body;

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: 'Not authenticated'
            });
        }

        const address = await Address.findOne({ _id: addressId, userId: userId });
        if (!address) {
            return res.status(400).json({
                success: false,
                message: 'Invalid address'
            });
        }

        const cart = await Cart.findOne({ userId: userId }).populate({
            path: 'items.productId',
            populate: {
                path: 'category',
                model: 'Category',
                select: 'categoryName categoryOffer status',
                match: { status: 'active' }
            }
        });

        if (!cart || cart.items.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Cart is empty'
            });
        }

        const validItems = cart.items.filter(item => {
            const p = item.productId;
            return p && !p.isBlocked && p.status === 'active' && p.category;
        });

        if (validItems.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No valid items in cart'
            });
        }

        for (const item of validItems) {
            const product = item.productId;
            const size = item.size;
            const available = (product.stock && product.stock[size]) ? product.stock[size] : 0;

            if (available < item.quantity) {
                return res.status(400).json({
                    success: false,
                    message: `${product.productName} (Size: ${size}) is now out of stock. Please update your cart.`
                });
            }
        }

        const itemsWithOffers = validItems.map(item => {
            const product = item.productId;
            const offerInfo = getBestOfferForProduct(product);
            const currentBestPrice = offerInfo?.hasOffer ? offerInfo.finalPrice : product.regularPrice;
            const finalPrice = Math.min(item.price, currentBestPrice);

            return {
                productId: product._id,
                name: product.productName,
                price: finalPrice,
                quantity: item.quantity,
                size: item.size,
                subtotal: finalPrice * item.quantity
            };
        });

        const rawTotal = itemsWithOffers.reduce((sum, item) => sum + item.subtotal, 0);

        let discount = 0;
        if (couponData && couponData.couponCode) {
            const coupon = await Coupon.findOne({
                couponCode: couponData.couponCode,
                status: 'active'
            });

            if (!coupon) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid coupon'
                });
            }

            const now = new Date();
            if (now < new Date(coupon.activeDate) || now > new Date(coupon.expireDate)) {
                return res.status(400).json({
                    success: false,
                    message: 'Coupon expired'
                });
            }

            if (rawTotal < coupon.minimumPrice) {
                return res.status(400).json({
                    success: false,
                    message: `Minimum order ₹${coupon.minimumPrice} required`
                });
            }

            discount = Math.min(coupon.discountPrice, rawTotal);
        } else {
            discount = cart.discount || 0;
        }

        const finalAmount = Math.max(0, rawTotal - discount);

        return res.json({
            success: true,
            message: 'Ready to retry payment',
            summary: {
                items: itemsWithOffers,
                rawTotal,
                discount,
                finalAmount
            }
        });

    } catch (error) {
        console.error('retryPayment error:', error);
        return res.status(500).json({
            success: false,
            message: 'Server error while preparing retry payment'
        });
    }
};

const retryPaymentOrders = async (req, res) => {
    try {
        const userId = req.session.userId;
        const { orderId } = req.params;

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: 'Not authenticated'
            });
        }

        if (!orderId || !mongoose.Types.ObjectId.isValid(orderId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid order ID format'
            });
        }

        const order = await Order.findOne({
            _id: orderId,
            user: userId,
            status: 'Payment Failed'
        }).lean();

        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Order not found or not eligible for retry'
            });
        }

        if (order.paymentMethod !== 'razorpay') {
            return res.status(400).json({
                success: false,
                message: 'Only Razorpay payments can be retried'
            });
        }

        const totalAmount = Number(order.totalAmount) || 0;
        const discount = Number(order.discount) || 0;
        const finalAmount = Math.max(0, totalAmount - discount);

        if (finalAmount === 0) {
            await Order.findByIdAndUpdate(orderId, {
                paymentStatus: 'paid',
                status: 'Placed',
                'paymentDetails.retry_automatic': true,
                'paymentDetails.payment_verified_at': new Date()
            }, { new: true });

            return res.json({
                success: true,
                message: 'Order completed (no payment required)',
                orderId
            });
        }

        if (finalAmount < 1 || finalAmount > 500000) {
            return res.status(400).json({
                success: false,
                message: 'Invalid order amount for payment'
            });
        }

        if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
            console.error('Razorpay credentials missing');
            return res.status(500).json({
                success: false,
                message: 'Payment gateway not configured properly'
            });
        }

        const shortId = orderId.toString().slice(-8);
        const timestamp = Date.now().toString().slice(-6);
        const receipt = `RTY${shortId}${timestamp}`;

        const options = {
            amount: Math.round(finalAmount * 100),
            currency: 'INR',
            receipt: receipt,
            notes: {
                order_id: orderId.toString(),
                retry_attempt: 'true',
                user_id: userId.toString()
            }
        };

        let razorpayOrder;
        try {
            razorpayOrder = await razorpay.orders.create(options);
        } catch (razorpayError) {
            console.error('Razorpay API Error Details:', {
                error: razorpayError,
                message: razorpayError.message,
                statusCode: razorpayError.statusCode,
                description: razorpayError.error?.description
            });

            const errorMsg = razorpayError.error?.description ||
                razorpayError.message ||
                'Failed to create payment order';

            return res.status(502).json({
                success: false,
                message: errorMsg,
                details: 'Please try again or contact support if the issue persists'
            });
        }

        try {
            await Order.findByIdAndUpdate(orderId, {
                $set: {
                    'paymentDetails.retry_razorpay_order_id': razorpayOrder.id,
                    'paymentDetails.retry_attempt_at': new Date(),
                    'paymentDetails.retry_receipt': receipt
                }
            });
        } catch (updateError) {
            console.error('Failed to update order with retry details:', updateError);
        }

        return res.json({
            success: true,
            key: process.env.RAZORPAY_KEY_ID,
            razorpayOrderId: razorpayOrder.id,
            amount: razorpayOrder.amount,
            orderId: orderId,
            currency: razorpayOrder.currency,
            receipt: receipt
        });

    } catch (error) {
        console.error('retryPaymentOrders critical error:', {
            error: error.message,
            stack: error.stack,
            name: error.name
        });

        return res.status(500).json({
            success: false,
            message: 'Server error while processing payment retry',
            details: 'Please refresh the page and try again'
        });
    }
};

const verifyRetryPayment = async (req, res) => {
    try {
        const userId = req.session.userId;
        const {
            razorpay_payment_id,
            razorpay_order_id,
            razorpay_signature,
            orderId
        } = req.body;

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: 'Not authenticated'
            });
        }

        if (!razorpay_payment_id || !razorpay_order_id ||
            !razorpay_signature || !orderId) {
            return res.status(400).json({
                success: false,
                message: 'Missing required payment verification data'
            });
        }

        const hmac = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET);
        hmac.update(razorpay_order_id + '|' + razorpay_payment_id);
        const generatedSignature = hmac.digest('hex');

        if (generatedSignature !== razorpay_signature) {
            console.error('Signature mismatch:', {
                generated: generatedSignature,
                received: razorpay_signature
            });
            return res.status(400).json({
                success: false,
                message: 'Payment verification failed - Invalid signature'
            });
        }

        const order = await Order.findOne({ _id: orderId, user: userId });
        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }

        if (order.paymentStatus === 'paid' && order.status === 'Placed') {
            return res.json({
                success: true,
                orderId: order._id,
                message: 'Order already processed successfully'
            });
        }

        const session = await mongoose.startSession();
        session.startTransaction();

        try {
            order.paymentStatus = 'paid';
            order.status = 'Placed';
            order.paymentDetails = {
                ...(order.paymentDetails || {}),
                razorpay_order_id,
                razorpay_payment_id,
                razorpay_signature,
                payment_verified_at: new Date(),
                retry_successful: true
            };

            for (const item of order.items) {
                if (item.status === 'Placed') {
                    continue;
                }

                if (item.status === 'Payment Failed' || !item.status) {
                    item.status = 'Placed';
                }

                const product = await Product.findById(item.product).session(session);
                if (!product) {
                    throw new Error(`Product not found: ${item.product}`);
                }

                const size = item.size;
                const available = product.stock?.[size] || 0;

                if (available < item.quantity) {
                    throw new Error(
                        `Insufficient stock for ${product.productName} (Size: ${size}). Available: ${available}, Required: ${item.quantity}`
                    );
                }

                product.stock[size] = available - item.quantity;
                await product.save({ session });

            }

            await order.save({ session });

            const finalAmount = (order.totalAmount || 0) - (order.discount || 0);
            await createOrderTransaction({
                userId,
                orderId: order._id,
                totalAmount: finalAmount,
                paymentMethod: 'razorpay',
                itemCount: order.items.length,
                razorpay_payment_id,
                razorpay_order_id
            }, session);

            await Cart.deleteOne({ userId: userId }, { session });

            await session.commitTransaction();

            return res.json({
                success: true,
                orderId: order._id,
                message: 'Payment successful! Order placed.'
            });

        } catch (transactionError) {
            await session.abortTransaction();
            console.error('Transaction failed:', transactionError);

            return res.status(500).json({
                success: false,
                message: transactionError.message || 'Payment processing failed',
                details: 'Your payment was successful but order processing failed. Please contact support.'
            });
        } finally {
            session.endSession();
        }

    } catch (error) {
        console.error('verifyRetryPayment error:', error);
        return res.status(500).json({
            success: false,
            message: 'Verification failed. Please contact support with your payment details.'
        });
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
    verifyRazorpayPayment,
    applyCoupon,
    removeCoupon,
    validateCoupon,
    orderFailedPage,
    retryPayment,
    retryPaymentOrders,
    verifyRetryPayment,
};