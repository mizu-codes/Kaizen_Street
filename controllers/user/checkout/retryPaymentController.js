const mongoose = require('mongoose');
const Razorpay = require("razorpay");
const Product = require('../../../models/productSchema');
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

        let addressData = order.address;
        if (typeof addressData === 'string' || (addressData && addressData._id)) {
            const addressId = typeof addressData === 'string' ? addressData : addressData._id;
            const addressDoc = await Address.findOne({ _id: addressId, userId });

            if (!addressDoc) {
                return res.status(400).json({
                    success: false,
                    message: 'Address not found. Please add a new address.'
                });
            }

            addressData = {
                userName: addressDoc.userName,
                phoneNumber: addressDoc.phoneNumber,
                altPhoneNumber: addressDoc.altPhoneNumber || null,
                houseNo: addressDoc.houseNo,
                locality: addressDoc.locality,
                landmark: addressDoc.landmark || null,
                city: addressDoc.city,
                state: addressDoc.state,
                pincode: addressDoc.pincode,
                addressType: addressDoc.addressType || 'home'
            };

            await Order.findByIdAndUpdate(orderId, { address: addressData });
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

        const hasCompleteAddress = order.address &&
            order.address.userName &&
            order.address.phoneNumber &&
            order.address.city &&
            order.address.pincode;

        if (!hasCompleteAddress) {

            const Address = require('../../../models/addressSchema');
            const addressDoc = await Address.findOne({ userId: userId, isDefault: true }) ||
                await Address.findOne({ userId: userId }).sort({ createdAt: -1 });

            if (!addressDoc) {
                return res.status(400).json({
                    success: false,
                    message: 'No delivery address found. Please add an address first.'
                });
            }

            order.address = {
                userName: addressDoc.userName,
                phoneNumber: addressDoc.phoneNumber,
                altPhoneNumber: addressDoc.altPhoneNumber || null,
                houseNo: addressDoc.houseNo,
                locality: addressDoc.locality,
                landmark: addressDoc.landmark || null,
                city: addressDoc.city,
                state: addressDoc.state,
                pincode: addressDoc.pincode,
                addressType: addressDoc.addressType || 'home'
            };
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

const createFailedPaymentOrder = async (req, res) => {
    try {
        const userId = req.session.userId;
        const { addressId, couponData } = req.body;

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: 'Not authenticated'
            });
        }

        const address = await Address.findOne({ _id: addressId, userId });

        if (!address) {
            return res.status(400).json({
                success: false,
                message: 'Invalid address'
            });
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
            return res.status(400).json({
                success: false,
                message: 'Cart is empty'
            });
        }

        const validItems = cart.items.filter(item => {
            const product = item.productId;
            return product && !product.isBlocked && product.status === 'active' && product.category;
        });

        const orderItems = validItems.map((item) => {
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
                status: 'Payment Failed'
            };
        });

        const totalAmount = orderItems.reduce((sum, i) => sum + i.subtotal, 0);

        let discount = 0;
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

        const order = new Order({
            user: userId,
            address: addressSnapshot,
            items: orderItems,
            totalAmount: totalAmount,
            discount: discount,
            paymentMethod: "razorpay",
            paymentStatus: "unpaid",
            status: "Payment Failed",
            coupon: couponId ? {
                couponId: couponId,
                couponCode: couponData.couponCode,
                discountAmount: discount
            } : null,
            paymentDetails: {
                payment_failed_at: new Date(),
                error_reason: 'User cancelled payment or payment declined'
            }
        });

        await order.save();

        return res.json({
            success: true,
            orderId: order._id,
            message: 'Failed order saved. You can retry from your orders page.'
        });

    } catch (error) {
        console.error('Create failed order error:', error);
        return res.status(500).json({
            success: false,
            message: 'Error saving failed order',
            error: error.message
        });
    }
};

module.exports = {
    retryPayment,
    retryPaymentOrders,
    verifyRetryPayment,
    createFailedPaymentOrder
};