const mongoose = require('mongoose');
const Order = require('../../models/orderSchema');
const Product = require('../../models/productSchema');
const returnAndRefund = require('../../models/returnAndRefundSchema');
const Wallet = require('../../models/walletSchema');
const WalletTransaction = require('../../models/walletTransactionSchema');
const Transaction = require('../../models/transactionSchema');
const { v4: uuidv4 } = require('uuid');


const createRefundTransaction = async (refundData, session = null) => {
  try {
    const transactionData = {
      customerId: refundData.userId,
      orderId: refundData.orderId,
      amount: refundData.refundAmount,
      paymentMethod: refundData.originalPaymentMethod,
      transactionStatus: 'success',
      type: 'refund',
      refundReason: 'return',
      description: `Refund for returned item: ${refundData.itemName || 'product'}`,
      gatewayTransactionId: refundData.originalGatewayTransactionId || null,
      gatewayOrderId: refundData.originalGatewayOrderId || null
    };

    if (session) {
      await Transaction.create([transactionData], { session });
    } else {
      await Transaction.create(transactionData);
    }
  } catch (error) {
    console.error('Error creating refund transaction:', error);
    throw error;
  }
};

const loadOrderPage = async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = 10;
    const skip = (page - 1) * limit;
    const q = (req.query.q || '').toString().trim();
    const statusRaw = (req.query.status || '').toString().trim();


    const matchConditions = {};
    const statusFilter = statusRaw && statusRaw.toLowerCase() !== 'all' && statusRaw !== '' ? statusRaw : null;
    if (statusFilter) {
      matchConditions.status = statusFilter;
    }

    const returnCollection = returnAndRefund.collection.name;

    let initialMatch = {};
    if (q) {
      const regex = new RegExp(q, 'i');
      initialMatch = {
        $or: [
          { orderId: regex },
          { 'items.name': regex },
          { 'user.name': regex }
        ]
      };
    }

    const pipeline = [
      ...(Object.keys(initialMatch).length ? [{ $match: initialMatch }] : []),

      {
        $lookup: {
          from: 'users',
          localField: 'user',
          foreignField: '_id',
          as: 'user'
        }
      },
      { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },

      {
        $lookup: {
          from: returnCollection,
          let: { orderId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$order', '$$orderId'] },
                    { $eq: ['$status', 'requested'] }
                  ]
                }
              }
            },
            { $project: { _id: 1 } }
          ],
          as: 'pendingReturns'
        }
      },

      {
        $addFields: {
          pendingReturnCount: {
            $size: { $ifNull: ['$pendingReturns', []] }
          }
        }
      },

      { $project: { pendingReturns: 0 } },

      ...(Object.keys(matchConditions).length ? [{ $match: matchConditions }] : []),

      { $sort: { createdAt: -1 } },

      {
        $facet: {
          data: [
            { $skip: skip },
            { $limit: limit }
          ],
          total: [
            { $count: 'count' }
          ]
        }
      }
    ];

    const result = await Order.aggregate(pipeline).exec();

    const orders = result[0]?.data || [];
    const totalCount = result[0]?.total[0]?.count || 0;

    const processedOrders = orders.map((order, index) => {
      order.displayOrderId = order._id.toString().slice(-8).toUpperCase();

      const originalTotal = order.items?.reduce((sum, item) => {
        return sum + (item.subtotal || (item.price * item.quantity));
      }, 0) || 0;

      const orderDiscount = order.discount || 0;
      const actualAmountPaid = originalTotal - orderDiscount;

      order.originalTotal = originalTotal;
      order.actualAmountPaid = actualAmountPaid;

      return order;
    });

    const totalPages = Math.ceil(totalCount / limit);

    res.render('order-list', {
      orders: processedOrders,
      _page: page,
      _limit: limit,
      totalPages: totalPages,
      _q: q,
      _status: statusRaw || 'all',
      _msg: req.flash('message') || null
    });

  } catch (error) {
    console.error('loadOrderPage error:', error);
    return res.status(500).send('Server error');
  }
};


