const User = require('../../models/userSchema');
const Transaction = require('../../models/transactionSchema');
const Order = require('../../models/orderSchema');

const loadDashboard = async (req, res) => {
    try {
        if (!req.session || !req.session.admin) {
            return res.redirect('/admin/login');
        }

        const admin = await User.findById(req.session.admin);

        const filter = req.query.filter || 'weekly';

        const now = new Date();
        let currentPeriodStart, previousPeriodStart, previousPeriodEnd;

        switch (filter) {
            case 'daily':
                currentPeriodStart = new Date(now.setHours(0, 0, 0, 0));
                previousPeriodEnd = new Date(currentPeriodStart);
                previousPeriodStart = new Date(previousPeriodEnd);
                previousPeriodStart.setDate(previousPeriodStart.getDate() - 1);
                break;
            case 'weekly':
                currentPeriodStart = new Date(now);
                currentPeriodStart.setDate(currentPeriodStart.getDate() - 7);
                previousPeriodEnd = new Date(currentPeriodStart);
                previousPeriodStart = new Date(previousPeriodEnd);
                previousPeriodStart.setDate(previousPeriodStart.getDate() - 7);
                break;
            case 'monthly':
                currentPeriodStart = new Date(now);
                currentPeriodStart.setDate(currentPeriodStart.getDate() - 30);
                previousPeriodEnd = new Date(currentPeriodStart);
                previousPeriodStart = new Date(previousPeriodEnd);
                previousPeriodStart.setDate(previousPeriodStart.getDate() - 30);
                break;
            case 'yearly':
                currentPeriodStart = new Date(now);
                currentPeriodStart.setFullYear(currentPeriodStart.getFullYear() - 1);
                previousPeriodEnd = new Date(currentPeriodStart);
                previousPeriodStart = new Date(previousPeriodEnd);
                previousPeriodStart.setFullYear(previousPeriodStart.getFullYear() - 1);
                break;
            default:
                currentPeriodStart = new Date(now);
                currentPeriodStart.setDate(currentPeriodStart.getDate() - 7);
                previousPeriodEnd = new Date(currentPeriodStart);
                previousPeriodStart = new Date(previousPeriodEnd);
                previousPeriodStart.setDate(previousPeriodStart.getDate() - 7);
        }

        const currentOrders = await Order.aggregate([
            {
                $match: {
                    placedAt: { $gte: currentPeriodStart },
                    status: { $nin: ['Cancelled', 'Payment Failed'] }
                }
            },
            {
                $group: {
                    _id: null,
                    totalSales: { $sum: '$totalAmount' },
                    totalOrders: { $sum: 1 }
                }
            }
        ]);

        const previousOrders = await Order.aggregate([
            {
                $match: {
                    placedAt: { $gte: previousPeriodStart, $lt: previousPeriodEnd },
                    status: { $nin: ['Cancelled', 'Payment Failed'] }
                }
            },
            {
                $group: {
                    _id: null,
                    totalSales: { $sum: '$totalAmount' },
                    totalOrders: { $sum: 1 }
                }
            }
        ]);

        const productsSoldCurrent = await Order.aggregate([
            {
                $match: {
                    placedAt: { $gte: currentPeriodStart },
                    status: { $nin: ['Cancelled', 'Payment Failed'] }
                }
            },
            { $unwind: '$items' },
            {
                $group: {
                    _id: null,
                    totalProducts: { $sum: '$items.quantity' }
                }
            }
        ]);

        const productsSoldPrevious = await Order.aggregate([
            {
                $match: {
                    placedAt: { $gte: previousPeriodStart, $lt: previousPeriodEnd },
                    status: { $nin: ['Cancelled', 'Payment Failed'] }
                }
            },
            { $unwind: '$items' },
            {
                $group: {
                    _id: null,
                    totalProducts: { $sum: '$items.quantity' }
                }
            }
        ]);

        const newCustomersCurrent = await User.countDocuments({
            createdAt: { $gte: currentPeriodStart },
            isAdmin: false
        });

        const newCustomersPrevious = await User.countDocuments({
            createdAt: { $gte: previousPeriodStart, $lt: previousPeriodEnd },
            isAdmin: false
        });

        const calculateChange = (current, previous) => {
            if (!previous || previous === 0) {
                return current > 0 ? 100 : 0;
            }
            return (((current - previous) / previous) * 100).toFixed(0);
        };

        const currentSalesValue = currentOrders[0]?.totalSales || 0;
        const previousSalesValue = previousOrders[0]?.totalSales || 0;
        const salesChange = calculateChange(currentSalesValue, previousSalesValue);

        const currentOrdersValue = currentOrders[0]?.totalOrders || 0;
        const previousOrdersValue = previousOrders[0]?.totalOrders || 0;
        const ordersChange = calculateChange(currentOrdersValue, previousOrdersValue);

        const currentProductsValue = productsSoldCurrent[0]?.totalProducts || 0;
        const previousProductsValue = productsSoldPrevious[0]?.totalProducts || 0;
        const productsChange = calculateChange(currentProductsValue, previousProductsValue);

        const customersChange = calculateChange(newCustomersCurrent, newCustomersPrevious);

        let revenueLabels = [];
        let revenueValues = [];

        if (filter === 'daily') {
            revenueLabels = Array.from({ length: 24 }, (_, i) => `${i}:00`);
            const hourlyData = await Order.aggregate([
                {
                    $match: {
                        placedAt: { $gte: currentPeriodStart },
                        status: { $nin: ['Cancelled', 'Payment Failed'] }
                    }
                },
                {
                    $group: {
                        _id: { $hour: '$placedAt' },
                        revenue: { $sum: '$totalAmount' }
                    }
                }
            ]);
            revenueValues = revenueLabels.map((_, index) => {
                const found = hourlyData.find(d => d._id === index);
                return found ? found.revenue : 0;
            });
        } else if (filter === 'weekly') {
            revenueLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
            const weeklyData = await Order.aggregate([
                {
                    $match: {
                        placedAt: { $gte: currentPeriodStart },
                        status: { $nin: ['Cancelled', 'Payment Failed'] }
                    }
                },
                {
                    $group: {
                        _id: { $dayOfWeek: '$placedAt' },
                        revenue: { $sum: '$totalAmount' }
                    }
                }
            ]);
            revenueValues = revenueLabels.map((_, index) => {
                const found = weeklyData.find(d => d._id === index + 1);
                return found ? found.revenue : 0;
            });
        } else if (filter === 'monthly') {
            revenueLabels = Array.from({ length: 30 }, (_, i) => `${i + 1}`);
            const monthlyData = await Order.aggregate([
                {
                    $match: {
                        placedAt: { $gte: currentPeriodStart },
                        status: { $nin: ['Cancelled', 'Payment Failed'] }
                    }
                },
                {
                    $group: {
                        _id: { $dayOfMonth: '$placedAt' },
                        revenue: { $sum: '$totalAmount' }
                    }
                }
            ]);
            revenueValues = revenueLabels.map((label, index) => {
                const found = monthlyData.find(d => d._id === index + 1);
                return found ? found.revenue : 0;
            });
        } else if (filter === 'yearly') {
            revenueLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            const yearlyData = await Order.aggregate([
                {
                    $match: {
                        placedAt: { $gte: currentPeriodStart },
                        status: { $nin: ['Cancelled', 'Payment Failed'] }
                    }
                },
                {
                    $group: {
                        _id: { $month: '$placedAt' },
                        revenue: { $sum: '$totalAmount' }
                    }
                }
            ]);
            revenueValues = revenueLabels.map((_, index) => {
                const found = yearlyData.find(d => d._id === index + 1);
                return found ? found.revenue : 0;
            });
        }

        const topProducts = await Order.aggregate([
            {
                $match: {
                    status: { $nin: ['Cancelled', 'Payment Failed'] }
                }
            },
            { $unwind: '$items' },
            {
                $group: {
                    _id: '$items.product',
                    productName: { $first: '$items.name' },
                    totalQuantity: { $sum: '$items.quantity' },
                    totalRevenue: { $sum: '$items.subtotal' }
                }
            },
            { $sort: { totalQuantity: -1 } },
            { $limit: 10 }
        ]);

        const topCategories = await Order.aggregate([
            {
                $match: {
                    status: { $nin: ['Cancelled', 'Payment Failed'] }
                }
            },
            { $unwind: '$items' },
            {
                $lookup: {
                    from: 'products',
                    localField: 'items.product',
                    foreignField: '_id',
                    as: 'productInfo'
                }
            },
            { $unwind: '$productInfo' },
            {
                $lookup: {
                    from: 'categories',
                    localField: 'productInfo.category',
                    foreignField: '_id',
                    as: 'categoryInfo'
                }
            },
            { $unwind: '$categoryInfo' },
            {
                $group: {
                    _id: '$categoryInfo._id',
                    categoryName: { $first: '$categoryInfo.categoryName' },
                    totalQuantity: { $sum: '$items.quantity' },
                    totalRevenue: { $sum: '$items.subtotal' }
                }
            },
            { $sort: { totalQuantity: -1 } },
            { $limit: 10 }
        ]);

        let comparisonText = 'than yesterday';
        if (filter === 'weekly') comparisonText = 'than last week';
        else if (filter === 'monthly') comparisonText = 'than last month';
        else if (filter === 'yearly') comparisonText = 'than last year';

        res.render('admin-dashboard', {
            adminName: admin ? admin.name : 'Admin',
            todaySales: currentSalesValue,
            salesChange,
            totalOrders: currentOrdersValue,
            ordersChange,
            productsSold: currentProductsValue,
            productsChange,
            newCustomers: newCustomersCurrent,
            customersChange,
            comparisonText,
            revenueLabels: JSON.stringify(revenueLabels),
            revenueValues: JSON.stringify(revenueValues),
            topProducts,
            topCategories,
            topCategoriesChart: JSON.stringify(topCategories.slice(0, 5)),
            filter
        });

    } catch (error) {
        console.error('Dashboard load error:', error);
        res.redirect('/admin/login');
    }
};

module.exports = {
    loadDashboard
};