const Category = require('../../models/categorySchema');
const Product = require('../../models/productSchema');

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
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const categoriesWithCount = await Promise.all(
      categories.map(async (cat) => {
        const count = await Product.countDocuments({ category: cat._id });
        return { ...cat, itemCount: count };
      })
    );

    const message = req.query.success;
    const error = req.query.error;

    return res.render('category-info', {
      categories: categoriesWithCount,
      q: search,
      page,
      limit,
      totalPages,
      skip,
      message: message || null,
      error: error || null
    });
  } catch (error) {
    console.error('Error fetching categories:', error);
    return res.redirect(`/admin/category?error=${encodeURIComponent('Unable to load categories.')}`);
  }
};

const addCategory = async (req, res) => {
  try {
    const { categoryName, categoryDescription, status } = req.body;
    const redirectBase = `/admin/category?q=${encodeURIComponent(req.query.q || '')}&page=${req.query.page || 1}`;

    if (!categoryName?.trim() || !categoryDescription?.trim()) {
      return res.redirect(`${redirectBase}&error=${encodeURIComponent('Name and description are required.')}`);
    }

    const exists = await Category.findOne({
      categoryName: { $regex: new RegExp(`^${categoryName.trim()}$`, 'i') }
    });

    if (exists) {
      return res.redirect(`${redirectBase}&error=${encodeURIComponent(`Category "${categoryName.trim()}" already exists.`)}`);
    }

    await Category.create({
      categoryName: categoryName.trim(),
      categoryDescription: categoryDescription.trim(),
      status,
      categoryOffer: 0
    });

    return res.redirect(`${redirectBase}&success=${encodeURIComponent(`Category "${categoryName.trim()}" added successfully.`)}`);
  } catch (err) {
    console.error('Error adding category:', err);
    const redirectBase = `/admin/category?q=${encodeURIComponent(req.query.q || '')}&page=${req.query.page || 1}`;
    return res.redirect(`${redirectBase}&error=${encodeURIComponent('Error adding category. Please try again.')}`);
  }
};

const editCategory = async (req, res) => {
  const { id } = req.params;
  const { categoryName, categoryDescription, status } = req.body;
  const redirectBase = `/admin/category?q=${encodeURIComponent(req.query.q || '')}&page=${req.query.page || 1}`;

  if (!categoryName || !categoryName.trim() || !categoryDescription || !categoryDescription.trim()) {
    return res.redirect(`${redirectBase}&error=${encodeURIComponent('Name and description are required.')}`);
  }

  try {
    const exists = await Category.findOne({
      _id: { $ne: id },
      categoryName: { $regex: new RegExp(`^${categoryName.trim()}$`, 'i') }
    });

    if (exists) {
      return res.redirect(`${redirectBase}&error=${encodeURIComponent(`Category "${categoryName.trim()}" already exists.`)}`);
    }

    const updated = await Category.findByIdAndUpdate(
      id,
      {
        categoryName: categoryName.trim(),
        categoryDescription: categoryDescription.trim(),
        status
      },
      { new: true }
    );
    if (!updated) throw new Error('Category not found');

    return res.redirect(`${redirectBase}&success=${encodeURIComponent('Category updated successfully.')}`);
  } catch (err) {
    console.error('Error updating category:', err);
    return res.redirect(`${redirectBase}&error=${encodeURIComponent('Error updating category.')}`);
  }
};

const toggleStatus = async (req, res) => {
  const { id } = req.params;
  const redirectBase = `/admin/category?q=${encodeURIComponent(req.query.q || '')}&page=${req.query.page || 1}`;

  try {
    const category = await Category.findById(id);
    if (!category) throw new Error('Category not found');

    category.status = (category.status === 'active') ? 'inactive' : 'active';
    await category.save();

    const statusMessage = category.status === 'active' ? 'Category activated.' : 'Category deactivated.';
    return res.redirect(`${redirectBase}&success=${encodeURIComponent(statusMessage)}`);
  } catch (error) {
    console.error('Error toggling category status:', error);
    return res.redirect(`${redirectBase}&error=${encodeURIComponent('Error toggling category status.')}`);
  }
};

const addCategoryOffer = async (req, res) => {
  const { id } = req.params;
  const { categoryOffer } = req.body;
  const redirectBase = `/admin/category?q=${encodeURIComponent(req.query.q || '')}&page=${req.query.page || 1}`;

  try {
    const discount = parseFloat(categoryOffer);

    if (!categoryOffer || discount < 1 || discount > 100) {
      return res.redirect(`${redirectBase}&error=${encodeURIComponent('Please enter a valid discount percentage between 1-100.')}`);
    }

    const updated = await Category.findByIdAndUpdate(
      id,
      { categoryOffer: discount },
      { new: true }
    );

    if (!updated) {
      return res.redirect(`${redirectBase}&error=${encodeURIComponent('Category not found.')}`);
    }

    return res.redirect(`${redirectBase}&success=${encodeURIComponent(`${discount}% offer added to "${updated.categoryName}" successfully.`)}`);
  } catch (error) {
    console.error('Error adding category offer:', error);
    return res.redirect(`${redirectBase}&error=${encodeURIComponent('Error adding offer. Please try again.')}`);
  }
};

const removeCategoryOffer = async (req, res) => {
  const { id } = req.params;
  const redirectBase = `/admin/category?q=${encodeURIComponent(req.query.q || '')}&page=${req.query.page || 1}`;

  try {
    const updated = await Category.findByIdAndUpdate(
      id,
      { categoryOffer: 0 },
      { new: true }
    );

    if (!updated) {
      return res.redirect(`${redirectBase}&error=${encodeURIComponent('Category not found.')}`);
    }

    return res.redirect(`${redirectBase}&success=${encodeURIComponent(`Offer removed from "${updated.categoryName}" successfully.`)}`);
  } catch (error) {
    console.error('Error removing category offer:', error);
    return res.redirect(`${redirectBase}&error=${encodeURIComponent('Error removing offer. Please try again.')}`);
  }
};

module.exports = {
  categoryInfo,
  addCategory,
  editCategory,
  toggleStatus,
  addCategoryOffer,
  removeCategoryOffer
};