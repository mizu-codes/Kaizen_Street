const Product = require('../../../models/productSchema');

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
    cleanProductImages,
    fixProductImages
};