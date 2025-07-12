const mongoose = require('mongoose')
const { Schema } = mongoose;

const couponSchema = new Schema({
    couponName: {
        type: String,
        required: true,
        unique: true
    },
    couponCode: {
        type: String,
        required: true,
        unique: true
    },
    activeDate: {
        type: Date,
        required: true
    },
    expireDate: {
        type: Date,
        required: true
    },
    limit: {
        type: Number,
        required: true
    },
    appliedUsers: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    discountPrice: {
        type: Number,
        required: true
    },
    minimumPrice: {
        type: Number,
        required: true
    },
    status: {
        type: String,
        enum: ['active', 'expired', 'upcoming', 'disabled'],
        default: 'upcoming'
    },
    isList: {
        type: Boolean,
        default: true
    },
}, { timestamps: true })

const Coupon = mongoose.model('Coupon', couponSchema)
module.exports = Coupon;