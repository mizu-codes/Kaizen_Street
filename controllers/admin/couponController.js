const Coupon = require('../../models/couponSchema');

const loadCouponPage = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 5;
        const search = req.query.search ? String(req.query.search).trim() : '';
        const statusFilter = req.query.status ? String(req.query.status).trim() : '';

        const filter = {};
        if (search) {
            filter.$or = [
                { couponName: { $regex: search, $options: 'i' } },
                { couponCode: { $regex: search, $options: 'i' } }
            ];
        }
        if (statusFilter) {
            filter.status = statusFilter;
        }

        const total = await Coupon.countDocuments(filter);
        const coupons = await Coupon.find(filter)
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .lean();

        const now = new Date();
        const mapped = coupons.map(c => {
            const activeDate = new Date(c.activeDate);
            const expireDate = new Date(c.expireDate);

            let computedStatus;
            if (c.status === 'inactive') computedStatus = 'inactive';
            else computedStatus = 'active';

            const appliedCount = Array.isArray(c.appliedUsers) ? c.appliedUsers.length : 0;
            const remainingUses = (typeof c.limit === 'number' ? c.limit : 0) - appliedCount;

            return {
                ...c,
                computedStatus,
                appliedCount,
                remainingUses: remainingUses < 0 ? 0 : remainingUses
            };
        });

        return res.render('coupon', {
            coupons: mapped,
            currentPage: page,
            totalPages: Math.ceil(total / limit),
            totalCoupons: total,
            search,
            statusFilter,
            success: req.flash ? req.flash('success') : [],
            error: req.flash ? req.flash('error') : [],
            user: req.session?.admin || req.session?.user || null
        });
    } catch (err) {
        console.error('Error loading coupon page:', err);
        if (req.flash) req.flash('error', 'Something went wrong while loading coupons.');
        return res.render('admin/coupon', {
            coupons: [],
            currentPage: 1,
            totalPages: 0,
            totalCoupons: 0,
            search: '',
            statusFilter: '',
            success: [],
            error: ['Server error'],
            user: req.session?.admin || req.session?.user || null
        });
    }
}


const addCoupon = async (req, res) => {
    try {

        const {
            couponName,
            couponCode,
            description,
            usageType,
            activeDate,
            expireDate,
            limit,
            discountPrice,
            minimumPrice,
            status
        } = req.body || {};

        if (!couponName || !couponCode || !activeDate || !expireDate || typeof discountPrice === 'undefined' || typeof limit === 'undefined') {
            return res.status(400).json({ success: false, message: 'Missing required fields' });
        }

        const code = String(couponCode).trim().toUpperCase();
        const name = String(couponName).trim();
        const desc = description ? String(description).trim() : '';
        const usage = usageType || 'once';
        const start = new Date(activeDate);
        const end = new Date(expireDate);
        const usageLimit = parseInt(limit, 10);
        const discount = Number(discountPrice);
        const minPrice = Number(minimumPrice || 0);
        const st = status || 'active';

        if (isNaN(start.getTime()) || isNaN(end.getTime())) {
            return res.status(400).json({ success: false, message: 'Invalid start or expire date' });
        }
        if (end <= start) {
            return res.status(400).json({ success: false, message: 'Expire date must be after start date' });
        }
        if (isNaN(usageLimit) || usageLimit < 0) {
            return res.status(400).json({ success: false, message: 'Invalid usage limit' });
        }
        if (isNaN(discount) || discount <= 0) {
            return res.status(400).json({ success: false, message: 'Invalid discount price' });
        }
        if (isNaN(minPrice) || minPrice < 0) {
            return res.status(400).json({ success: false, message: 'Invalid minimum price' });
        }

        if (discount >= minPrice) {
            return res.status(400).json({ success: false, message: 'Offer price should be less than minimum price' });
        }

        const existing = await Coupon.findOne({
            $or: [{ couponCode: code }, { couponName: name }]
        }).lean();

        if (existing) {
            const field = (existing.couponCode === code) ? 'Coupon code' : 'Coupon name';
            return res.status(400).json({ success: false, message: `${field} already exists` });
        }

        const newCoupon = new Coupon({
            couponName: name,
            couponCode: code,
            description: desc,
            usageType: usage,
            activeDate: start,
            expireDate: end,
            limit: usageLimit,
            appliedUsers: [],
            discountPrice: discount,
            minimumPrice: minPrice,
            status: st
        });

        await newCoupon.save();

        return res.json({ success: true, message: 'Coupon added successfully' });
    } catch (err) {
        console.error('Error in addCoupon:', err);

        if (err.code === 11000) {
            return res.status(400).json({ success: false, message: 'Coupon name or code already exists' });
        }

        if (err.name === 'ValidationError') {
            const msg = Object.values(err.errors).map(e => e.message).join(', ');
            return res.status(400).json({ success: false, message: msg });
        }

        return res.status(500).json({ success: false, message: 'Server error' });
    }
};


