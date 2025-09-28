const mongoose = require('mongoose');
const Wallet = require('../../models/walletSchema');
const { randomUUID } = require('crypto')
const WalletTransaction = require('../../models/walletTransactionSchema');
const Transaction = require('../../models/transactionSchema');
const Product = require('../../models/productSchema');
const Order = require('../../models/orderSchema');
const returnAndRefund = require('../../models/returnAndRefundSchema')
const PDFDocument = require('pdfkit');

const loadOrderPage = async (req, res) => {
    try {
        const userId = req.session.userId;
        const q = (req.query.q || '').trim();

        const filter = { user: userId };

        if (q) {
            const regex = new RegExp(q, 'i');
            filter.$or = [
                { orderId: regex },
                { 'items.name': regex }
            ];
        }

        const orders = await Order
            .find(filter)
            .sort({ createdAt: -1 })
            .select('orderId status createdAt totalAmount items discount coupon')
            .lean();

        const processedOrders = orders.map(order => {
            order.items = order.items.map(item => {
                return {
                    ...item,
                    status: item.status || order.status
                };
            });

            order.displayOrderId = order._id.toString().slice(-8).toUpperCase();

            console.log(`Order ${order.displayOrderId}: discount = ${order.discount || 0}`);

            return order;
        });

        res.render('profile-order', { orders: processedOrders, q });
    } catch (error) {
        console.error('Error loading orders:', error);
        res.redirect('/pageNotFound');
    }
};

const loadOrderDetailsPage = async (req, res) => {
    try {
        const userId = req.session.userId;
        const orderId = req.params.orderId;

        const order = await Order.findOne({ _id: orderId, user: userId })
            .populate('address')
            .lean({ virtuals: true });

        if (!order) {
            return res.status(404).render('page-404');
        }

        order.items = order.items.map(item => {
            return {
                ...item,
                status: item.status || order.status
            };
        });

        res.render('profile-order-details', { order });
    } catch (error) {
        console.error('Error loading order details:', error);
        res.status(500).render('page-404', { message: 'Failed to load order details.' });
    }
};

