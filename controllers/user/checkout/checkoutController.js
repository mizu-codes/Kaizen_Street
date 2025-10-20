const mongoose = require('mongoose');
const Razorpay = require("razorpay");
const Cart = require('../../../models/cartSchema');
const Coupon = require('../../../models/couponSchema');
const Address = require('../../../models/addressSchema');
const Order = require('../../../models/orderSchema');
const Wallet = require('../../../models/walletSchema');
const WalletTransaction = require('../../../models/walletTransactionSchema');
const Transaction = require('../../../models/transactionSchema');
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
            const now = new Date();
            const availableCouponsCount = await Coupon.countDocuments({
                status: 'active',
                activeDate: { $lte: now },
                expireDate: { $gte: now }
            });

            return res.render('checkout', {
                addresses,
                cart: { items: [], discount: 0, total: 0 },
                walletBalance,
                availableCouponsCount
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

        const now = new Date();
        const availableCouponsCount = await Coupon.countDocuments({
            status: 'active',
            activeDate: { $lte: now },
            expireDate: { $gte: now },
            limit: { $gt: 0 }
        });

        return res.render('checkout', {
            addresses,
            cart: { items, discount, total, rawTotal },
            walletBalance,
            availableCouponsCount
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

        const addressSnapshot = {
            userName: address.userName || '',
            phoneNumber: address.phoneNumber || '',
            altPhoneNumber: address.altPhoneNumber || null,
            houseNo: address.houseNo || '',
            locality: address.locality || '',
            landmark: address.landmark || null,
            city: address.city || '',
            state: address.state || '',
            pincode: address.pincode || '',
            addressType: address.addressType || 'home'
        };

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

        const outOfStockItems = [];

        for (let item of validCartItems) {
            const product = item.productId;
            const size = item.size;
            const currentStock = product.stock[size] || 0;

            if (currentStock < item.quantity) {
                outOfStockItems.push({
                    productName: product.productName,
                    size: size,
                    requestedQty: item.quantity,
                    availableStock: currentStock
                });
            }
        }

        if (outOfStockItems.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'Some items in your cart are out of stock',
                outOfStock: outOfStockItems
            });
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
                    address: addressSnapshot,
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

            if (finalAmount > 1000) {
                return res.status(400).json({
                    success: false,
                    message: 'Cash on Delivery is not available for orders above ₹1000. Please choose Razorpay or Wallet payment.'
                });
            }

            const session = await mongoose.startSession();
            session.startTransaction();

            try {
                const order = new Order({
                    user: userId,
                    address: addressSnapshot,
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

        const outOfStockItems = [];

        for (let item of validItems) {
            const product = item.productId;
            const size = item.size;
            const currentStock = product.stock[size] || 0;

            if (currentStock < item.quantity) {
                outOfStockItems.push({
                    productName: product.productName,
                    size: size,
                    requestedQty: item.quantity,
                    availableStock: currentStock
                });
            }
        }

        if (outOfStockItems.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'Some items in your cart are out of stock',
                outOfStock: outOfStockItems
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

        const addressSnapshot = {
            userName: address.userName || '',
            phoneNumber: address.phoneNumber || '',
            altPhoneNumber: address.altPhoneNumber || null,
            houseNo: address.houseNo || '',
            locality: address.locality || '',
            landmark: address.landmark || null,
            city: address.city || '',
            state: address.state || '',
            pincode: address.pincode || '',
            addressType: address.addressType || 'home'
        };


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
                address: addressSnapshot,
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

module.exports = {
    loadCheckoutPage,
    placeOrder,
    createRazorpayOrder,
    verifyRazorpayPayment,
};