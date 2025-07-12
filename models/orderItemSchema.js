const mongoose = require('mongoose');
const { Schema } = mongoose;

const orderItemSchema = new Schema({
    orderId: {
        type: Schema.Types.ObjectId,
        ref: 'Order',
        required: true,
        index: true
    },
    productId: {
        type: Schema.Types.ObjectId,
        ref: 'Product',
        required: true
    },
    variantId: {
        type: Schema.Types.ObjectId,
        ref: 'Variant',
        required: true
    },
    quantity: {
        type: Number,
        required: true,
        min: 1
    },
    price: {
        type: Number,
        required: true,
        min: 0
    },
    itemStatus: {
        type: String,
        enum: ['pending', 'shipped', 'delivered', 'returned', 'cancelled'],
        default: 'pending'
    },
    shippedAt: { type: Date },
    deliveredAt: { type: Date },
    returnedAt: { type: Date }
}, {
    timestamps: true
});

const OrderItem = mongoose.model('OrderItem', orderItemSchema);
module.exports = OrderItem;
