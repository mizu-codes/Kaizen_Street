const Order = require('../../models/orderSchema');
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');
const moment = require('moment');

const salesController = {
    loadSalesReport: async (req, res) => {
        try {
            res.render('sales-report', {
                title: 'Sales Report'
            });
        } catch (error) {
            console.error('Error loading sales report:', error);
            res.status(500).render('admin/error', {
                message: 'Error loading sales report',
                error: error.message
            });
        }
    },

    generateReport: async (req, res) => {
        try {

            const { reportType, startDate, endDate } = req.body;

            let start, end;

            switch (reportType) {
                case 'daily':
                    start = moment().startOf('day').toDate();
                    end = moment().endOf('day').toDate();
                    break;
                case 'weekly':
                    start = moment().startOf('week').toDate();
                    end = moment().endOf('week').toDate();
                    break;
                case 'monthly':
                    start = moment().startOf('month').toDate();
                    end = moment().endOf('month').toDate();
                    break;
                case 'yearly':
                    start = moment().startOf('year').toDate();
                    end = moment().endOf('year').toDate();
                    break;
                case 'custom':
                    if (!startDate || !endDate) {
                        return res.json({
                            success: false,
                            message: 'Start date and end date are required for custom reports'
                        });
                    }
                    start = new Date(startDate);
                    end = new Date(endDate);
                    end.setHours(23, 59, 59, 999);
                    break;
                default:
                    start = moment().startOf('month').toDate();
                    end = moment().endOf('month').toDate();
            }


            const reportData = await generateReportData(reportType, start, end);

            res.json({
                success: true,
                data: reportData,
                dateRange: {
                    start: start,
                    end: end,
                    formatted: {
                        start: moment(start).format('DD/MM/YYYY'),
                        end: moment(end).format('DD/MM/YYYY')
                    }
                }
            });
        } catch (error) {
            console.error('Error generating report:', error);
            res.json({
                success: false,
                message: 'Error generating report: ' + error.message
            });
        }
    },

    downloadReport: async (req, res) => {
        try {

            const { reportType, format, startDate, endDate } = req.query;

            let start, end;

            switch (reportType) {
                case 'daily':
                    start = moment().startOf('day').toDate();
                    end = moment().endOf('day').toDate();
                    break;
                case 'weekly':
                    start = moment().startOf('week').toDate();
                    end = moment().endOf('week').toDate();
                    break;
                case 'monthly':
                    start = moment().startOf('month').toDate();
                    end = moment().endOf('month').toDate();
                    break;
                case 'yearly':
                    start = moment().startOf('year').toDate();
                    end = moment().endOf('year').toDate();
                    break;
                case 'custom':
                    if (!startDate || !endDate) {
                        return res.status(400).json({ message: 'Start date and end date are required for custom reports' });
                    }
                    start = new Date(startDate);
                    end = new Date(endDate);
                    end.setHours(23, 59, 59, 999);
                    break;
                default:
                    start = moment().startOf('month').toDate();
                    end = moment().endOf('month').toDate();
            }

            const reportData = await generateReportData(reportType, start, end);

            if (format === 'pdf') {
                await generatePDFReport(res, reportData, start, end);
            } else if (format === 'excel') {
                await generateExcelReport(res, reportData, start, end);
            } else {
                res.status(400).json({ message: 'Invalid format' });
            }

        } catch (error) {
            console.error('Error downloading report:', error);
            res.status(500).json({ message: 'Error downloading report: ' + error.message });
        }
    }
};

async function generateReportData(reportType, startDate, endDate) {
    try {

        const query = {
            placedAt: {
                $gte: startDate,
                $lte: endDate
            },
            status: {
                $nin: ['Cancelled']
            }
        };


        const orders = await Order.find(query)
            .populate('user', 'name email phone')
            .populate('items.product', 'productName productImage price')
            .populate('address')
            .sort({ placedAt: -1 })
            .lean();


        if (orders.length > 0) {
            console.log('Sample order structure:', JSON.stringify({
                orderId: orders[0].orderId,
                displayOrderId: orders[0].displayOrderId,
                totalAmount: orders[0].totalAmount,
                discount: orders[0].discount,
                status: orders[0].status,
                placedAt: orders[0].placedAt,
                itemsCount: orders[0].items?.length,
                user: orders[0].user?.name
            }, null, 2));
        }

        if (orders.length === 0) {
            return {
                statistics: {
                    totalOrders: 0,
                    totalRevenue: 0,
                    totalDiscounts: 0,
                    netSales: 0
                },
                orders: [],
                totalOrders: 0
            };
        }

        const stats = calculateOrderStatistics(orders);

        const formattedOrders = orders.map((order, index) => {
            const totalDiscount = order.discount || 0;
            const finalAmount = order.totalAmount || 0;

            const displayId = order.displayOrderId || order._id.toString().slice(-8).toUpperCase();

            return {
                orderId: displayId,
                date: order.placedAt,
                customer: {
                    name: order.user ? order.user.name : 'Guest',
                    phone: order.user?.phone || order.user?.mobile || 'N/A'
                },
                products: order.items && order.items.length > 0
                    ? order.items.map(item => {
                        return item.name ||
                            (item.product ? item.product.productName : 'Product Deleted');
                    }).join(', ')
                    : 'No products',
                itemCount: order.items ? order.items.reduce((sum, item) => sum + (item.quantity || 0), 0) : 0,
                originalAmount: finalAmount + totalDiscount,
                discount: totalDiscount,
                finalAmount: finalAmount,
                paymentMethod: formatPaymentMethod(order.paymentMethod),
                status: order.status || 'Unknown'
            };
        });

        return {
            statistics: stats,
            orders: formattedOrders,
            totalOrders: orders.length
        };

    } catch (error) {
        console.error('Error generating report data:', error);
        throw error;
    }
}

