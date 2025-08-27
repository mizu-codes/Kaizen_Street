const Wallet = require('../../../models/walletSchema');
const WalletTransaction = require('../../../models/walletTransactionSchema');

const loadWalletPage = async (req, res) => {
  try {
    const userId = req.session.userId;
    if (!userId) {
      return res.redirect('/login');
    }

    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.min(20, parseInt(req.query.limit || '10', 10));

    let wallet = await Wallet.findOne({ user: userId }).lean();

    if (!wallet) {
      const newWallet = new Wallet({
        user: userId,
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
    const transactions = await WalletTransaction.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    const toDisplay = (amount) => {
      const num = Number(amount);
      return isNaN(num) ? '0.00' : num.toFixed(2);
    };



    console.log("Wallet found:", wallet);
    console.log("Wallet balance:", wallet.balance);


    res.render('profile-wallet', {
      wallet,
      transactions,
      page,
      limit,
      totalTx,
      totalPages: Math.ceil(totalTx / limit),
      toDisplay,
    });
  } catch (error) {
    console.error('Error loading wallet page:', error);
    res.status(500).render('error', {
      message: 'Unable to load wallet page',
      error: process.env.NODE_ENV === 'development' ? error : {}
    });
  }
};



module.exports = {
  loadWalletPage
}