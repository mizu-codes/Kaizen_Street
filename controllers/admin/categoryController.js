const Category = require('../../models/categorySchema');
const Offer = require('../../models/offerSchema');

const categoryInfo = async (req, res) => {
  try {
    const search = req.query.q?.trim() || '';
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 5;
    const skip = (page - 1) * limit;

    const filter = {};
    if (search) {
      filter.categoryName = { $regex: new RegExp(search, 'i') };
    }

    const totalCount = await Category.countDocuments(filter);
    const totalPages = Math.ceil(totalCount / limit);

    const categories = await Category.find(filter)
      .populate('offerId')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const offers = await Offer.find({ active: true }).lean();
    const [message] = req.flash('message');
    const [error] = req.flash('error');

    return res.render('category-info', {
      categories,
      offers,
      q: search,
      page,
      limit,
      totalPages,
      skip,
      message: message || null,
      error: error || null
    });
  } catch (err) {
    console.error('Error fetching categories:', err);
    req.flash('error', 'Unable to load categories.');
    const [errorFallback] = req.flash('error');
    return res.render('category-info', {
      categories: [],
      offers: [],
      q: '',
      page: 1,
      limit: 5,
      totalPages: 0,
      message: null,
      error: errorFallback
    });
  }
};

const addCategory = async (req, res) => {
  try {
    const { categoryName, categoryDescription, status, offerId } = req.body;
    const redirectBase = `/admin/category?q=${encodeURIComponent(req.query.q || '')}&page=${req.query.page || 1}`;

    if (!categoryName?.trim() || !categoryDescription?.trim()) {
      req.flash('error', 'Name and description are required.');
      return res.redirect(redirectBase);
    }

    const exists = await Category.findOne({
      categoryName: categoryName.trim(),
      isListed: true
    });

    if (exists) {
      req.flash('error', `Category “${categoryName.trim()}” already exists.`);
      return res.redirect(redirectBase);
    }

    await Category.create({
      categoryName: categoryName.trim(),
      categoryDescription: categoryDescription.trim(),
      status,
      isListed: true,
      offerId: offerId || null
    });

    req.flash('message', `Category “${categoryName.trim()}” added successfully.`);
    return res.redirect(redirectBase);
  } catch (err) {
    console.error('Error adding category:', err);
    req.flash('error', 'Error adding category. Please try again.');
    return res.redirect(`/admin/category`);
  }
};


const editCategory = async (req, res) => {
  const { id } = req.params;
  const { categoryName, categoryDescription, status, isListed, offerId } = req.body;
  const redirectBase = `/admin/category?q=${encodeURIComponent(req.query.q || '')}&page=${req.query.page || 1}`;

  try {
    const updated = await Category.findByIdAndUpdate(
      id,
      {
        categoryName: categoryName.trim(),
        categoryDescription: categoryDescription.trim(),
        status,
        isListed: Boolean(isListed),
        offerId: offerId || null
      },
      { new: true }
    );
    if (!updated) throw new Error('Category not found');

    req.flash('message', 'Category updated.');
  } catch (err) {
    console.error('Error updating category:', err);
    req.flash('error', 'Error updating category.');
  }

  return res.redirect(redirectBase);
};

const deleteCategory = async (req, res) => {
  const { id } = req.params;
  const redirectBase = `/admin/category?q=${encodeURIComponent(req.query.q || '')}&page=${req.query.page || 1}`;

  try {
    const result = await Category.findByIdAndUpdate(
      id,
      { isListed: false },
      { new: true }
    );
    if (!result) throw new Error('Category not found');

    req.flash('message', 'Category blocked.');
  } catch (err) {
    console.error('Error blocking category:', err);
    req.flash('error', 'Error blocking category.');
  }
  return res.redirect(redirectBase);
};


const toggleList = async (req, res) => {
  const { id } = req.params;
  const redirectBase = `/admin/category?q=${encodeURIComponent(req.query.q || '')}&page=${req.query.page || 1}`;

  try {
    const category = await Category.findById(id);
    if (!category) throw new Error('Category not found');

    category.isListed = !category.isListed;
    await category.save();

    req.flash('message', category.isListed ? 'Category unblocked.' : 'Category blocked.');
  } catch (err) {
    console.error('Error toggling category:', err);
    req.flash('error', 'Error toggling category status.');
  }

  return res.redirect(redirectBase);
};

module.exports = {
  categoryInfo,
  addCategory,
  editCategory,
  deleteCategory,
  toggleList
};