const loadOrderDetailsPage = async (req, res) => {
  try {
    const param = req.params.orderId;
    const isObjectId = /^[0-9a-fA-F]{24}$/.test(param);

    const order = isObjectId
      ? await Order.findById(param)
        .populate('user', 'name email phone')
        .populate('address')
        .populate('items.product')
        .lean({ virtuals: true })
      : await Order.findOne({ orderId: param })
        .populate('user', 'name email phone')
        .populate('address')
        .populate('items.product')
        .lean({ virtuals: true });

    if (!order) return res.status(404).render('page-404');

    const originalTotal = order.items.reduce((sum, item) => sum + (item.subtotal || (item.price * item.quantity)), 0);
    const orderDiscount = order.discount || 0;
    const actualAmountPaid = originalTotal - orderDiscount;

    order.items = order.items.map(item => {
      const itemOriginalSubtotal = item.subtotal || (item.price * item.quantity);
      let itemActualPaid;

      if (orderDiscount > 0 && originalTotal > 0) {
        const itemDiscountProportion = itemOriginalSubtotal / originalTotal;
        const itemDiscountAmount = orderDiscount * itemDiscountProportion;
        itemActualPaid = itemOriginalSubtotal - itemDiscountAmount;
      } else {
        itemActualPaid = itemOriginalSubtotal;
      }

      return {
        ...item,
        itemOriginalSubtotal,
        itemActualPaid: Math.round(itemActualPaid * 100) / 100
      };
    });

    order.originalTotal = originalTotal;
    order.actualAmountPaid = actualAmountPaid;

    const hasReturnInItems = Array.isArray(order.items) &&
      order.items.some(it => it.returnRequest && String(it.returnRequest.status).toLowerCase() === 'requested');

    const pendingReturnsCount = await returnAndRefund.countDocuments({
      order: order._id, status: 'requested'
    });

    const orderHasReturnRequest = Boolean(hasReturnInItems || pendingReturnsCount > 0);

    return res.render('order-details', { order, isAdmin: true, orderHasReturnRequest, pendingReturnsCount });
  } catch (error) {
    console.error('loadOrderDetailsPage error', error);
    return res.status(500).send('Server error');
  }
};

const VALID_STATUSES = ['Placed', 'Processing', 'Shipped', 'Out for Delivery', 'Delivered', 'Cancelled'];

