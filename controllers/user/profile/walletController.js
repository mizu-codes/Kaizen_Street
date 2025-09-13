const Wallet = require('../../../models/walletSchema');
const WalletTransaction = require('../../../models/walletTransactionSchema');

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

module.exports = {
  loadWalletPage
};