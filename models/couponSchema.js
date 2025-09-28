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
    description: {
        type: String,
        trim: true
    },
    usageType: {
        type: String,
        enum: ['once', 'multiple'],
        default: 'once'
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
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        orderId: {
            type: mongoose.Schema.Types.ObjectId, ref: 'Order'
        },
        appliedDate: {
            type: Date, default: Date.now
        }
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
        enum: ['active', 'inactive'],
        default: 'upcoming'
    },
}, { timestamps: true })

const Coupon = mongoose.model('Coupon', couponSchema)
module.exports = Coupon;