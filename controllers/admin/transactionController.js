const User = require('../../models/userSchema')
const WalletTransaction = require('../../models/walletTransactionSchema');
const Transaction = require('../../models/transactionSchema');

const loadTransactionsPage = async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page || '1', 10));
        const limit = parseInt(req.query.limit || '10', 10);
        const q = req.query.q?.trim() || '';
        const method = req.query.method?.trim() || '';
        const type = req.query.type?.trim() || '';

        let orderFilter = {};
        let walletFilter = {};

        if (method && method !== 'all') {
            orderFilter.paymentMethod = method;
            walletFilter.paymentMethod = method;
        }

        if (type && type !== 'all') {
            if (type === 'wallet_topup') {
                orderFilter = { _id: { $exists: false } };
                walletFilter.type = 'credit';
                walletFilter.description = { $regex: 'top-up', $options: 'i' };
            } else {
                orderFilter.type = type;
                walletFilter = { _id: { $exists: false } };
            }
        }

        if (q) {
            const searchRegex = { $regex: q, $options: 'i' };

            const users = await User.find({
                $or: [
                    { name: searchRegex },
                    { email: searchRegex }
                ]
            }).select('_id').lean();

            const userIds = users.map(user => user._id);

            orderFilter.$or = [
                { description: searchRegex },
                { gatewayTransactionId: searchRegex },
                { gatewayOrderId: searchRegex }
            ];

            if (userIds.length > 0) {
                orderFilter.$or.push({ customerId: { $in: userIds } });
            }

            walletFilter.$or = [
                { description: searchRegex }
            ];

            if (userIds.length > 0) {
                walletFilter.$or.push({ user: { $in: userIds } });
            }
        }

        const orderTransactions = await Transaction.find(orderFilter)
            .populate('customerId', 'name email phone')
            .populate('orderId', '_id totalAmount items status')
            .sort({ createdAt: -1 })
            .lean();

        const walletTransactions = await WalletTransaction.find({
            ...walletFilter,
            type: 'credit',
            description: { $regex: 'top-up', $options: 'i' }
        })
            .populate('user', 'name email phone')
            .sort({ createdAt: -1 })
            .lean();

        const transformedWalletTx = walletTransactions.map(tx => ({
            _id: tx._id,
            customerId: tx.user,
            amount: tx.amount,
            type: 'wallet_topup',
            paymentMethod: tx.paymentMethod || 'razorpay',
            status: tx.status || 'completed',
            description: tx.description,
            createdAt: tx.createdAt,
            gatewayTransactionId: tx.paymentDetails?.razorpay_payment_id || null,
            gatewayOrderId: tx.paymentDetails?.razorpay_order_id || null,
            isWalletTransaction: true,
            balanceAfter: tx.balanceAfter,
            balanceBefore: tx.balanceBefore
        }));

        const allTransactions = [...orderTransactions, ...transformedWalletTx]
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        const totalTransactions = allTransactions.length;
        const totalPages = Math.ceil(totalTransactions / limit);
        const paginatedTransactions = allTransactions.slice((page - 1) * limit, page * limit);

        const processedTransactions = paginatedTransactions.map(transaction => {
            if (transaction.orderId && transaction.orderId._id) {
                transaction.displayOrderId = transaction.orderId._id.toString().slice(-8).toUpperCase();
            }
            return transaction;
        });

        const orderStats = await Transaction.aggregate([
            ...(Object.keys(orderFilter).length > 0 ? [{ $match: orderFilter }] : []),
            {
                $group: {
                    _id: null,
                    totalAmount: { $sum: '$amount' },
                    totalOrders: { $sum: { $cond: [{ $eq: ['$type', 'order_payment'] }, 1, 0] } },
                    totalRefunds: { $sum: { $cond: [{ $eq: ['$type', 'refund'] }, 1, 0] } },
                    totalRefundAmount: {
                        $sum: {
                            $cond: [{ $eq: ['$type', 'refund'] }, '$amount', 0]
                        }
                    }
                }
            }
        ]);

        const walletStats = await WalletTransaction.aggregate([
            {
                $match: {
                    ...walletFilter,
                    type: 'credit',
                    description: { $regex: 'top-up', $options: 'i' }
                }
            },
            {
                $group: {
                    _id: null,
                    totalWalletTopups: { $sum: 1 },
                    totalWalletAmount: { $sum: '$amount' }
                }
            }
        ]);

        const orderSummary = orderStats[0] || {
            totalAmount: 0,
            totalOrders: 0,
            totalRefunds: 0,
            totalRefundAmount: 0
        };

        const walletSummary = walletStats[0] || {
            totalWalletTopups: 0,
            totalWalletAmount: 0
        };

        const summary = {
            ...orderSummary,
            totalWalletTopups: walletSummary.totalWalletTopups,
            totalWalletAmount: walletSummary.totalWalletAmount,
            grandTotal: orderSummary.totalAmount + walletSummary.totalWalletAmount
        };

        res.render('transaction-list', {
            transactions: processedTransactions,
            page,
            limit,
            totalPages,
            totalTransactions,
            q,
            method,
            type,
            summary,
            message: req.flash('message') || ''
        });

    } catch (error) {
        console.error('Error loading transactions page:', error);
        req.flash('message', 'Error loading transactions. Please try again.');
        res.render('transaction-list', {
            transactions: [],
            page: 1,
            limit: 10,
            totalPages: 0,
            totalTransactions: 0,
            q: '',
            method: '',
            type: '',
            summary: {
                totalAmount: 0,
                totalOrders: 0,
                totalRefunds: 0,
                totalRefundAmount: 0,
                totalWalletTopups: 0,
                totalWalletAmount: 0,
                grandTotal: 0
            },
            message: 'Error loading transactions. Please try again.'
        });
    }
};

