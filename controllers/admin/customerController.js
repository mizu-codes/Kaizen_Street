const User = require('../../models/userSchema');

const customerInfo = async (req, res) => {
  const { q = '', page = '1', limit = '5' } = req.query;
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const pageSize = Math.min(50, parseInt(limit, 10) || 5);

  const filter = { isAdmin: false };
  if (q.trim()) {
    const re = new RegExp(q.trim(), 'i');
    filter.$or = [{ name: re }, { email: re }];
  }

  try {
    const [count, customers] = await Promise.all([
      User.countDocuments(filter),
      User.find(filter)
        .sort({ createdAt: -1 })
        .skip((pageNum - 1) * pageSize)
        .limit(pageSize)
        .lean()
    ]);

    const totalPages = Math.ceil(count / pageSize) || 1;

    if (pageNum > totalPages) {
      return res.redirect(`?q=${encodeURIComponent(q)}&page=${totalPages}`);
    }

    res.render('customer-info', {
      customers,
      message: null,
      q,
      page: pageNum,
      limit: pageSize,
      totalPages
    });
  } catch (error) {
    console.error('Error loading customers:', error);
    res.render('customer-info', {
      customers: [],
      message: 'Failed to load customers.',
      q,
      page: 1,
      limit: 5,
      totalPages: 1
    });
  }
};

const blockUser = async (req, res) => {
  try {
    const { id } = req.params;

    if (!req.session || !req.session.admin) {
      return res.redirect('/admin/login');
    }

    await User.updateOne(
      { _id: id, isAdmin: false },
      { $set: { isBlocked: true } }
    );

    if (req.session.userId === id) {
      delete req.session.userId;
    }

    req.session.save((err) => {
      if (err) {
        console.error('Session save error:', err);
        return res.redirect('/admin/user');
      }
      return res.redirect('/admin/user');
    });

  } catch (error) {
    console.error('Error blocking user:', error);
    return res.redirect('/admin/user');
  }
};

const unblockUser = async (req, res) => {
  try {
    const { id } = req.params;

    if (!req.session || !req.session.admin) {
      return res.redirect('/admin/login');
    }

    await User.updateOne(
      { _id: id, isAdmin: false },
      { $set: { isBlocked: false } }
    );

    if (req.session.userId === id) {
      delete req.session.userId;
    }

    req.session.save((err) => {
      if (err) {
        console.error('Session save error:', err);
      }
      return res.redirect('/admin/user');
    });
  } catch (error) {
    console.error('Error unblocking user:', error);
    return res.redirect('/admin/user');
  }
};

module.exports = {
  customerInfo,
  blockUser,
  unblockUser
}