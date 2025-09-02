import express from 'express';

const app = express();
const port = 3000;

app.use(express.json())
app.use(express.urlencoded({ extended: true }))
app.use(express.static('public'))
app.set('view engine', 'ejs')







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
            sprinkles: 25,
            marshmallows: 25,
            mnms: 25,
            oreos: 25,
            sprinkles: 25,
            marshmallows: 25,
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

app.get('/', (req, res) => {
    res.render('index.ejs', {
        menu: menu
    })
})

app.use((req, res, next) => {
    res.send("ERR_404_NOT_FOUND")
})

app.listen(port, () => {
    console.log(`Server is running on port ${port}`)
})