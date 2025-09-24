const mongoose = require('mongoose');
const Wallet = require('../../../models/walletSchema');
const WalletTransaction = require('../../../models/walletTransactionSchema');
const crypto = require("crypto");
const Razorpay = require("razorpay");

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

const loadWalletPage = async (req, res) => {
  try {
    const userId = req.session.userId;
    if (!userId) {
      return res.redirect('/login');
    }

    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = 5;

    let wallet = await Wallet.findOne({ userId: userId }).lean();

    if (!wallet) {
      const newWallet = new Wallet({
        userId: userId,
        balance: 0,
        totalCredits: 0,
        totalDebits: 0,
        transactionCount: 0,
        isActive: true,
        isBlocked: false,
      });
      wallet = await newWallet.save();
      wallet = wallet.toObject();
    }

    const filter = { user: userId };
    const totalTx = await WalletTransaction.countDocuments(filter);
    const totalPages = Math.ceil(totalTx / limit);

    const transactions = await WalletTransaction.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    const toDisplay = (amount) => {
      const num = Number(amount);
      return isNaN(num) ? '0.00' : num.toFixed(2);
    };

    const startIndex = (page - 1) * limit + 1;
    const endIndex = Math.min(page * limit, totalTx);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;


    res.render('profile-wallet', {
      wallet,
      transactions,
      page,
      limit,
      totalTx,
      totalPages,
      startIndex,
      endIndex,
      hasNextPage,
      hasPrevPage,
      toDisplay,
    });
  } catch (error) {
    console.error('Error loading wallet page:', error);

    res.status(500).json({
      success: false,
      message: 'Unable to load wallet page. Please try again later.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });

  }
};


const createWalletRazorpayOrder = async (req, res) => {
  try {
    const userId = req.session.userId;
    const { amount } = req.body;

    if (!amount || amount <= 0 || amount > 50000) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid amount between ₹1 and ₹50,000"
      });
    }

    const options = {
      amount: Math.round(amount * 100),
      currency: "INR",
      receipt: "wallet_" + Date.now(),
      notes: {
        userId: userId,
        type: "wallet_topup"
      }
    };

    const razorpayOrder = await razorpay.orders.create(options);

    return res.json({
      success: true,
      key: process.env.RAZORPAY_KEY_ID,
      orderId: razorpayOrder.id,
      amount: razorpayOrder.amount,
      currency: razorpayOrder.currency,
      userId: userId
    });

  } catch (err) {
    console.error("Wallet Razorpay Order Error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to create payment order. Please try again."
    });
  }
};


const verifyWalletRazorpayPayment = async (req, res) => {
  try {
    const userId = req.session.userId;
    const { razorpay_payment_id, razorpay_order_id, razorpay_signature, amount } = req.body;

    const hmac = crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET);
    hmac.update(razorpay_order_id + "|" + razorpay_payment_id);
    const generatedSignature = hmac.digest("hex");

    if (generatedSignature !== razorpay_signature) {
      return res.status(400).json({
        success: false,
        message: "Payment verification failed. Please try again."
      });
    }

    const topupAmount = parseFloat(amount);
    if (!topupAmount || topupAmount <= 0 || topupAmount > 50000) {
      return res.status(400).json({
        success: false,
        message: "Invalid amount"
      });
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      let wallet = await Wallet.findOne({ userId: userId }).session(session);
      if (!wallet) {
        wallet = new Wallet({
          userId: userId,
          balance: 0,
          totalCredits: 0,
          totalDebits: 0,
          transactionCount: 0,
          isActive: true,
          isBlocked: false,
        });
      }


      const previousBalance = Number(wallet.balance || 0);

      wallet.balance = previousBalance + topupAmount;
      wallet.totalCredits = (wallet.totalCredits || 0) + topupAmount;
      wallet.transactionCount = (wallet.transactionCount || 0) + 1;

      await wallet.save({ session });


      const walletTransaction = new WalletTransaction({
        user: userId,
        wallet: wallet._id,
        type: 'credit',
        amount: topupAmount,
        description: 'Wallet top-up via Razorpay',
        status: 'completed',
        paymentMethod: 'razorpay',
        paymentDetails: {
          method: 'razorpay',
          razorpay_payment_id,
          razorpay_order_id,
          razorpay_signature
        },
        balanceBefore: previousBalance,
        balanceAfter: wallet.balance
      });

      await walletTransaction.save({ session });

      await session.commitTransaction();
      session.endSession();

      return res.json({
        success: true,
        message: `₹${topupAmount.toFixed(2)} added to your wallet successfully!`,
        newBalance: wallet.balance
      });

    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      console.error('Wallet payment processing failed:', error);
      return res.status(500).json({
        success: false,
        message: 'Payment processing failed. Please contact support if amount was deducted.'
      });
    }

  } catch (err) {
    console.error("Verify Wallet Payment Error:", err);
    res.status(500).json({
      success: false,
      message: "Payment verification error. Please try again."
    });
  }
};

module.exports = {
  loadWalletPage,
  createWalletRazorpayOrder,
  verifyWalletRazorpayPayment
};