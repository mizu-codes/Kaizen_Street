const mongoose = require('mongoose')
const { Schema } = mongoose;

const offerSchema = new Schema({
    offerName: {
        type: String,
        required: true,
        unique: true
    },
    productIds: [{
        type: Schema.Types.ObjectId,
        ref: 'Product'
    }],
    discountPercentage: {
        type: Number,
        required: true,
        min: 0,
        max: 100
    },
    startDate: {
        type: Date,
        required: true
    },
    endDate: {
        type: Date,
        required: true
    },
    categoryIds: [{
        type: Schema.Types.ObjectId,
        ref: 'Category'
    }],
    status: {
        type: String,
        enum: ['active', 'expired'],
        default: 'active'
    }
}, {
    timestamps: true
});

const Offer = mongoose.model('Offer', offerSchema);
module.exports = Offer;

