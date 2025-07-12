const mongoose = require('mongoose')
const { Schema } = mongoose

const appliedUserSchema = new Schema({
    couponId: {
        type: Schema.Types.ObjectId,
        ref: 'Coupon',
        required: true,
        index: true
    },
    userId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    appliedCount: {
        type: Number,
        default: 0
    }
}, {
    timestamps: true
});

const AppliedUser = mongoose.model('AppliedUser', appliedUserSchema)
module.exports = AppliedUser;