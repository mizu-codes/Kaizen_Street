const Coupon = require('../../../models/couponSchema');
const User = require('../../../models/userSchema');

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
            coupons,
            user: user || null,
            userId: userId || null,
            usedCouponsCount,
            wishlistItemCount: req.session?.wishlistItemCount || 0,
            cartItemCount: req.session?.cartItemCount || 0
        });
    } catch (err) {
        console.error('Error loading user coupons:', err);
        return res.render('profile-coupon', {
            coupons: [],
            user: null,
            userId: req.session?.userId || null,
            usedCouponsCount: 0,
            wishlistItemCount: 0,
            cartItemCount: 0,
            error: ['Failed to load coupons']
        });
    }
};

module.exports = {
    loadCouponPage
};