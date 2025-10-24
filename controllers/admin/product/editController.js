const Product = require('../../../models/productSchema');
const cloudinary = require('../../../middlewares/cloudinary');
const streamifier = require('streamifier');


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

const updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      productName,
      description,
      regularPrice,
      productOffer,
      discountPrice,
      category,
      specifications,
      hasNewImages,
      imageIndexes,
      existingImages
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

    if (!productName?.trim()) throw new Error('Product name is required');
    if (!description?.trim()) throw new Error('Description is required');
    if (!regularPrice || isNaN(regularPrice) || regularPrice <= 0) throw new Error('Valid regular price is required');
    if (!discountPrice || isNaN(discountPrice) || discountPrice < 0) throw new Error('Valid discount price is required');
    if (!category) throw new Error('Category is required');
    if (size.length === 0) throw new Error('At least one size must have stock > 0');

    const product = await Product.findById(id);
    if (!product) throw new Error('Product not found');

    let finalImages = [];
    let parsedExistingImages = {};
    let parsedImageIndexes = [];

    try {
      parsedExistingImages = existingImages ? JSON.parse(existingImages) : {};
      parsedImageIndexes = imageIndexes ? JSON.parse(imageIndexes) : [];
    } catch (error) {
      console.warn('Error parsing image data:', error);
    }

    if (hasNewImages === 'true' && req.files && req.files.length > 0) {
      const uploadedImages = [];

      for (const file of req.files) {
        try {
          const uploadResult = await uploadToCloudinary(file.buffer);
          uploadedImages.push(uploadResult.secure_url);
        } catch (uploadErr) {
          console.error('Error uploading image:', uploadErr);
          throw new Error(`Failed to upload image: ${uploadErr.message}`);
        }
      }

      let newImageIndex = 0;
      for (let i = 1; i <= 3; i++) {
        if (parsedImageIndexes.includes(i)) {
          if (parsedExistingImages[`image${i}`]) {
            finalImages.push(parsedExistingImages[`image${i}`]);
          } else if (newImageIndex < uploadedImages.length) {
            finalImages.push(uploadedImages[newImageIndex]);
            newImageIndex++;
          }
        }
      }
    } else {
      for (let i = 1; i <= 3; i++) {
        if (parsedImageIndexes.includes(i) && parsedExistingImages[`image${i}`]) {
          finalImages.push(parsedExistingImages[`image${i}`]);
        }
      }
    }

    if (finalImages.length === 0) {
      finalImages = [...product.productImage];
      console.warn('No images processed, keeping existing product images');
    }

    if (finalImages.length === 0) {
      throw new Error('At least one image is required');
    }

    const updateData = {
      productName: productName.trim(),
      description: description.trim(),
      regularPrice: Number(regularPrice),
      discountPrice: Number(discountPrice),
      productOffer: Number(productOffer || 0),
      stock,
      size,
      category,
      productImage: finalImages,
      specifications: specifications?.trim() || 'No specifications provided'
    };

    const updatedProduct = await Product.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true
    });

    if (!updatedProduct) {
      throw new Error('Failed to update product');
    }

    const page = req.query.page || req.body.page || 1;
    const limit = req.query.limit || req.body.limit || 10;
    const search = req.query.search || req.body.search || '';

    const qs = new URLSearchParams({
      page: page.toString(),
      limit: limit.toString(),
      search: search.toString()
    }).toString();

    return res.status(200).json({
      success: true,
      message: 'Product updated successfully!',
      redirectUrl: `/admin/products?${qs}`
    });

  } catch (err) {
    console.error('Error updating product:', err);

    return res.status(400).json({
      success: false,
      message: err.message || 'Failed to update product'
    });
  }
};

module.exports = {
  updateProduct,
};