function calculateOrderStatistics(orders) {
    const stats = {
        totalOrders: orders.length,
        totalRevenue: 0,
        totalDiscounts: 0,
        netSales: 0
    };

    orders.forEach(order => {
        const totalAmount = order.totalAmount || 0;
        const discount = order.discount || 0;

        stats.totalRevenue += totalAmount;
        stats.totalDiscounts += discount;
        stats.netSales += totalAmount;
    });

    stats.totalRevenue += stats.totalDiscounts;

    return stats;
}

function formatPaymentMethod(method) {
    const paymentMethods = {
        'cod': 'Cash on Delivery',
        'razorpay': 'Razorpay',
        'wallet': 'Wallet'
    };

    return paymentMethods[method] || method || 'N/A';
}

async function generatePDFReport(res, reportData, startDate, endDate) {
    const doc = new PDFDocument();

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=sales-report-${moment().format('YYYY-MM-DD')}.pdf`);

    doc.pipe(res);

    doc.fontSize(20).text('KAIZEN STREET - Sales Report', 50, 50);
    doc.fontSize(12).text(`Period: ${moment(startDate).format('DD/MM/YYYY')} - ${moment(endDate).format('DD/MM/YYYY')}`, 50, 80);

    doc.fontSize(16).text('Summary Statistics', 50, 120);
    doc.fontSize(12);
    doc.text(`Total Orders: ${reportData.statistics.totalOrders}`, 50, 150);
    doc.text(`Total Revenue: ₹${reportData.statistics.totalRevenue.toLocaleString()}`, 50, 170);
    doc.text(`Total Discounts: ₹${reportData.statistics.totalDiscounts.toLocaleString()}`, 50, 190);
    doc.text(`Net Sales: ₹${reportData.statistics.netSales.toLocaleString()}`, 50, 210);

    let yPosition = 250;
    doc.fontSize(16).text('Order Details', 50, yPosition);
    yPosition += 30;

    doc.fontSize(10);
    doc.text('Order ID', 50, yPosition);
    doc.text('Date', 150, yPosition);
    doc.text('Customer', 220, yPosition);
    doc.text('Amount', 320, yPosition);
    doc.text('Status', 400, yPosition);
    yPosition += 20;

    reportData.orders.forEach(order => {
        if (yPosition > 750) {
            doc.addPage();
            yPosition = 50;
        }

        doc.text(`#${order.orderId}`, 50, yPosition);
        doc.text(moment(order.date).format('DD/MM/YY'), 150, yPosition);
        doc.text(order.customer.name.substring(0, 15), 220, yPosition);
        doc.text(`₹${order.finalAmount.toLocaleString()}`, 320, yPosition);
        doc.text(order.status, 400, yPosition);
        yPosition += 15;
    });

    doc.end();
}

async function generateExcelReport(res, reportData, startDate, endDate) {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Sales Report');

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=sales-report-${moment().format('YYYY-MM-DD')}.xlsx`);

    worksheet.mergeCells('A1:J1');
    worksheet.getCell('A1').value = 'KAIZEN STREET - Sales Report';
    worksheet.getCell('A1').font = { size: 16, bold: true };
    worksheet.getCell('A1').alignment = { horizontal: 'center' };

    worksheet.mergeCells('A2:J2');
    worksheet.getCell('A2').value = `Period: ${moment(startDate).format('DD/MM/YYYY')} - ${moment(endDate).format('DD/MM/YYYY')}`;
    worksheet.getCell('A2').alignment = { horizontal: 'center' };

    worksheet.getCell('A4').value = 'Summary Statistics:';
    worksheet.getCell('A4').font = { bold: true };

    worksheet.getCell('A5').value = `Total Orders: ${reportData.statistics.totalOrders}`;
    worksheet.getCell('A6').value = `Total Revenue: ₹${reportData.statistics.totalRevenue.toLocaleString()}`;
    worksheet.getCell('A7').value = `Total Discounts: ₹${reportData.statistics.totalDiscounts.toLocaleString()}`;
    worksheet.getCell('A8').value = `Net Sales: ₹${reportData.statistics.netSales.toLocaleString()}`;

    const headerRow = worksheet.getRow(10);
    headerRow.values = ['SL No', 'Order ID', 'Date', 'Customer', 'Phone', 'Products', 'Original Amount', 'Discount', 'Final Amount', 'Payment Method', 'Status'];
    headerRow.font = { bold: true };
    headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF6c63ff' }
    };
    headerRow.font = { color: { argb: 'FFFFFFFF' }, bold: true };

    reportData.orders.forEach((order, index) => {
        const row = worksheet.getRow(11 + index);
        row.values = [
            index + 1,
            `#${order.orderId}`,
            moment(order.date).format('DD/MM/YYYY'),
            order.customer.name,
            order.customer.phone,
            order.products,
            order.originalAmount,
            order.discount,
            order.finalAmount,
            order.paymentMethod,
            order.status
        ];
    });

    worksheet.columns.forEach(column => {
        column.width = 15;
    });

    await workbook.xlsx.write(res);
    res.end();
}

module.exports = salesController;