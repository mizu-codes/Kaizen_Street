const mongoose = require('mongoose');
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
            .select('orderId status createdAt totalAmount items')

        res.render('profile-order', { orders, q });
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
        res.render('profile-order-details', { order });
    } catch (error) {
        console.error('Error loading order details:', error);
        res.status(500).render('error', { message: 'Failed to load order details.' });
    }
};


const cancelOrderItem = async (req, res) => {
    try {
        const userId = req.session.userId;
        const itemId = req.params.itemId;
        const reason = req.body.reason || 'No reason provided';

        const order = await Order.findOne({ user: userId, 'items._id': itemId });
        if (!order) {
            return res.status(404).json({ success: false, message: 'Order item not found.' });
        }

        const item = order.items.id(itemId);
        if (!item) {
            return res.status(404).json({ success: false, message: 'Item not found in order.' });
        }

        order.status = 'Cancelled';
        item.cancellationReason = reason;

        await Product.updateOne(
            { _id: item.product },
            { $inc: { [`stock.${item.size}`]: item.quantity } }
        );

        const allCancelled = order.items.every(it => it.status === 'Cancelled');
        if (allCancelled) {
            order.status = 'Cancelled';
        }

        await order.save();

        return res.json({ success: true });
    } catch (error) {
        console.error('Cancel item error:', error);
        return res.status(500).json({ success: false, message: 'Server error.' });
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

        await session.withTransaction(async () => {
            const newReturn = await returnAndRefund.create([{
                user: userId,
                order: orderId,
                itemId,
                product: item.product,
                size: item.size,
                quantity: item.quantity,
                regularPrice: item.price ?? item.subtotal / (item.quantity || 1) ?? 0,
                reason: reason.trim()
            }], { session });

            const orderDoc = await Order.findById(orderId).session(session);
            const itemDoc = orderDoc.items.id(itemId);
            if (!itemDoc) throw new Error('Order item not found during transaction');

            itemDoc.returnRequest = {
                status: 'requested',
                reason: reason.trim(),
                requestedAt: new Date(),
                returnRecord: newReturn[0]._id
            };

            await orderDoc.save({ session });
        });

        await session.endSession();
        return res.json({ success: true, message: 'Return requested successfully' });
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
    returnOrderItem
}