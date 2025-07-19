const User = require('../../models/userSchema'); 
const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema');

const loadHomepage = async (req, res) => {
    try {
        const categories = await Category.find({ isListed: true });
        let productData = await Product.find({
            isBlocked: false,
            category: { $in: categories.map(category => category._id) },
            stock: { $gt: 0 }
        }).populate({
            path: 'category',
            select: 'categoryName',
            match: { isListed: true }
        }).lean();

        productData.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        productData = productData.slice(0, 4);

        return res.render('home', { products: productData, categories });
    } catch (error) {
        console.log('Home page load error:', error);
        return res.status(500).send('Server error');
    }
};





const loadShoppingPage = async (req, res) => {
    try {

        const perPage = 6;
        const page = Math.max(parseInt(req.query.page) || 1, 1);
        const search = (req.query.search || '').trim();
        const category = req.query.category || '';
        const sortOption = req.query.sort || 'featured';

        const minPrice = parseFloat(req.query.minPrice) || 0;
        const maxPrice = parseFloat(req.query.maxPrice) || 5000;

        const filter = { isBlocked: false, stock: { $gt: 0 } };
        if (search.length) { filter.productName = { $regex: search, $options: 'i' }; }
        if (category) filter.category = category;

        filter.discountPrice = { $gte: minPrice, $lte: maxPrice };

        let sortCriteria = { createdAt: -1 };
        if (sortOption === 'low-to-high') {
            sortCriteria = { discountPrice: 1 };
        } else if (sortOption === 'high-to-low') {
            sortCriteria = { discountPrice: -1 };
        } else if (sortOption === 'a-to-z') {
            sortCriteria = { productName: 1 };
        } else if (sortOption === 'z-to-a') {
            sortCriteria = { productName: -1 };
        }

        const priceRange = await Product.aggregate([
            { $match: { isBlocked: false, stock: { $gt: 0 } } },
            {
                $group: {
                    _id: null,
                    minPrice: { $min: "$discountPrice" },
                    maxPrice: { $max: "$discountPrice" }
                }
            }
        ]);

        const actualMinPrice = priceRange.length > 0 ? Math.floor(priceRange[0].minPrice) : 0;
        const actualMaxPrice = priceRange.length > 0 ? Math.min(Math.ceil(priceRange[0].maxPrice), 5000) : 5000;

        const [categories, count, products] = await Promise.all([
            Category.find({ isListed: true }).lean(),
            Product.countDocuments(filter),
            Product.find(filter)
                .populate('category', 'categoryName')
                .sort(sortCriteria)
                .skip(perPage * (page - 1))
                .limit(perPage)
                .lean()
        ]);

        const pages = Math.ceil(count / perPage);

        res.render('shop', {
            categories,
            products,
            search,
            category,
            sort: sortOption,
            page,
            pages,
            count,
            minPrice: req.query.minPrice || 0,
            maxPrice: req.query.maxPrice || 5000,
            actualMinPrice: 0,
            actualMaxPrice: 5000,
            currentFilters: {
                search: search,
                category: category,
                sort: sortOption,
                minPrice: req.query.minPrice || '',
                maxPrice: req.query.maxPrice || ''
            }
        });
    } catch (error) {
        console.error('Shope page error:', error);
        res.redirect('/pageNotFound');
    }
};


const loadProductDetails = async (req, res) => {
    try {
        const productId = req.params.productId;

        const productDoc = await Product.findById(productId).populate('category');
        if (!productDoc || productDoc.isBlocked) {
            return res.status(404).render('page-404', { message: 'Product not found' });
        }

        const regularPrice = productDoc.regularPrice;
        const discountPrice = productDoc.discountPrice;
        const discountPercentage = regularPrice > discountPrice
            ? Math.round((1 - discountPrice / regularPrice) * 100)
            : 0;

        const relatedDocs = await Product.find({
            category: productDoc.category._id,
            _id: { $ne: productDoc._id },
            isBlocked: false,
            status: 'active',
            stock: { $gt: 0 }
        }).sort({ createdAt: -1 }).lean();


        const relatedProducts = relatedDocs.map(p => {
            const discountPercent = p.regularPrice > p.discountPrice
                ? Math.round((1 - p.discountPrice / p.regularPrice) * 100)
                : 0;
            return {
                _id: p._id,
                productName: p.productName,
                productImage: p.productImage.slice(0, 2),
                regularPrice: p.regularPrice,
                discountPrice: p.discountPrice,
                discountPercentage: discountPercent
            };
        });

        const product = {
            _id: productDoc._id,
            productName: productDoc.productName,
            category: productDoc.category._id,
            categoryName: productDoc.category.categoryName,
            regularPrice,
            discountPrice,
            discountPercentage,
            description: productDoc.description,
            specifications: productDoc.specifications || '',
            size: productDoc.size,
            productImage: productDoc.productImage.slice(0, 5)
        };

        return res.render('product-details', {
            product,
            relatedProducts,
            pageTitle: product.productName,
            selectedSize: product.size
        });

    } catch (err) {
        console.error('Error loading product details:', err);
        return res.status(500).render('500', { message: 'Internal Server Error' });
    }
};



module.exports={
    loadHomepage,
    loadShoppingPage,
    loadProductDetails,
}