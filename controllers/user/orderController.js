const User = require('../../models/userSchema');
const Product = require('../../models/productSchema');
const Order = require('../../models/orderSchema');
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
            .lean();

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
            .lean();

        if (!order) {
            return res.status(404).render('pageNotFound');
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

        item.status = 'Cancelled';
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

    const order = await Order.findOne({ _id: orderId, user: userId }).populate('address').lean();
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

module.exports = {
    loadOrderPage,
    loadOrderDetailsPage,
    cancelOrderItem,
    downloadInvoicePDF 
}