const deleteCoupon = async (req, res) => {
    try {
        const id = req.params.id;
        if (!id) return res.status(400).json({ success: false, message: 'Coupon id required' });

        const deleted = await Coupon.findByIdAndDelete(id).lean();
        if (!deleted) return res.status(404).json({ success: false, message: 'Coupon not found' });

        return res.json({ success: true, message: 'Coupon deleted' });
    } catch (err) {
        console.error('Error in deleteCoupon:', err);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
};

const getCouponData = async (req, res) => {
    try {
        const id = req.params.id;
        if (!id) return res.status(400).json({ success: false, message: 'Invalid id' });

        const coupon = await Coupon.findById(id).lean();
        if (!coupon) return res.status(404).json({ success: false, message: 'Coupon not found' });

        return res.json({ success: true, coupon });
    } catch (err) {
        console.error('getCouponData error:', err);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
};

const updateCoupon = async (req, res) => {
    try {
        const id = req.params.id;
        const {
            couponName,
            couponCode,
            description,
            usageType,
            activeDate,
            expireDate,
            limit,
            discountPrice,
            minimumPrice,
            status
        } = req.body;


        if (!couponName || !couponCode || !activeDate || !expireDate || typeof discountPrice === 'undefined' || typeof limit === 'undefined') {
            return res.status(400).json({ success: false, message: 'Missing required fields' });
        }

        const code = String(couponCode).trim().toUpperCase();
        const name = String(couponName).trim();
        const desc = description ? String(description).trim() : '';
        const usage = usageType || 'once';
        const start = new Date(activeDate);
        const end = new Date(expireDate);
        const usageLimit = parseInt(limit, 10);
        const discount = Number(discountPrice);
        const minPrice = Number(minimumPrice || 0);
        const st = status || 'active';

        if (isNaN(start.getTime()) || isNaN(end.getTime())) {
            return res.status(400).json({ success: false, message: 'Invalid start or expire date' });
        }
        if (end <= start) {
            return res.status(400).json({ success: false, message: 'Expire date must be after start date' });
        }
        if (isNaN(usageLimit) || usageLimit < 0) {
            return res.status(400).json({ success: false, message: 'Invalid usage limit' });
        }
        if (isNaN(discount) || discount <= 0) {
            return res.status(400).json({ success: false, message: 'Invalid discount price' });
        }
        if (isNaN(minPrice) || minPrice < 0) {
            return res.status(400).json({ success: false, message: 'Invalid minimum price' });
        }

        if (discount >= minPrice) {
            return res.status(400).json({ success: false, message: 'Offer price should be less than minimum price' });
        }

        const existing = await Coupon.findOne({
            _id: { $ne: id },
            $or: [{ couponCode: code }, { couponName: name }]
        }).lean();

        if (existing) {
            const field = (existing.couponCode === code) ? 'Coupon code' : 'Coupon name';
            return res.status(400).json({ success: false, message: `${field} already exists` });
        }

        const updateData = {
            couponName: name,
            couponCode: code,
            description: desc,
            usageType: usage,
            activeDate: start,
            expireDate: end,
            limit: usageLimit,
            discountPrice: discount,
            minimumPrice: minPrice,
            status: st
        };

        const coupon = await Coupon.findByIdAndUpdate(id, updateData, { new: true });

        if (!coupon) return res.status(404).json({ success: false, message: 'Coupon not found' });

        res.json({ success: true, message: 'Coupon updated successfully' });
    } catch (err) {
        console.error('Error in updateCoupon:', err);

        if (err.code === 11000) {
            return res.status(400).json({ success: false, message: 'Coupon name or code already exists' });
        }

        if (err.name === 'ValidationError') {
            const msg = Object.values(err.errors).map(e => e.message).join(', ');
            return res.status(400).json({ success: false, message: msg });
        }

        res.status(500).json({ success: false, message: 'Server error' });
    }
};


module.exports = {
    loadCouponPage,
    addCoupon,
    deleteCoupon,
    getCouponData,
    updateCoupon
}