const Product    = require('../../../models/productSchema');
const cloudinary = require('../../../middlewares/cloudinary');
const { cleanProductImages, fixProductImages } = require('./imageUtils');

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

module.exports={
    updateProduct
}