const getTransactionDetails = async (req, res) => {
    try {
        const transactionId = req.params.id;

        if (!/^[0-9a-fA-F]{24}$/.test(transactionId)) {
            req.flash('message', 'Invalid transaction ID format.');
            return res.redirect('/admin/transactions');
        }

        let transaction = await Transaction.findById(transactionId)
            .populate('customerId', 'name email phone')
            .populate('orderId', '_id totalAmount items status paymentMethod paymentStatus createdAt')
            .lean();

        let isWalletTransaction = false;

        if (!transaction) {
            transaction = await WalletTransaction.findById(transactionId)
                .populate('user', 'name email phone')
                .lean();

            if (transaction) {
                isWalletTransaction = true;
                transaction = {
                    ...transaction,
                    customerId: transaction.user,
                    type: 'wallet_topup',
                    gatewayTransactionId: transaction.paymentDetails?.razorpay_payment_id,
                    gatewayOrderId: transaction.paymentDetails?.razorpay_order_id,
                    isWalletTransaction: true
                };
            }
        }

        if (!transaction) {
            req.flash('message', 'Transaction not found.');
            return res.redirect('/admin/transactions');
        }

        if (transaction.orderId && transaction.orderId._id) {
            transaction.displayOrderId = transaction.orderId._id.toString().slice(-8).toUpperCase();
        }

        let walletTransaction = null;
        if (transaction.type === 'refund' && transaction.orderId) {
            walletTransaction = await WalletTransaction.findOne({
                orderId: transaction.orderId._id,
                type: 'credit',
                amount: transaction.amount
            }).populate('user', 'name email').lean();
        }

        let originalTransaction = null;
        if (transaction.type === 'refund' && transaction.orderId) {
            originalTransaction = await Transaction.findOne({
                orderId: transaction.orderId._id,
                type: 'order_payment'
            }).lean();
        }

        res.render('transaction-details', {
            transaction,
            walletTransaction,
            originalTransaction,
            isWalletTransaction,
            message: req.flash('message') || ''
        });

    } catch (error) {
        console.error('Error fetching transaction details:', error);
        req.flash('message', 'Error fetching transaction details.');
        res.redirect('/admin/transactions');
    }
};

module.exports = {
    loadTransactionsPage,
    getTransactionDetails,
};