const mongoose = require('mongoose');
const { Schema } = mongoose;

const returnAndRefundSchema = new Schema({
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  order: {
    type: Schema.Types.ObjectId,
    ref: 'Order',
    required: true,
    index: true
  },
  refundTransactionId: {
    type: Schema.Types.ObjectId,
    ref: 'WalletTransaction',
    default: null,
    index: true
  },
  itemId: {
    type: Schema.Types.ObjectId,
    required: true,
    index: true
  },
  product: {
    type: Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  size: {
    type: String,
    enum: ['S', 'M', 'L', 'XL', 'XXL'],
    required: true
  },
  quantity: {
    type: Number,
    required: true,
    min: 1
  },
  regularPrice: {
    type: Number,
    required: true
  },
  reason: {
    type: String,
    required: true,
    trim: true
  },
  status: {
    type: String,
    enum: ['requested', 'accepted', 'rejected', 'refunded'],
    default: null,
    index: true
  },
  refundAmount: {
    type: Number,
    default: 0,
    min: 0
  },
  requestedAt: {
    type: Date,
    default: Date.now
  },
  verifiedAt: {
    type: Date
  },
  refundedAt: {
    type: Date,
    default: null
  },
}, {
  timestamps: true
});

returnAndRefundSchema.index({ status: 1, requestedAt: -1 });
returnAndRefundSchema.index({ user: 1, status: 1 });
returnAndRefundSchema.index({ order: 1, itemId: 1 }, { unique: true });

const returnAndRefund = mongoose.model('returnAndRefund', returnAndRefundSchema)
module.exports = returnAndRefund;