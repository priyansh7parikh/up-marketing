const express = require ('express')
const bodyParser = require('body-parser')

const app = express();
// bodyParser.urlencoded


const port = 3000;

app.get('/',(req,res,next)=>{
    console.log(`at home`)

})

// app.post('')

app.listen(port , ()=>{
    console.log("working")
})