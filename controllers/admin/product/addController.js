const Product  = require('../../../models/productSchema');
const Category = require('../../../models/categorySchema');
const cloudinary = require('../../../middlewares/cloudinary');


const getProductAddPage = async (req, res) => {
  try {
    const categories = await Category
      .find({ isListed: true })
      .sort({ createdAt: -1 })
      .lean();

    res.render('product-add', {
      title: 'Add New Product',
      categories,
      message: req.flash('message')[0] || null,
      error: req.flash('error')[0] || null,
      old: {}
    });
  } catch (err) {
    console.error('Error loading Add Product page:', err);
    req.flash('error', 'Unable to load form.');
    return res.redirect('/admin/products');
  }
};

const addNewProduct = async (req, res) => {
  try {
    const {
      productName,
      description,
      regularPrice,
      discountPercent,
      discountPrice,
      productOffer,
      status,
      category,
      specifications,
      images
    } = req.body;

    // Build stock object
const stock = {
  S: Number(req.body.stock_S || 0),
  M: Number(req.body.stock_M || 0),
  L: Number(req.body.stock_L || 0),
  XL: Number(req.body.stock_XL || 0),
  XXL: Number(req.body.stock_XXL || 0)
};

// Extract sizes that have stock > 0
const size = Object.entries(stock)
  .filter(([_, qty]) => qty > 0)
  .map(([s]) => s);

    const categories = await Category.find({ isListed: true }).lean();

    if (!productName || !regularPrice || !discountPrice || !status || !category || size.length === 0) {
      req.flash('error', 'Please fill all required fields.');
      return res.render('product-add', {
        title: 'Add New Product',
        categories,
        error: req.flash('error')[0],
        message: null,
        old: req.body
      });
    }

    let imageUrls = [];

    if (images) {
      const arr = Array.isArray(images) ? images : [images];
      const validImages = arr.filter(img => img && img.trim() !== '');

      console.log('Processing images:', validImages.length);

      if (validImages.length === 0) {
        req.flash('error', 'At least one image is required.');
        return res.render('product-add', {
          title: 'Add New Product',
          categories,
          error: req.flash('error')[0],
          message: null,
          old: req.body
        });
      }

      try {
        const uploadResults = await Promise.all(
          validImages.map(dataURL => cloudinary.uploader.upload(dataURL, { folder: 'kaizen_products' }))
        );
        imageUrls = uploadResults.map(r => r.secure_url);
        console.log('Images uploaded successfully:', imageUrls.length);
      } catch (uploadError) {
        console.error('Image upload error:', uploadError);
        req.flash('error', 'Failed to upload images. Please try again.');
        return res.render('product-add', {
          title: 'Add New Product',
          categories,
          error: req.flash('error')[0],
          message: null,
          old: req.body
        });
      }
    }

    const newProduct = new Product({
      productName,
      description,
      regularPrice,
      discountPrice,
      discountPercent,
      productOffer,
      stock,
      size,
      status,
      category,
      specifications,
      productImage: imageUrls
    });

    console.log('Creating product with images:', imageUrls);
    await newProduct.save();
    console.log('Product saved successfully with images:', newProduct.productImage);

    req.flash('message', 'Product added successfully');
    res.redirect('/admin/products');
  } catch (err) {
    console.error('Error adding product:', err);
    req.flash('error', 'Something went wrong. Try again.');
    res.redirect('/admin/products/add');
  }
};


module.exports={
    getProductAddPage, 
    addNewProduct
}