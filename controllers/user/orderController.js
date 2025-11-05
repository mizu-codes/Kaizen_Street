const mongoose = require('mongoose');
const Wallet = require('../../models/walletSchema');
const { randomUUID } = require('crypto')
const WalletTransaction = require('../../models/walletTransactionSchema');
const Transaction = require('../../models/transactionSchema');
const Product = require('../../models/productSchema');
const Order = require('../../models/orderSchema');
const Address = require('../../models/addressSchema');
const returnAndRefund = require('../../models/returnAndRefundSchema');
const PDFDocument = require('pdfkit');

const loadOrderPage = async (req, res) => {
    try {
        const userId = req.session.userId;
        const q = (req.query.q || '').trim();
        const page = parseInt(req.query.page) || 1;
        const limit = 5;
        const skip = (page - 1) * limit;

        const filter = { user: userId };

        if (q) {
            const regex = new RegExp(q, 'i');
            filter.$or = [
                { orderId: regex },
                { 'items.name': regex }
            ];
        }

        const totalOrders = await Order.countDocuments(filter);
        const totalPages = Math.ceil(totalOrders / limit);

        const orders = await Order
            .find(filter)
            .sort({ createdAt: -1 })
            .select('orderId status createdAt totalAmount items discount coupon')
            .skip(skip)
            .limit(limit)
            .lean();

        const processedOrders = orders.map(order => {
            order.items = order.items.map(item => {
                return {
                    ...item,
                    status: item.status || order.status
                };
            });

            order.displayOrderId = order._id.toString().slice(-8).toUpperCase();

            return order;
        });

        res.render('profile-order', {
            orders: processedOrders,
            q,
            currentPage: page,
            totalPages,
            totalOrders
        });
    } catch (error) {
        console.error('Error loading orders:', error);
        res.redirect('/pageNotFound');
    }
};

