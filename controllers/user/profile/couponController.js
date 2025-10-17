const User = require('../../../models/userSchema');
const Coupon = require('../../../models/couponSchema');
const Cart = require('../../../models/cartSchema');
require('dotenv').config();


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


const loadCouponPage = async (req, res) => {
    try {
        const now = new Date();
        const userId = req.session?.userId;

        const coupons = await Coupon.find({
            status: 'active',
            expireDate: { $gte: now }
        }).lean();

        let user = null;
        let usedCouponsCount = 0;

        if (userId) {
            user = await User.findById(userId).lean();

            if (user && user.appliedCoupons) {
                usedCouponsCount = user.appliedCoupons.length;
            } else {
                const allCoupons = await Coupon.find({}).lean();
                usedCouponsCount = allCoupons.reduce((total, coupon) => {
                    if (coupon.appliedUsers) {
                        const userApplied = coupon.appliedUsers.some(applied =>
                            applied.userId && applied.userId.toString() === userId.toString()
                        );
                        return total + (userApplied ? 1 : 0);
                    }
                    return total;
                }, 0);
            }
        }

        return res.render('profile-coupon', {
            coupons: coupons || [],
            user: user,
            userId: userId,
            usedCouponsCount: usedCouponsCount,
            wishlistItemCount: req.session?.wishlistItemCount || 0,
            cartItemCount: req.session?.cartItemCount || 0
        });
    } catch (err) {
        console.error('Error loading user coupons:', err);
        return res.render('profile-coupon', {
            coupons: [],
            user: null,
            userId: req.session?.userId,
            usedCouponsCount: 0,
            wishlistItemCount: 0,
            cartItemCount: 0,
            error: 'Failed to load coupons'
        });
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


module.exports = {
    loadCouponPage,
    applyCoupon,
    removeCoupon,
    validateCoupon
};