const cancelOrderItem = async (req, res) => {
    const session = await mongoose.startSession();
    try {
        const userId = req.session.userId;
        const itemId = req.params.itemId;
        const reason = (req.body.reason || 'No reason provided').trim();

        if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

        await session.withTransaction(async () => {
            const orderDoc = await Order.findOne({ user: userId, 'items._id': itemId }).session(session);
            if (!orderDoc) return res.status(404).json({ success: false, message: 'Order item not found.' });

            const itemDoc = orderDoc.items.id(itemId);
            if (!itemDoc) return res.status(404).json({ success: false, message: 'Item not found in order.' });

            if (String(itemDoc.status).toLowerCase() === 'cancelled') {
                return res.status(400).json({ success: false, message: 'Item is already cancelled.' });
            }

            const originalItemSubtotal = itemDoc.subtotal ?? (itemDoc.price * itemDoc.quantity);
            const orderTotalOriginal = orderDoc.items.reduce((sum, item) => sum + (item.subtotal ?? (item.price * item.quantity)), 0);
            const orderDiscount = orderDoc.discount || 0;

            let refundAmount;
            if (orderDiscount > 0 && orderTotalOriginal > 0) {
                const itemDiscountProportion = originalItemSubtotal / orderTotalOriginal;
                const itemDiscountAmount = orderDiscount * itemDiscountProportion;
                refundAmount = originalItemSubtotal - itemDiscountAmount;
            } else {
                refundAmount = originalItemSubtotal;
            }

            refundAmount = Math.max(0, Math.round(refundAmount * 100) / 100);

            console.log('Refund Calculation Debug:', {
                itemId,
                originalItemSubtotal,
                orderTotalOriginal,
                orderDiscount,
                calculatedRefundAmount: refundAmount
            });

            itemDoc.status = 'Cancelled';
            itemDoc.cancellationReason = reason;
            itemDoc.cancelledAt = new Date();

            await Product.updateOne(
                { _id: itemDoc.product },
                { $inc: { [`stock.${itemDoc.size}`]: itemDoc.quantity } },
                { session }
            );

            const paymentMethod = String(orderDoc.paymentMethod).toLowerCase();

            if (paymentMethod === 'razorpay' || paymentMethod === 'wallet') {
                const now = new Date();

                let wallet = await Wallet.findOne({ userId: userId }).session(session);
                if (!wallet) {
                    wallet = await Wallet.create([{
                        userId,
                        balance: refundAmount,
                        isActive: true,
                        isBlocked: false,
                        totalCredits: refundAmount,
                        totalDebits: 0,
                        transactionCount: 1,
                        lastTransactionAt: now,
                        lastCreditAt: now
                    }], { session }).then(arr => arr[0]);
                } else {
                    const prevBalance = Number(wallet.balance || 0);
                    wallet.balance = prevBalance + refundAmount;
                    wallet.totalCredits = (wallet.totalCredits || 0) + refundAmount;
                    wallet.transactionCount = (wallet.transactionCount || 0) + 1;
                    wallet.lastTransactionAt = now;
                    wallet.lastCreditAt = now;
                    await wallet.save({ session });
                }

                const balanceBefore = Number((wallet.balance || 0) - refundAmount);
                const balanceAfter = Number(wallet.balance || 0);

                await WalletTransaction.create([{
                    transactionId: randomUUID(),
                    wallet: wallet._id,
                    user: userId,
                    type: 'credit',
                    amount: refundAmount,
                    description: paymentMethod === 'wallet'
                        ? `Refund for cancelled: ${itemDoc.name || 'product'} (including discount adjustment)`
                        : `Refund for cancelled: ${itemDoc.name || 'product'} (including discount adjustment)`,
                    status: 'completed',
                    balanceBefore,
                    balanceAfter,
                    orderId: orderDoc._id,
                    paymentDetails: {
                        method: orderDoc.paymentMethod || paymentMethod,
                        gatewayOrderId: orderDoc.paymentDetails?.razorpay_order_id ?? null,
                        gatewayPaymentId: orderDoc.paymentDetails?.razorpay_payment_id ?? null,
                        gatewayTransactionId: null
                    },
                    processedAt: now,
                    completedAt: now
                }], { session });

                await Transaction.create([{
                    customerId: userId,
                    orderId: orderDoc._id,
                    amount: refundAmount,
                    paymentMethod: orderDoc.paymentMethod,
                    transactionStatus: 'success',
                    type: 'refund',
                    refundReason: 'cancellation',
                    description: `Refund for cancelled item: ${itemDoc.name || 'product'} (discounted amount)`,
                    gatewayTransactionId: orderDoc.paymentDetails?.razorpay_payment_id || null,
                    gatewayOrderId: orderDoc.paymentDetails?.razorpay_order_id || null
                }], { session });
            }

            if (paymentMethod === 'cod') {
                console.log('COD order cancelled - no refund required');
            }

            const allCancelled = orderDoc.items.every(it => String(it.status).toLowerCase() === 'cancelled');
            if (allCancelled) {
                orderDoc.status = 'Cancelled';
                orderDoc.cancelledAt = new Date();
            }

            await orderDoc.save({ session });
        });

        return res.json({
            success: true,
            message: 'Item cancelled successfully. Refund has been processed to your wallet.'
        });
    } catch (err) {
        console.error('Cancel item error:', err);
        try { await session.abortTransaction(); } catch (e) { }
        return res.status(500).json({ success: false, message: 'Server error.' });
    } finally {
        try { session.endSession(); } catch (e) { }
    }
};