const loadOrderDetailsPage = async (req, res) => {
    try {
        const userId = req.session.userId;
        const orderId = req.params.orderId;

        let order = await Order.findOne({ _id: orderId, user: userId }).lean({ virtuals: true });

        if (!order) {
            return res.status(404).render('page-404');
        }

        if (order.address && typeof order.address === 'string' || (order.address && order.address._id)) {
            const addressId = typeof order.address === 'string' ? order.address : order.address._id;
            const addressDoc = await Address.findOne({ _id: addressId, userId });

            if (addressDoc) {
                order.address = {
                    userName: addressDoc.userName || '',
                    phoneNumber: addressDoc.phoneNumber || '',
                    altPhoneNumber: addressDoc.altPhoneNumber || null,
                    houseNo: addressDoc.houseNo || '',
                    locality: addressDoc.locality || '',
                    landmark: addressDoc.landmark || null,
                    city: addressDoc.city || '',
                    state: addressDoc.state || '',
                    pincode: addressDoc.pincode || '',
                    addressType: addressDoc.addressType || 'home'
                };
            }
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

        const order = await Order.findOne({ _id: orderId, user: userId })
        if (!order) return res.status(404).send('Order not found');

        const validStatuses = ['placed', 'processing', 'shipped', 'out for delivery', 'delivered'];
        const orderStatus = (order.status || '').toLowerCase();

        if (!validStatuses.includes(orderStatus)) {
            return res.status(400).send('Invoice not available for this order status');
        }

        const isPaid = order.paymentStatus === 'paid' || order.paymentMethod === 'cod';
        if (!isPaid) {
            return res.status(400).send('Invoice not available for unpaid orders');
        }

        const doc = new PDFDocument({ margin: 50 });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=Invoice-${orderId}.pdf`);

        doc.pipe(res);

        doc.fontSize(20).text('Kaizen Street Online Shopping - Invoice', { align: 'center' });
        doc.moveDown();

        doc.fontSize(12).text(`Order ID: #${order._id.toString().slice(-8).toUpperCase()}`);
        doc.text(`Date: ${new Date(order.createdAt).toLocaleString()}`);
        doc.text(`Payment Method: ${order.paymentMethod}`);
        doc.text(`Payment Status: ${order.paymentStatus}`);
        doc.moveDown();

        const a = order.address;
        doc.fontSize(14).text('Shipping Address', { underline: true });
        doc.fontSize(12).text(`${a.userName || a.fullName}`);
        doc.text(`${a.houseNo}, ${a.locality}, ${a.city}, ${a.pincode}`);
        doc.text(`Phone: ${a.phoneNumber || ''}`);
        doc.moveDown();

        doc.fontSize(14).text('Items', { underline: true });
        doc.moveDown(0.5);

        const originalTotal = order.items.reduce((sum, item) =>
            sum + (item.subtotal || (item.price * item.quantity)), 0
        );
        const orderDiscount = order.discount || 0;

        order.items.forEach((item, i) => {
            const itemStatus = item.status || order.status || 'Placed';
            const isCancelled = itemStatus.toLowerCase() === 'cancelled';

            doc.fontSize(12).text(`${i + 1}. ${item.name}`, { continued: false });

            const itemDetails = `   Size: ${item.size} | Qty: ${item.quantity} | Price: Rs ${item.price}`;
            doc.fontSize(10).text(itemDetails);

            const itemSubtotal = item.subtotal || (item.price * item.quantity);
            doc.text(`   Subtotal: Rs ${itemSubtotal}`);

            if (isCancelled) {
                doc.fillColor('red')
                    .text(`   Status: ${itemStatus.toUpperCase()} `, { continued: false });
                doc.fillColor('black');

                if (item.cancellationReason) {
                    doc.fontSize(9)
                        .fillColor('gray')
                        .text(`   Reason: ${item.cancellationReason}`)
                        .fillColor('black');
                }
            } else if (itemStatus.toLowerCase() === 'delivered') {
                doc.fillColor('green')
                    .text(`   Status: ${itemStatus.toUpperCase()} ✓`, { continued: false })
                    .fillColor('black');
            } else {
                doc.fillColor('blue')
                    .text(`   Status: ${itemStatus.toUpperCase()}`, { continued: false })
                    .fillColor('black');
            }

            doc.moveDown(0.8);
        });

        const activeItems = order.items.filter(item =>
            (item.status || order.status).toLowerCase() !== 'cancelled'
        );

        const activeSubtotal = activeItems.reduce((sum, item) =>
            sum + (item.subtotal || (item.price * item.quantity)), 0
        );

        let activeDiscount = 0;
        if (orderDiscount > 0 && originalTotal > 0) {
            activeDiscount = (activeSubtotal / originalTotal) * orderDiscount;
            activeDiscount = Math.round(activeDiscount * 100) / 100;
        }

        const finalAmount = activeSubtotal - activeDiscount;

        doc.moveDown();
        doc.fontSize(12);

        const cancelledItems = order.items.filter(item =>
            (item.status || order.status).toLowerCase() === 'cancelled'
        );

        if (cancelledItems.length > 0) {
            const cancelledSubtotal = cancelledItems.reduce((sum, item) =>
                sum + (item.subtotal || (item.price * item.quantity)), 0
            );

            doc.fontSize(11).fillColor('gray');
            doc.text('Summary (Including Cancelled Items):', { underline: true });
            doc.text(`Original Subtotal: Rs ${originalTotal}`);
            doc.text(`Cancelled Items Value: -Rs ${cancelledSubtotal}`, { strike: true });
            doc.fillColor('black');
            doc.moveDown(0.5);
        }

        doc.fontSize(12).text('Final Invoice Summary:', { underline: true });
        doc.text(`Active Items Subtotal: Rs ${activeSubtotal}`);

        if (activeDiscount > 0) {
            doc.text(`Discount Applied: -Rs ${activeDiscount}`);
        }

        doc.fontSize(14).fillColor('green');
        doc.text(`Total Amount: Rs ${finalAmount}`, { bold: true });
        doc.fillColor('black');

        if (cancelledItems.length > 0) {
            doc.moveDown();
            doc.fontSize(9).fillColor('gray');
            doc.text('Note: Cancelled items are excluded from the final amount. Refunds have been processed to your wallet.', {
                align: 'center',
                width: 500
            });
            doc.fillColor('black');
        }

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


        const itemStatus = (item.status || order.status || '').toLowerCase();

        if (itemStatus !== 'delivered') {
            return res.status(400).json({
                success: false,
                message: 'Only delivered items can be returned'
            });
        }

        if (itemStatus === 'cancelled') {
            return res.status(400).json({
                success: false,
                message: 'Cannot return a cancelled item'
            });
        }

        const existing = await returnAndRefund.findOne({ order: orderId, itemId });
        if (existing) return res.status(400).json({
            success: false, message: 'Return request already exists'
        });

        if (item.returnRequest && item.returnRequest.status) {
            return res.status(400).json({
                success: false, message: 'Return already requested'
            });
        }

        const deliveryDate = item.deliveredAt || order.updatedAt || order.placedAt || order.createdAt;
        const daysSinceDelivery = Math.floor((Date.now() - new Date(deliveryDate)) / (1000 * 60 * 60 * 24));
        const returnWindowDays = 7;

        if (daysSinceDelivery > returnWindowDays) {
            return res.status(400).json({
                success: false,
                message: `Return window expired (${returnWindowDays} days)`
            });
        }

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
        if (err && err.code === 11000) {
            return res.status(400).json({
                success: false,
                message: 'Duplicate return request'
            });
        }
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