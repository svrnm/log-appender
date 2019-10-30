const bcrypt = require('bcrypt')
const process = require('process')

console.log(process.argv[2], '=>', bcrypt.hashSync(process.argv[2], 10))
