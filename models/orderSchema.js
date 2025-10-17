const mongoose = require("mongoose");
const { Schema } = mongoose;
const { v4: uuidv4 } = require("uuid");

const orderItemSubschema = new Schema(
  {
    product: {
      type: Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    name: {
      type: String,
      required: true,
    },
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
    },
    size: {
      type: String,
      enum: ["S", "M", "L", "XL", "XXL"],
      required: true,
    },
    image: {
      type: String,
    },
    subtotal: {
      type: Number,
      required: true,
      min: 0,
    },
    status: {
      type: String,
      enum: ["Placed", "Processing", "Shipped", "Out for Delivery", "Delivered", "Cancelled", "Returned", "Payment Failed"],
      default: "Placed",
    },
    cancellationReason: {
      type: String,
    },
    returnRequest: {
      status: {
        type: String,
        enum: ["requested", "accepted", "rejected", "refunded"],
        default: null,
      },
      requestedAt: {
        type: Date,
        default: Date.now,
      },
      reason: {
        type: String,
      },
      verifiedAt: {
        type: Date,
      },
      adminNote: {
        type: String,
      },
      verifiedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Admin",
      },
    },
  },
  { _id: true }
);

const orderSchema = new Schema(
  {
    orderId: {
      type: String,
      default: () => uuidv4(),
      unique: true,
    },
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    address: {
      type: Schema.Types.Mixed,
      required: true,
    },
    items: {
      type: [orderItemSubschema],
      required: true,
      validate: {
        validator: function (items) {
          return Array.isArray(items) && items.length > 0;
        },
        message: "Order must contain at least one item.",
      },
    },
    discount: {
      type: Number,
      default: 0,
      min: 0,
    },
    coupon: {
      couponId: {
        type: Schema.Types.ObjectId,
        ref: 'Coupon'
      },
      couponCode: String,
      discountAmount: {
        type: Number,
        default: 0
      }
    },
    totalAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    paymentMethod: {
      type: String,
      enum: ["cod", "razorpay", "wallet"],
      default: "cod",
      required: true,
    },
    paymentStatus: {
      type: String,
      enum: ["paid", "unpaid"],
      default: "unpaid",
    },
    paymentDetails: {
      razorpay_order_id: {
        type: String
      },
      razorpay_payment_id: {
        type: String
      },
      razorpay_signature: {
        type: String
      },
      raw: {
        type: Schema.Types.Mixed
      },
    },
    status: {
      type: String,
      enum: [
        "Placed",
        "Processing",
        "Shipped",
        "Out for Delivery",
        "Delivered",
        "Cancelled",
        "Returned",
        "Payment Failed"
      ],
      default: "Placed",
    },
    history: [
      {
        by: {
          type: Schema.Types.ObjectId,
          ref: "User",
        },
        action: String,
        timestamp: Date,
      },
    ],
    placedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

orderSchema.virtual("displayOrderId").get(function () {
  return this.orderId ? this.orderId.substring(0, 8).toUpperCase() : "";
});

orderSchema.set("toJSON", { virtuals: true });
orderSchema.set("toObject", { virtuals: true });

const Order = mongoose.model("Order", orderSchema);
module.exports = Order;
