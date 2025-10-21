const Order = require('../../models/orderSchema');
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');
const moment = require('moment');


function isFutureDateError(startDate, endDate) {
    const now = moment().endOf('day');

    if (moment(startDate).isAfter(now)) {
        return {
            error: true,
            message: 'Start date cannot be in the future'
        };
    }

    if (moment(endDate).isAfter(now)) {
        return {
            error: true,
            message: 'End date cannot be in the future'
        };
    }

    if (moment(startDate).isAfter(moment(endDate))) {
        return {
            error: true,
            message: 'Start date cannot be after end date'
        };
    }

    return { error: false };
}

function formatPaymentMethod(method) {
    const paymentMethods = {
        'cod': 'COD',
        'razorpay': 'Razorpay',
        'wallet': 'Wallet'
    };
    return paymentMethods[method] || method || 'N/A';
}

function calculateOrderStatistics(orders) {
    const stats = {
        totalOrders: 0,
        totalRevenue: 0,
        totalDiscounts: 0,
        netSales: 0
    };

    stats.totalOrders = orders.length;

    const validOrders = orders.filter(order => {
        return order.status !== 'Cancelled' &&
            order.status !== 'Payment Failed';
    });

    validOrders.forEach(order => {
        const totalAmount = order.totalAmount || 0;
        const discount = order.discount || 0;

        stats.totalRevenue += (totalAmount + discount);
        stats.totalDiscounts += discount;
        stats.netSales += totalAmount;
    });

    return stats;
}

function wrapText(text, maxCharsPerLine) {
    if (!text) return [];
    const lines = [];
    const words = text.split(', ');
    let currentLine = '';

    words.forEach(word => {
        if ((currentLine + word).length > maxCharsPerLine) {
            if (currentLine) lines.push(currentLine);
            currentLine = word;
        } else {
            currentLine = currentLine ? currentLine + ', ' + word : word;
        }
    });

    if (currentLine) lines.push(currentLine);
    return lines;
}

function drawTableRow(doc, startX, y, height, widths, data, isHeader) {
    let xPos = startX;

    Object.keys(widths).forEach((key, index) => {
        const width = widths[key];

        doc.rect(xPos, y, width, height);
        if (isHeader) {
            doc.fillColor('#f0f0f0').fill();
            doc.stroke();
        } else {
            doc.stroke();
        }

        const text = data[index] || '';
        const padding = 3;
        const textY = y + (height / 2) - 4;

        if (isHeader) {
            doc.font('Helvetica-Bold').fontSize(9);
        } else {
            doc.font('Helvetica').fontSize(8.5);
        }

        let align = 'left';
        if (key === 'qty' || key === 'sl') {
            align = 'center';
        } else if (key === 'amount' || key === 'discount' || key === 'final') {
            align = 'right';
        }

        doc.fillColor('#000000');
        doc.text(text, xPos + padding, textY, {
            width: width - (2 * padding),
            align: align,
            ellipsis: true,
            lineBreak: false
        });

        xPos += width;
    });
}


const salesController = {
    loadSalesReport: async (req, res) => {
        try {
            const page = parseInt(req.query.page) || 1;
            const limit = 10;
            const reportType = req.query.reportType || 'monthly';
            const startDate = req.query.startDate;
            const endDate = req.query.endDate;

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
                    if (startDate && endDate) {
                        start = new Date(startDate);
                        end = new Date(endDate);
                        end.setHours(23, 59, 59, 999);
                    } else {
                        start = moment().startOf('month').toDate();
                        end = moment().endOf('month').toDate();
                    }
                    break;
                default:
                    start = moment().startOf('month').toDate();
                    end = moment().endOf('month').toDate();
            }

            const reportData = await generateReportDataWithPagination(
                reportType, start, end, page, limit
            );

            res.render('sales-report', {
                title: 'Sales Report',
                reportData: reportData,
                currentPage: page,
                totalPages: reportData.totalPages,
                reportType: reportType,
                startDate: startDate || '',
                endDate: endDate || '',
                dateRange: {
                    start: moment(start).format('DD/MM/YYYY'),
                    end: moment(end).format('DD/MM/YYYY'),
                    reportType: reportType
                },
                moment: moment
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
            const { reportType, startDate, endDate, page = 1 } = req.body;
            const limit = 10;
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
                    const dateError = isFutureDateError(start, end);
                    if (dateError.error) {
                        return res.json({
                            success: false,
                            message: dateError.message
                        });
                    }
                    break;
                default:
                    start = moment().startOf('month').toDate();
                    end = moment().endOf('month').toDate();
            }

            const reportData = await generateReportDataWithPagination(
                reportType, start, end, page, limit
            );

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
                        return res.status(400).json({
                            message: 'Start date and end date are required for custom reports'
                        });
                    }
                    start = new Date(startDate);
                    end = new Date(endDate);
                    end.setHours(23, 59, 59, 999);

                    const dateError = isFutureDateError(start, end);
                    if (dateError.error) {
                        return res.status(400).json({
                            message: dateError.message
                        });
                    }
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
            res.status(500).json({
                message: 'Error downloading report: ' + error.message
            });
        }
    }
};