const changeOrderStatus = async (req, res) => {
  const orderId = req.params.orderId;
  const { status } = req.body || {};

  if (!status) {
    return res.status(400).json({ success: false, message: 'Status is required' });
  }
  if (!VALID_STATUSES.includes(status)) {
    return res.status(400).json({ success: false, message: 'Invalid status value' });
  }

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const order = await Order.findById(orderId).session(session);
      if (!order) throw new Error('Order not found');

      order.status = status;

      order.items.forEach(item => {
        if (item.status !== 'Cancelled' &&
          (!item.returnRequest || item.returnRequest.status !== 'requested')) {
          item.status = status;

          if (status === 'Shipped' && !item.shippedAt) {
            item.shippedAt = new Date();
          } else if (status === 'Delivered' && !item.deliveredAt) {
            item.deliveredAt = new Date();
          } else if (status === 'Out for Delivery' && !item.outForDeliveryAt) {
            item.outForDeliveryAt = new Date();
          }
        }
      });

      order.history = order.history || [];
      order.history.push({
        by: req.session?.userId || null,
        action: `status->${status}`,
        timestamp: new Date()
      });

      await order.save({ session });
    });

    session.endSession();
    return res.json({ success: true, status, message: 'Order status updated and synced with all items' });
  } catch (err) {
    session.endSession();
    console.error('changeOrderStatus error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const updateReturnRequest = async (req, res) => {
  const { orderId, itemId } = req.params;
  const rawAction = (req.body && req.body.action) ? String(req.body.action).trim().toLowerCase() : '';
  const adminNote = (req.body && req.body.adminNote) ? String(req.body.adminNote) : '';

  const approveValues = new Set(['approve', 'approved', 'accept', 'accepted', 'refund', 'refunded']);
  const rejectValues = new Set(['reject', 'rejected', 'decline']);

  let action;
  if (approveValues.has(rawAction)) action = 'refunded';
  else if (rejectValues.has(rawAction)) action = 'rejected';
  else {
    return res.status(400).json({ success: false, message: `Invalid action: ${rawAction}` });
  }

  if (!mongoose.Types.ObjectId.isValid(orderId)) {
    return res.status(400).json({ success: false, message: 'Invalid order ID format' });
  }
  if (!mongoose.Types.ObjectId.isValid(itemId)) {
    return res.status(400).json({ success: false, message: 'Invalid item ID format' });
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const order = await Order.findById(orderId).session(session);
    if (!order) throw new Error('Order not found');

    if (!order.user) {
      throw new Error('Cannot process refund: Order has no associated user');
    }

    const item = order.items.id(itemId);
    if (!item) throw new Error('Item not found in order');

    if (!item.returnRequest) throw new Error('No return request found for this item');

    const currentStatus = String(item.returnRequest.status || '').toLowerCase();
    if (currentStatus === 'refunded' || currentStatus === 'rejected') {
      throw new Error('Return request already processed');
    }

    item.returnRequest.verifiedAt = new Date();
    item.returnRequest.adminNote = adminNote || '';

    if (action === 'rejected') {
      item.returnRequest.status = 'rejected';
      await order.save({ session });

      await returnAndRefund.updateOne(
        { order: order._id, itemId },
        { $set: { status: 'rejected', verifiedAt: new Date(), adminNote } },
        { session }
      );

      await session.commitTransaction();
      return res.json({ success: true, message: 'Return request rejected' });
    }

    const returnReq = await returnAndRefund.findOne({ order: order._id, itemId }).session(session);
    if (!returnReq) throw new Error('Return record not found');

    const originalItemSubtotal = item.subtotal || (item.price * item.quantity);
    const orderTotalOriginal = order.items.reduce((sum, orderItem) =>
      sum + (orderItem.subtotal || (orderItem.price * orderItem.quantity)), 0);
    const orderDiscount = order.discount || 0;

    let refundAmount;
    if (orderDiscount > 0 && orderTotalOriginal > 0) {
      const itemDiscountProportion = originalItemSubtotal / orderTotalOriginal;
      const itemDiscountAmount = orderDiscount * itemDiscountProportion;
      refundAmount = originalItemSubtotal - itemDiscountAmount;
    } else {
      refundAmount = originalItemSubtotal;
    }

    refundAmount = Math.max(0, Math.round(refundAmount * 100) / 100);

    if (refundAmount <= 0) {
      throw new Error('Computed refund amount is zero — cannot refund');
    }

    item.returnRequest.status = 'refunded';
    item.returnRequest.verifiedAt = new Date();
    item.returnRequest.adminNote = adminNote || '';
    await order.save({ session });

    await returnAndRefund.updateOne(
      { order: order._id, itemId },
      {
        $set: {
          status: 'refunded',
          verifiedAt: new Date(),
          refundedAt: new Date(),
          adminNote,
          refundAmount
        }
      },
      { session }
    );

    await Product.updateOne(
      { _id: item.product },
      { $inc: { [`stock.${item.size}`]: item.quantity } },
      { session }
    );

    let wallet = await Wallet.findOne({ userId: order.user }).session(session);
    if (!wallet) {
      const created = await Wallet.create([{
        userId: order.user,
        balance: 0,
        totalCredits: 0,
        totalDebits: 0,
        transactionCount: 0,
        isActive: true,
        isBlocked: false
      }], { session });
      wallet = created[0];
    }

    const balanceBefore = Number(wallet.balance || 0);
    const balanceAfter = balanceBefore + refundAmount;

    await Wallet.updateOne(
      { _id: wallet._id },
      {
        $set: { balance: balanceAfter, lastTransactionAt: new Date(), lastCreditAt: new Date() },
        $inc: { totalCredits: refundAmount, transactionCount: 1 }
      },
      { session }
    );

    const originalPaymentMethod = order.paymentMethod || order.paymentDetails?.method || 'cod';

    const txDocs = await WalletTransaction.create([{
      wallet: wallet._id,
      user: order.user,
      type: 'credit',
      amount: refundAmount,
      description: `Refund for returned: ${item.name || 'returned product'} (discount-adjusted)`,
      transactionId: uuidv4(),
      status: 'completed',
      balanceBefore,
      balanceAfter,
      orderId: order._id,
      returnId: returnReq._id,
      paymentDetails: {
        method: originalPaymentMethod,
        refundedTo: 'wallet'
      },
      processedAt: new Date(),
      completedAt: new Date()
    }], { session });

    await createRefundTransaction({
      userId: order.user,
      orderId: order._id,
      refundAmount: refundAmount,
      originalPaymentMethod: originalPaymentMethod,
      itemName: item.name || 'returned product',
      originalGatewayTransactionId: order.paymentDetails?.razorpay_payment_id || null,
      originalGatewayOrderId: order.paymentDetails?.razorpay_order_id || null
    }, session);

    await session.commitTransaction();

    return res.json({
      success: true,
      message: `Return approved and ₹${refundAmount} refunded to wallet (discount-adjusted)`
    });

  } catch (error) {
    console.error("Error updating return request:", error);
    await session.abortTransaction();
    const message = error && error.message ? error.message : 'Unknown error occurred';
    return res.status(500).json({ success: false, message, error: process.env.NODE_ENV === 'development' ? error.stack : undefined });
  } finally {
    session.endSession();
  }
};

module.exports = {
  loadOrderPage,
  loadOrderDetailsPage,
  changeOrderStatus,
  updateReturnRequest
}