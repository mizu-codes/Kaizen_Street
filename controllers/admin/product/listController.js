const Product  = require('../../../models/productSchema');
const Category = require('../../../models/categorySchema');

const listProducts = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page)) || 1;
    const limit = Math.max(1, parseInt(req.query.limit)) || 10;
    const search = (req.query.search || '').trim();

    const filter = {};
    if (search) filter.productName = { $regex: search, $options: 'i' };

    const [total, products] = await Promise.all([
      Product.countDocuments(filter),
      Product.find(filter)
        .populate('category', 'categoryName')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean()
    ]);

    const totalPages = Math.ceil(total / limit);
    const categories = await Category.find({ isListed: true })
      .sort({ createdAt: -1 })
      .lean();

    res.render('product-list', {
      title: 'Product List',
      products,
      currentPage: page,
      totalPages,
      limit,
      search,
      message: req.flash('message')[0] || null,
      error: req.flash('error')[0] || null,
      categories
    });
  } catch (err) {
    console.error('Error listing products:', err);
    req.flash('error', 'Could not load products.');
    res.redirect('/admin');
  }
};

const toggleBlockProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const p = await Product.findById(id);
    if (!p) {
      req.flash('error', 'Product not found');
    } else {
      p.isBlocked = !p.isBlocked;
      await p.save();
      req.flash('message', p.isBlocked ? 'Product blocked' : 'Product unblocked');
    }

    const qs = new URLSearchParams({
      page: req.query.page || 1,
      limit: req.query.limit || 10,
      search: req.query.search || ''
    }).toString();
    res.redirect(`/admin/products?${qs}`);
  } catch (err) {
    console.error('Error toggling product block status:', err);
    req.flash('error', 'Failed to update product status');
    res.redirect('/admin/products');
  }
};


module.exports={
    listProducts,
    toggleBlockProduct 
}