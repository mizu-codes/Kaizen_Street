const pageNotFound = (req, res) => {
    try {
        return res.status(404).render('page-404');
    } catch (error) {
        console.error('Error rendering 404 page:', error);
        return res.status(500).send('Server error');
    }
};


module.exports = {
    pageNotFound,
}
