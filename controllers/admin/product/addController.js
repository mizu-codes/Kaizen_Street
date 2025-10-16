const Product = require('../../../models/productSchema');
const Category = require('../../../models/categorySchema');
const cloudinary = require('../../../middlewares/cloudinary');
const streamifier = require('streamifier')


const getProductAddPage = async (req, res) => {
  try {
    const categories = await Category
      .find({ status: 'active' })
      .sort({ createdAt: -1 })
      .lean();

    res.render('product-add', {
      title: 'Add New Product',
      categories,
      old: {}
    });
  } catch (err) {
    console.error('Error loading Add Product page:', err);
    res.render('product-add', {
      title: 'Add New Product',
      categories: [],
      old: {},
      errorMessage: 'Unable to load form.'
    });
  }
};


const uploadToCloudinary = (buffer) => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      { folder: 'kaizen_products' },
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
      }
    );
    streamifier.createReadStream(buffer).pipe(uploadStream);
  });
};


const addNewProduct = async (req, res) => {
  console.log('=== REQUEST RECEIVED ===');
  console.log('Body:', req.body);
  console.log('Files:', req.files);
  console.log('Files length:', req.files ? req.files.length : 0);

  try {
    const {
      productName,
      description,
      regularPrice,
      discountPrice,
      productOffer,
      status,
      category,
      specifications
    } = req.body;

    const stock = {
      S: Number(req.body.stock_S || 0),
      M: Number(req.body.stock_M || 0),
      L: Number(req.body.stock_L || 0),
      XL: Number(req.body.stock_XL || 0),
      XXL: Number(req.body.stock_XXL || 0)
    };

    const size = Object.entries(stock)
      .filter(([_, qty]) => qty > 0)
      .map(([s]) => s);

    if (!productName || !regularPrice || !discountPrice || !status || !category || size.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Please fill all required fields and ensure at least one size has stock.'
      });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'At least one image is required.'
      });
    }

    console.log('Processing images:', req.files.length);

    let imageUrls = [];

    try {
      const uploadPromises = req.files.map(file => uploadToCloudinary(file.buffer));
      const uploadResults = await Promise.all(uploadPromises);
      imageUrls = uploadResults.map(r => r.secure_url);

      console.log('Images uploaded successfully:', imageUrls.length);
    } catch (uploadError) {
      console.error('Image upload error:', uploadError);
      return res.status(500).json({
        success: false,
        message: 'Failed to upload images. Please try again.'
      });
    }

    const newProduct = new Product({
      productName,
      description,
      regularPrice,
      discountPrice,
      productOffer: productOffer || 0,
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

    return res.status(200).json({
      success: true,
      message: 'Product added successfully!',
      redirectUrl: '/admin/products'
    });

  } catch (error) {
    console.error('Error adding product:', error);
    return res.status(500).json({
      success: false,
      message: 'Something went wrong. Please try again.'
    });
  }
};


module.exports = {
  getProductAddPage,
  addNewProduct
}