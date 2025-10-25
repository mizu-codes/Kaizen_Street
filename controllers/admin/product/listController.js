const Product = require('../../../models/productSchema');
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
    const categories = await Category.find({ status: 'active' })
      .sort({ createdAt: -1 })
      .lean();

    res.render('product-list', {
      title: 'Product List',
      products,
      currentPage: page,
      totalPages,
      limit,
      search,
      categories,
      total
    });
  } catch (error) {
    console.error('Error listing products:', error);
    res.render('product-list', {
      title: 'Product List',
      products: [],
      currentPage: 1,
      totalPages: 0,
      limit: 10,
      search: '',
      categories: [],
      errorMessage: 'Could not load products.',
      total: 0
    });
  }
};

const toggleBlockProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const p = await Product.findById(id);

    if (!p) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    p.isBlocked = !p.isBlocked;
    await p.save();

    const qs = new URLSearchParams({
      page: req.query.page || 1,
      limit: req.query.limit || 10,
      search: req.query.search || ''
    }).toString();

    return res.status(200).json({
      success: true,
      message: p.isBlocked ? 'Product blocked successfully' : 'Product unblocked successfully',
      isBlocked: p.isBlocked,
      redirectUrl: `/admin/products?${qs}`
    });

  } catch (error) {
    console.error('Error toggling product block status:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update product status'
    });
  }
};


module.exports = {
  listProducts,
  toggleBlockProduct
}