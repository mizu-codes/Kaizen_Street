const Product = require('../../../models/productSchema');
const cloudinary = require('../../../middlewares/cloudinary');

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
    try {
      parsedExistingImages = existingImages ? JSON.parse(existingImages) : {};
    } catch (error) {
      console.warn('Error parsing existing images:', error);
    }

    let parsedImageIndexes = [];
    try {
      parsedImageIndexes = imageIndexes ? JSON.parse(imageIndexes) : [];
    } catch (error) {
      console.warn('Error parsing image indexes:', error);
    }

    if (hasNewImages === 'true' && req.files && req.files.length > 0) {
      const uploadedImages = [];

      for (const file of req.files) {
        try {
          const b64 = file.buffer.toString("base64");
          const dataURI = `data:${file.mimetype};base64,${b64}`;

          const uploadResult = await cloudinary.uploader.upload(dataURI, {
            folder: 'kaizen_products',
            quality: 'auto',
            fetch_format: 'auto',
            resource_type: 'image',
            transformation: [
              { width: 800, height: 800, crop: 'pad', background: 'white' }
            ]
          });

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
          } else {
            if (newImageIndex < uploadedImages.length) {
              finalImages.push(uploadedImages[newImageIndex]);
              newImageIndex++;
            }
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
      discountPercent: Number(discountPercent || 0),
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

  } catch (err) {
    console.error('Error updating product:', err);

    if (req.xhr || req.headers.accept?.indexOf('json') > -1) {
      return res.status(400).json({ error: err.message });
    }
  }

  const page = req.query.page || req.body.page || 1;
  const limit = req.query.limit || req.body.limit || 10;
  const search = req.query.search || req.body.search || '';

  const qs = new URLSearchParams({
    page: page.toString(),
    limit: limit.toString(),
    search: search.toString()
  }).toString();

  res.redirect(`/admin/products?${qs}`);
};

module.exports = {
  updateProduct,
};