const Order = require('../../models/orderSchema');
const User = require('../../models/userSchema');
const Product = require('../../models/productSchema');


const loadOrderPage = async (req, res, next) => {
  try {
    const page   = parseInt(req.query.page, 10) || 1;
    const limit  = 10;
    const skip   = (page - 1) * limit;
    const q      = (req.query.q || '').trim();
    const status = (req.query.status || '').trim();

    const filter = {};

    if (status && status !== 'all') {
      filter.status = status;
    }

    if (q) {
      const regex = new RegExp(q, 'i');
      filter.$or = [
        { orderId: regex },
        { 'items.name': regex },
        { 'user.name': regex }
      ];
    }

    const agg = Order.aggregate([
      {
        $lookup: {
          from: 'users',
          localField: 'user',
          foreignField: '_id',
          as: 'user'
        }
      },
      { $unwind: '$user' },
      ...(filter.status ? [{ $match: { status: filter.status } }] : []),
      ...(filter.$or ? [{ $match: { $or: filter.$or } }] : []),
      { $sort: { createdAt: -1 } },
      {
        $facet: {
          data: [ { $skip: skip }, { $limit: limit } ],
          total: [ { $count: 'count' } ]
        }
      }
    ]);

    const [{ data: orders, total }] = await agg.exec();
    const totalCount = total[0]?.count || 0;
    const totalPages = Math.ceil(totalCount / limit);

    res.render('order-list', {
      orders,
      _page: page,
      _limit: limit,
      totalPages,
      _q: q,
      _status: status || 'all'
    });

  } catch (error) {
    console.error('Error in admin loadOrderPage:', error);
    next(err);
  }
};




module.exports={
    loadOrderPage
}