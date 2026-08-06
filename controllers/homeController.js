// Controller pattern follows the course material (MVC deck, slide 7):
// a named function, then module.exports = { ... }.
const index = (req, res) => {
    res.render('pages/home', { title: 'ברוכים הבאים' });
};

module.exports = {
    index
};