const downloadInvoicePDF = async (req, res) => {
    try {
        const userId = req.session.userId;
        const orderId = req.params.orderId;

        const order = await Order.findOne({ _id: orderId, user: userId }).populate('address')
        if (!order) return res.status(404).send('Order not found');

        const doc = new PDFDocument({ margin: 50 });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=Invoice-${orderId}.pdf`);

        doc.pipe(res);

        doc.fontSize(20).text('Kaizen Street Online Shopping - Invoice', { align: 'center' });
        doc.moveDown();

        doc.fontSize(12).text(`Order ID: #${order._id.toString().slice(-8).toUpperCase()}`);
        doc.text(`Date: ${new Date(order.createdAt).toLocaleString()}`);
        doc.text(`Payment Method: ${order.paymentMethod}`);
        doc.text(`Order Status: ${order.status}`);
        doc.moveDown();

        const a = order.address;
        doc.fontSize(14).text('Shipping Address', { underline: true });
        doc.fontSize(12).text(`${a.userName || a.fullName}`);
        doc.text(`${a.houseNo}, ${a.locality}, ${a.city}, ${a.pincode}`);
        doc.text(`Phone: ${a.phoneNumber || ''}`);
        doc.moveDown();

        doc.fontSize(14).text('Items', { underline: true });
        order.items.forEach((item, i) => {
            doc.fontSize(12).text(`${i + 1}. ${item.name} (${item.size}) - ₹${item.price} x ${item.quantity} = ₹${item.subtotal}`);
        });

        doc.moveDown();
        doc.text(`Subtotal: ₹${order.items.reduce((sum, i) => sum + i.subtotal, 0)}`);
        doc.text(`Discount: ₹${order.discount}`);
        doc.text(`Total Amount: ₹${order.totalAmount}`, { bold: true });

        doc.end();
    } catch (err) {
        console.error('Invoice PDF error:', err);
        res.status(500).send('Failed to generate invoice.');
    }
};

const returnOrderItem = async (req, res) => {
    const session = await mongoose.startSession();
    try {
        const userId = req.session.userId;
        const { orderId, itemId, reason } = req.body;

        if (!orderId || !itemId || !reason) {
            return res.status(400).json({ success: false, message: 'Missing required fields' });
        }

        const order = await Order.findOne({ _id: orderId, user: userId }).lean();
        if (!order) return res.status(404).json({
            success: false, message: 'Order not found or unauthorized'
        });

        const item = order.items.find(it => String(it._id) === String(itemId));
        if (!item) return res.status(404).json({ success: false, message: 'Item not in order' });

        const itemStatus = (order.status || '').toLowerCase();
        if (itemStatus !== 'delivered') return res.status(400).json({
            success: false, message: 'Only delivered items can be returned'
        });

        const existing = await returnAndRefund.findOne({ order: orderId, itemId });
        if (existing) return res.status(400).json({
            success: false, message: 'Return request already exists'
        });
        if (item.returnRequest && item.returnRequest.status) return res.status(400).json({
            success: false, message: 'Return already requested'
        });

        const deliveryDate = item.deliveredAt || order.updatedAt || order.placedAt || order.createdAt;
        const daysSinceDelivery = Math.floor((Date.now() - new Date(deliveryDate)) / (1000 * 60 * 60 * 24));
        const returnWindowDays = 7;
        if (daysSinceDelivery > returnWindowDays) return res.status(400).json({
            success: false, message: `Return window expired (${returnWindowDays} days)`
        });

        const originalItemSubtotal = item.subtotal ?? (item.price * item.quantity);
        const orderTotalOriginal = order.items.reduce((sum, orderItem) =>
            sum + (orderItem.subtotal ?? (orderItem.price * orderItem.quantity)), 0);
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

        await session.withTransaction(async () => {
            const newReturn = await returnAndRefund.create([{
                user: userId,
                order: orderId,
                itemId,
                product: item.product,
                size: item.size,
                quantity: item.quantity,
                regularPrice: item.price ?? item.subtotal / (item.quantity || 1) ?? 0,
                refundAmount: refundAmount,
                reason: reason.trim()
            }], { session });

            const orderDoc = await Order.findById(orderId).session(session);
            const itemDoc = orderDoc.items.id(itemId);
            if (!itemDoc) throw new Error('Order item not found during transaction');

            itemDoc.returnRequest = {
                status: 'requested',
                reason: reason.trim(),
                requestedAt: new Date(),
                returnRecord: newReturn[0]._id,
                refundAmount: refundAmount
            };

            await orderDoc.save({ session });
        });

        await session.endSession();
        return res.json({
            success: true,
            message: 'Return requested successfully',
            refundAmount: refundAmount
        });
    } catch (err) {
        console.error('returnOrderItem error', err);
        try { await session.endSession(); } catch (e) { }
        if (err && err.code === 11000) return res.status(400).json({ success: false, message: 'Duplicate return request' });
        return res.status(500).json({ success: false, message: 'Server error' });
    }
};


module.exports = {
    loadOrderPage,
    loadOrderDetailsPage,
    cancelOrderItem,
    downloadInvoicePDF,
    returnOrderItem,
}