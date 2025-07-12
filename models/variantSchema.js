const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const variantSchema = new Schema({
    productId: {
        type: Schema.Types.ObjectId,
        ref: 'Product',
        required: true
    },
    size: {
        type: String,
        enum: ['S', 'M', 'L', 'XL', 'XXL'],
        default: null
    },
    stock: {
        type: Number,
        required: true,
        default: 0
    },
    regularPrice: {
        type: Number,
        required: true
    },
    salePrice: {
        type: Number,
        required: true
    }
}, { timestamps: true });

const Variant = mongoose.model('Variant', variantSchema)
module.exports = Variant;
