const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema');
const cloudinary = require('../../middlewares/cloudinary');

const cleanProductImages = (products) => {
  return products.map(product => {
    const validImages = product.productImage
      .filter(img => img && img.trim() !== '')
      .slice(0, 3);

    return {
      ...product,
      productImage: validImages
    };
  });
};

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
      stock,
      size,
      status,
      category,
      specifications,
      images
    } = req.body;

    const categories = await Category.find({ isListed: true }).lean();

    if (!productName || !regularPrice || !discountPrice || !stock || !size || !status || !category) {
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
        // Upload images to cloudinary
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

const updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      productName,
      description,
      regularPrice,
      discountPercent,
      discountPrice,
      productOffer,
      stock,
      size,
      status,
      category,
      specifications
    } = req.body;

    console.log('Update request for product:', id);
    console.log('Full req.body keys:', Object.keys(req.body));

    if (!productName || !description || !regularPrice || !discountPrice || !stock || !size || !status || !category ) {
      throw new Error('Please fill all required fields');
    }

    const product = await Product.findById(id);
    if (!product) throw new Error('Product not found');

    console.log('Current product images:', product.productImage);

    let finalImages = [];

    const imageInputs = [
      req.body.imageBase64_1,
      req.body.imageBase64_2,
      req.body.imageBase64_3
    ];

    console.log('Processing image inputs:', imageInputs.map(img =>
      img ? (img.startsWith('data:') ? 'NEW_BASE64' : 'EXISTING_URL') : 'EMPTY'
    ));

    for (let i = 0; i < imageInputs.length; i++) {
      const imageData = imageInputs[i];

      if (!imageData || imageData.trim() === '') {
        console.log(`Position ${i + 1}: Empty, skipping`);
        continue;
      }

      if (imageData.startsWith('data:image/')) {
        // New base64 image - upload to cloudinary
        console.log(`Position ${i + 1}: Uploading new base64 image`);
        try {
          const uploadResult = await cloudinary.uploader.upload(imageData, {
            folder: 'kaizen_products',
            quality: 'auto',
            fetch_format: 'auto'
          });
          finalImages.push(uploadResult.secure_url);
          console.log(`Successfully uploaded image at position ${i + 1}:`, uploadResult.secure_url);
        } catch (uploadError) {
          console.error(`Error uploading image at position ${i + 1}:`, uploadError);

          if (product.productImage[i]) {
            console.log(`Upload failed, keeping existing image at position ${i + 1}`);
            finalImages.push(product.productImage[i]);
          }
        }
      } else if (imageData.startsWith('http')) {

        console.log(`Position ${i + 1}: Keeping existing URL:`, imageData);
        finalImages.push(imageData);
      } else {

        console.log(`Position ${i + 1}: Unknown format (${imageData}), checking for existing image`);
        if (product.productImage[i] && product.productImage[i].startsWith('http')) {
          console.log(`Keeping existing image at position ${i + 1}:`, product.productImage[i]);
          finalImages.push(product.productImage[i]);
        } else {
          console.log(`No valid existing image at position ${i + 1}, skipping`);
        }
      }
    }

    if (finalImages.length === 0 && product.productImage.length > 0) {
      console.log('No images processed, keeping first existing image as fallback');
      const validExistingImages = product.productImage.filter(img =>
        img && img.trim() !== '' && img.startsWith('http')
      );
      if (validExistingImages.length > 0) {
        finalImages = validExistingImages.slice(0, 3);
      }
    }

    console.log('Final processed images:', finalImages);

    if (finalImages.length === 0) {
      throw new Error('At least one image is required');
    }

    const updateData = {
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
      productImage: finalImages
    };

    if (specifications && specifications.trim() !== '') {
      updateData.specifications = specifications.trim();
    } else {

      updateData.specifications = product.specifications || 'No specifications provided';
    }

    console.log('Updating product with final image array:', finalImages);

    const updatedProduct = await Product.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true
    });

    console.log('Product updated successfully. Final images in DB:', updatedProduct.productImage);
    req.flash('message', 'Product updated successfully');

  } catch (err) {
    console.error('Error updating product:', err);
    req.flash('error', err.message || 'Failed to update product');
  }

  const qs = new URLSearchParams({
    page: req.body.page || 1,
    limit: req.body.limit || 10,
    search: req.body.search || ''
  }).toString();
  res.redirect(`/admin/products?${qs}`);
};

const fixProductImages = async (productId, imageUrls) => {
  try {
    const product = await Product.findById(productId);
    if (!product) {
      console.log('Product not found');
      return false;
    }

    product.productImage = imageUrls.filter(url => url && url.trim() !== '');
    await product.save();
    console.log('Product images fixed:', product.productImage);
    return true;
  } catch (error) {
    console.error('Error fixing product images:', error);
    return false;
  }
};

module.exports = {
  getProductAddPage,
  addNewProduct,
  listProducts,
  toggleBlockProduct,
  updateProduct,
  cleanProductImages,
  fixProductImages
};