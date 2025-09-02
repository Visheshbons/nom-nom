import express from 'express';

const app = express;
const port = 3000;





const orderLimit = 2;
const banLimit = 5;

const menu = [
    {
        name: 'cookies',
        price: 2.5,
    },
    {
        name: 'brownies',
        price: 2,
        custom: {
            mnms: 25,
            oreos: 25,
            sprnkles: 25,
            marshmellows: 25,
            sauces: {
                choco: 50,
                caramel: 50,
                strawberry: 50
            }
        }
    },
    {
        name: 'lemonade',
        price: 1.5
    },
    {
        name: 'gambling',
        price: 2
    }
]





app.use(express())

app.get('/', (req, res) => {
    res.render('fakedex.ejs', {
        menu,
        ...menu
    })
})

app.use((req, res, next) => {
    res.send("ERR_404_NOT_FOUND")
})

app.listen(port, () => {
    console.log(`Server is running on port ${port}`)
})