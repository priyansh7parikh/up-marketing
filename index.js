const express = require('express')
const app =express()
const path =require('path')

app.use(express.static('css'));

app.get('/login',(req,res,err)=>{
    res.sendFile(path.join(__dirname, 'html/login.html'))
})

app.get('/',(req,res,err)=>{
    res.sendFile(path.join(__dirname, 'html/index.html'))
    // path.join(__dirname, '/index.html')
})

app.listen(8080,()=>{
    console.log('working')
})