const mongoose = require('mongoose');
const { Schema } = mongoose;
const { v4: uuidv4 } = require('uuid');

const orderItemSubschema = new Schema({
    product: {
        type: Schema.Types.ObjectId,
        ref: 'Product',
        required: true
    },
    name: {
        type: String,
        required: true
    },
    price: {
        type: Number,
        required: true,
        min: 0
    },
    quantity: {
        type: Number,
        required: true,
        min: 1
    },
    size: {
        type: String,
        enum: ['S', 'M', 'L', 'XL', 'XXL'],
        required: true
    },
    image: {
        type: String,
    },
    subtotal: {
        type: Number,
        required: true,
        min: 0
    },
    status: {
        type: String,
        enum: ['Placed', 'Cancelled', 'Returned', 'Delivered'],
        default: 'Placed'
    },
    cancellationReason: {
        type: String
    },
    returnReason: {
        type: String
    }
}, { _id: true });

const orderSchema = new Schema({
    orderId: {
        type: String,
        default: () => uuidv4(),
        unique: true
    },
    user: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    address: {
        type: Schema.Types.ObjectId,
        ref: 'Address',
        required: true
    },
    items: {
        type: [orderItemSubschema],
        required: true,
        validate: {
            validator: function (items) {
                return Array.isArray(items) && items.length > 0;
            },
            message: 'Order must contain at least one item.'
        }
    },
    discount: {
        type: Number,
        default: 0,
        min: 0
    },
    totalAmount: {
        type: Number,
        required: true,
        min: 0
    },
    paymentMethod: {
        type: String,
        enum: ['cod', 'razorpay', 'wallet'],
        default: 'cod',
        required: true
    },
    paymentStatus: {
        type: String,
        enum: ['paid', 'unpaid'],
        default: 'unpaid'
    },
    status: {
        type: String,
        enum: ['Placed', 'Processing', 'Shipped', 'Delivered', 'Cancelled'],
        default: 'Placed'
    },
    placedAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

const Order = mongoose.model('Order', orderSchema);
module.exports = Order;