async function generateReportDataWithPagination(reportType, startDate, endDate, page, limit) {
    try {
        const query = {
            placedAt: {
                $gte: startDate,
                $lte: endDate
            }
        };

        const totalOrders = await Order.countDocuments(query);

        const totalPages = Math.ceil(totalOrders / limit);
        const skip = (page - 1) * limit;

        const orders = await Order.find(query)
            .populate('user', 'name email phone')
            .populate('items.product', 'productName productImage price')
            .populate('address')
            .sort({ placedAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean();

        const allOrders = await Order.find(query).lean();
        const stats = calculateOrderStatistics(allOrders);

        const formattedOrders = orders.map((order) => {
            const totalDiscount = order.discount || 0;
            const finalAmount = order.totalAmount || 0;
            const displayId = order.displayOrderId ||
                order._id.toString().slice(-8).toUpperCase();

            return {
                orderId: displayId,
                date: order.placedAt,
                customer: {
                    name: order.user ? order.user.name : 'Guest',
                    phone: order.user?.phone || order.user?.mobile || 'N/A'
                },
                products: order.items && order.items.length > 0
                    ? order.items.map(function (item) {
                        return item.name || (item.product ? item.product.productName : 'Product Deleted');
                    })
                    : [],

                itemCount: order.items ?
                    order.items.reduce((sum, item) => sum + (item.quantity || 0), 0) : 0,
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
            totalOrders: totalOrders,
            currentPage: page,
            totalPages: totalPages,
            hasNextPage: page < totalPages,
            hasPrevPage: page > 1
        };
    } catch (error) {
        console.error('Error generating report data:', error);
        throw error;
    }
}

async function generateReportData(reportType, startDate, endDate) {
    try {
        const query = {
            placedAt: {
                $gte: startDate,
                $lte: endDate
            }
        };

        const allOrders = await Order.find(query)
            .populate('user', 'name email phone')
            .populate('items.product', 'productName productImage price')
            .populate('address')
            .sort({ placedAt: -1 })
            .lean();

        if (allOrders.length === 0) {
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

        const stats = calculateOrderStatistics(allOrders);

        const formattedOrders = allOrders.map((order) => {
            const totalDiscount = order.discount || 0;
            const finalAmount = order.totalAmount || 0;
            const displayId = order.displayOrderId ||
                order._id.toString().slice(-8).toUpperCase();

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
                itemCount: order.items ?
                    order.items.reduce((sum, item) => sum + (item.quantity || 0), 0) : 0,
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
            totalOrders: formattedOrders.length
        };
    } catch (error) {
        console.error('Error generating report data:', error);
        throw error;
    }
}

async function generatePDFReport(res, reportData, startDate, endDate) {
    const doc = new PDFDocument({ margin: 20, size: 'A4', layout: 'landscape' });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition',
        `attachment; filename=sales-report-${moment().format('YYYY-MM-DD')}.pdf`);

    doc.pipe(res);

    doc.fontSize(18).font('Helvetica-Bold')
        .text('KAIZEN STREET - Sales Report', 30, 25);

    doc.fontSize(11).font('Helvetica')
        .text(`Period: ${moment(startDate).format('DD/MM/YYYY')} - ${moment(endDate).format('DD/MM/YYYY')}`, 30, 48);

    const generatedTime = moment().format('DD/MM/YYYY HH:mm:ss');
    doc.fontSize(10).font('Helvetica-Oblique')
        .text(`Report Generated on: ${generatedTime}`, 30, 65);

    let yPosition = 95;
    doc.fontSize(13).font('Helvetica-Bold').text('Summary Statistics', 30, yPosition);
    yPosition += 20;


    doc.fontSize(10).font('Helvetica');
    doc.text(`Total Orders: ${reportData.statistics.totalOrders}`, 30, yPosition);
    yPosition += 17;
    doc.text(`Total Revenue: Rs ${reportData.statistics.totalRevenue.toLocaleString('en-IN')}`, 30, yPosition);
    yPosition += 17;
    doc.text(`Total Discounts: Rs ${reportData.statistics.totalDiscounts.toLocaleString('en-IN')}`, 30, yPosition);
    yPosition += 17;
    doc.text(`Net Sales: Rs ${reportData.statistics.netSales.toLocaleString('en-IN')}`, 30, yPosition);
    yPosition += 25;

    doc.fontSize(11).font('Helvetica-Bold').text('Order Details', 30, yPosition);
    yPosition += 25;

    const tableLeft = 25;
    const rowHeight = 20;

    const columnWidths = {
        sl: 25,
        orderId: 65,
        date: 60,
        customer: 90,
        product: 110,
        qty: 35,
        amount: 60,
        discount: 60,
        final: 65,
        payment: 55
    };

    drawTableRow(doc, tableLeft, yPosition, rowHeight, columnWidths, [
        'SL', 'Order ID', 'Date', 'Customer', 'Product', 'Qty',
        'Amount', 'Discount', 'Final', 'Payment'
    ], true);

    yPosition += rowHeight;
    doc.fontSize(9).font('Helvetica');

    reportData.orders.forEach((order, index) => {
        if (yPosition > 520) {
            doc.addPage();
            yPosition = 30;

            doc.fontSize(10).font('Helvetica-Bold');
            drawTableRow(doc, tableLeft, yPosition, rowHeight, columnWidths, [
                'SL', 'Order ID', 'Date', 'Customer', 'Product', 'Qty',
                'Amount', 'Discount', 'Final', 'Payment'
            ], true);

            yPosition += rowHeight;
            doc.fontSize(9).font('Helvetica');
        }

        const rowData = [
            (index + 1).toString(),
            `#${order.orderId}`,
            moment(order.date).format('DD/MM/YYYY'),
            order.customer.name.length > 18 ?
                order.customer.name.substring(0, 18) : order.customer.name,
            order.products.length > 18 ?
                order.products.substring(0, 18) + '..' : order.products,
            order.itemCount.toString(),
            `Rs ${order.originalAmount.toLocaleString('en-IN')}`,
            `Rs ${order.discount.toLocaleString('en-IN')}`,
            `Rs ${order.finalAmount.toLocaleString('en-IN')}`,
            order.paymentMethod
        ];

        drawTableRow(doc, tableLeft, yPosition, rowHeight, columnWidths, rowData, false);
        yPosition += rowHeight;
    });

    doc.end();
}

async function generateExcelReport(res, reportData, startDate, endDate) {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Sales Report');

    res.setHeader('Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition',
        `attachment; filename=sales-report-${moment().format('YYYY-MM-DD')}.xlsx`);

    worksheet.mergeCells('A1:L1');
    worksheet.getCell('A1').value = 'KAIZEN STREET - Sales Report';
    worksheet.getCell('A1').font = { size: 16, bold: true };
    worksheet.getCell('A1').alignment = { horizontal: 'center' };

    worksheet.mergeCells('A2:L2');
    worksheet.getCell('A2').value =
        `Period: ${moment(startDate).format('DD/MM/YYYY')} - ${moment(endDate).format('DD/MM/YYYY')}`;
    worksheet.getCell('A2').alignment = { horizontal: 'center' };

    worksheet.getCell('A4').value = 'Summary Statistics:';
    worksheet.getCell('A4').font = { bold: true };

    worksheet.getCell('A5').value = `Total Orders: ${reportData.statistics.totalOrders}`;
    worksheet.getCell('A6').value =
        `Total Revenue: Rs ${reportData.statistics.totalRevenue.toLocaleString()}`;
    worksheet.getCell('A7').value =
        `Total Discounts: Rs ${reportData.statistics.totalDiscounts.toLocaleString()}`;
    worksheet.getCell('A8').value =
        `Net Sales: Rs ${reportData.statistics.netSales.toLocaleString()}`;

    const headerRow = worksheet.getRow(10);
    headerRow.values = [
        'SL No', 'Order ID', 'Date', 'Customer', 'Phone', 'Products',
        'No of Products', 'Original Amount', 'Discount', 'Final Amount',
        'Payment Method', 'Status'
    ];
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
            order.itemCount,
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