const mongoose = require('mongoose');
const { Schema } = mongoose;

const productSchema = new Schema({
    productName: {
        type: String,
        required: true
    },
    description: {
        type: String,
        required: true
    },
    category: {
        type: Schema.Types.ObjectId,
        ref: 'Category',
        required: true
    },
    regularPrice: {
        type: Number,
        required: true
    },
    discountPrice: {
        type: Number,
        required: true
    },
    productOffer: {
        type: Number,
        default: 0
    },
    productImage: {
        type: [String],
        required: true
    },
    isBlocked: {
        type: Boolean,
        default: false
    },
    status: {
        type: String,
        enum: ['active', 'inactive'],
        default: 'active',
        required: true
    },
    stock: {
        type: Number,
        required: true,
        min: 1
    },
    size: {
        type: String,
        required: true,
        enum: ['S', 'M', 'L', 'XL','XXL']
    },
    specifications: {
        type: String,
        required: true,
    },
},
    {
        timestamps: true
    })

const Product = mongoose.model('Product', productSchema)
module.exports = Product;